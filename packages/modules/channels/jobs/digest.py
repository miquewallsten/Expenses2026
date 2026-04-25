"""Phase 1.5 — scheduled notification jobs.

Two jobs are exposed as plain callables so they can be invoked from
APScheduler, a cron runner, or unit tests without timing dependencies:

* :func:`run_daily_digest` — once per day per company, send each approver
  a summary of expenses currently in ``submitted`` status.
* :func:`run_48h_nudges` — for each expense still in ``submitted`` whose
  most recent transition into that status occurred more than 48 hours
  ago, email a nudge to every approver.

Both jobs are best-effort; failures on a single (company, recipient)
never abort the rest of the run. They reuse the existing
:func:`packages.modules.channels.service.notifier.send` idempotency key
so re-running on the same day is a no-op.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc
from sqlalchemy.orm import Session

from apps.api.config import settings
from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.channels.render import render_email
from packages.modules.channels.service.notifier import (
    NotifyRequest,
    Recipient,
    send,
)
from packages.modules.expenses.models.expense import Expense

log = logging.getLogger(__name__)

NUDGE_THRESHOLD = timedelta(hours=48)
DIGEST_EVENT_TYPE = "expense.daily_digest"
NUDGE_EVENT_TYPE = "expense.approval_nudge_48h"


def _approver_recipients(db: Session, company_id: int) -> list[tuple[User, Recipient]]:
    rows = (
        db.query(User)
        .filter(
            User.company_id == company_id,
            User.role.in_(("manager", "admin", "approver")),
            User.is_active.is_(True),
            User.email.isnot(None),
        )
        .all()
    )
    return [
        (
            u,
            Recipient(user_id=u.id, email=u.email, whatsapp=None),
        )
        for u in rows
        if u.email
    ]


def _submitter_for(db: Session, expense: Expense) -> User | None:
    """Best-effort: most recent actor that pushed the expense into submitted."""
    audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense.id,
            AuditLog.action == "status_change",
            AuditLog.detail_text.like("%→ submitted%"),
        )
        .order_by(desc(AuditLog.created_at))
        .first()
    )
    if audit is None or audit.actor_user_id is None:
        return None
    return db.get(User, audit.actor_user_id)


def _submitted_at(db: Session, expense: Expense) -> datetime | None:
    audit = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense.id,
            AuditLog.action == "status_change",
            AuditLog.detail_text.like("%→ submitted%"),
        )
        .order_by(desc(AuditLog.created_at))
        .first()
    )
    return audit.created_at if audit else expense.created_at


def _expense_link(expense: Expense) -> str:
    return f"{settings.web_base_url.rstrip('/')}/expenses/{expense.id}"


def _inbox_link() -> str:
    return f"{settings.web_base_url.rstrip('/')}/expenses?status=submitted"


def _locale_for(user: User | None) -> str:
    return getattr(user, "preferred_locale", None) or "es"


# ── Daily digest ─────────────────────────────────────────────────────────────

def run_daily_digest(db: Session, *, today: datetime | None = None) -> int:
    """Iterate every company, dispatch a digest per approver. Returns dispatch count."""
    today = today or datetime.now(tz=timezone.utc)
    sent = 0
    for company in db.query(Company).all():
        try:
            sent += _digest_for_company(db, company, today=today)
        except Exception:
            log.exception("daily digest failed for company %s", company.id)
    return sent


def _digest_for_company(db: Session, company: Company, *, today: datetime) -> int:
    approvers = _approver_recipients(db, company.id)
    if not approvers:
        return 0

    pending = (
        db.query(Expense)
        .filter(
            Expense.company_id == company.id,
            Expense.status == "submitted",
        )
        .order_by(Expense.created_at.asc())
        .all()
    )
    if not pending:
        return 0

    items = []
    for exp in pending:
        submitter = _submitter_for(db, exp)
        items.append(
            {
                "id": exp.id,
                "amount": exp.amount,
                "currency": getattr(exp, "currency", "MXN") or "MXN",
                "description": exp.description,
                "submitter_name": submitter.full_name if submitter else "—",
            }
        )

    sent = 0
    digest_key = today.strftime("%Y-%m-%d")
    for approver_user, recipient in approvers:
        ctx = {
            "approver": approver_user,
            "items": items,
            "link": _inbox_link(),
        }
        msg = render_email("daily_digest_approver", _locale_for(approver_user), ctx)
        # Encode the calendar date into event_type so idempotency dedupes
        # within a single day but allows tomorrow's run.
        rows = send(
            db,
            NotifyRequest(
                company_id=company.id,
                event_type=f"{DIGEST_EVENT_TYPE}.{digest_key}",
                resource_type="expense_digest",
                resource_id=approver_user.id,
                recipients=[recipient],
                message=msg,
                channels=("email",),
            ),
        )
        sent += len(rows)
    return sent


# ── 48h nudges ───────────────────────────────────────────────────────────────

def run_48h_nudges(db: Session, *, now: datetime | None = None) -> int:
    """Send a nudge per (expense, approver) for any submitted expense > 48h old."""
    now = now or datetime.now(tz=timezone.utc)
    cutoff = now - NUDGE_THRESHOLD

    submitted = (
        db.query(Expense)
        .filter(Expense.status == "submitted")
        .all()
    )
    sent = 0
    for exp in submitted:
        try:
            sub_at = _submitted_at(db, exp)
            if sub_at is None:
                continue
            if sub_at.tzinfo is None:
                sub_at = sub_at.replace(tzinfo=timezone.utc)
            if sub_at > cutoff:
                continue
            sent += _nudge_one(db, exp, submitted_at=sub_at)
        except Exception:
            log.exception("48h nudge failed for expense %s", exp.id)
    return sent


def _nudge_one(db: Session, expense: Expense, *, submitted_at: datetime) -> int:
    approvers = _approver_recipients(db, expense.company_id)
    if not approvers:
        return 0
    submitter = _submitter_for(db, expense)
    sent = 0
    for approver_user, recipient in approvers:
        ctx = {
            "expense": expense,
            "submitter": submitter,
            "approver": approver_user,
            "link": _expense_link(expense),
        }
        # Make submitted_at available to the template even though Expense
        # doesn't carry the column natively.
        try:
            expense.submitted_at = submitted_at  # type: ignore[attr-defined]
        except Exception:  # noqa: BLE001
            pass
        msg = render_email("approval_nudge_48h", _locale_for(approver_user), ctx)
        rows = send(
            db,
            NotifyRequest(
                company_id=expense.company_id,
                event_type=NUDGE_EVENT_TYPE,
                resource_type="expense",
                resource_id=expense.id,
                recipients=[recipient],
                message=msg,
                channels=("email",),
            ),
        )
        sent += len(rows)
    return sent
