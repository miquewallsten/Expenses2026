"""Maps domain events to notification dispatches.

Phase 1.3 — first wiring layer between business actions (expense
transitions, magic-link request) and the unified Notifier service.

Design notes:

* All dispatch helpers swallow exceptions and log to stderr. A failure to
  notify must never break the underlying business transaction.
* Recipient resolution is intentionally simple in v1; can be replaced with
  Role/Permission lookups later without changing call-sites.
* All paths render with :func:`packages.modules.channels.render.render_email`
  using the recipient's preferred locale (falls back to ``es``).
* Idempotency is provided by ``NotificationDispatch`` unique constraint.
"""

from __future__ import annotations

import logging
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from apps.api.config import settings
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.channels.render import render_email
from packages.modules.channels.service.notifier import (
    NotifyRequest,
    Recipient,
    recipients_from_users,
    send,
)

log = logging.getLogger(__name__)

# Roles that should receive expense-submitted notifications until a richer
# permission model lands.
_APPROVER_ROLES = ("manager", "admin", "approver")


# ── Recipient resolvers ──────────────────────────────────────────────────────

def _resolve_company_approvers(db: Session, company_id: int) -> list[Recipient]:
    rows = db.execute(
        select(User).where(
            User.company_id == company_id,
            User.is_active.is_(True),
            User.role.in_(_APPROVER_ROLES),
        )
    ).scalars().all()
    return recipients_from_users(rows)


def _resolve_submitter(db: Session, expense) -> User | None:
    """Look up the user who first transitioned this expense to ``submitted``.

    We don't have ``Expense.submitter_id`` yet, so this reads the audit log
    for the most recent ``draft → submitted`` event and returns its actor.
    Returns None if no submission has been recorded.
    """
    row = db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense.id,
            AuditLog.action == "status_change",
            AuditLog.detail_text.like("%→ submitted%"),
            AuditLog.actor_user_id.is_not(None),
        ).order_by(AuditLog.id.desc())
    ).scalars().first()
    if row is None or row.actor_user_id is None:
        return None
    return db.get(User, row.actor_user_id)


# ── Public dispatchers ───────────────────────────────────────────────────────

def notify_status_change(
    db: Session,
    expense,
    old_status: str,
    new_status: str,
    actor_user_id: int | None,
) -> None:
    """Fan out notifications for an expense status transition.

    Best-effort: any internal failure is logged but never re-raised.
    """
    try:
        if old_status in ("draft", "rejected") and new_status == "submitted":
            _notify_submitted(db, expense, submitter_id=actor_user_id)
        elif new_status == "rejected":
            _notify_rejected(db, expense, actor_user_id=actor_user_id)
        elif new_status == "draft" and old_status in (
            "submitted",
            "manager_approved",
        ):
            _notify_returned(db, expense, actor_user_id=actor_user_id)
        elif new_status in ("manager_approved", "approved"):
            _notify_approved(db, expense, actor_user_id=actor_user_id)
    except Exception:  # pragma: no cover — defensive
        log.exception(
            "event_router: failed to dispatch notifications for expense %s "
            "(%s → %s)",
            getattr(expense, "id", None),
            old_status,
            new_status,
        )


def _expense_link(expense) -> str:
    return f"{settings.web_base_url.rstrip('/')}/expenses/{expense.id}"


def _ctx_for_expense(expense, *, submitter: User | None, approver: User | None, **extra) -> dict:
    return {
        "expense": expense,
        "submitter": submitter,
        "approver": approver,
        "link": _expense_link(expense),
        **extra,
    }


def _notify_submitted(db: Session, expense, submitter_id: int | None) -> None:
    submitter = db.get(User, submitter_id) if submitter_id else None
    approvers = _resolve_company_approvers(db, expense.company_id)
    if not approvers:
        return
    # Lazy import to avoid circular dependency on apps.api.config at import.
    from packages.modules.channels.service.action_links import (
        create_action_token,
    )

    for approver_recipient in approvers:
        approver_user = (
            db.get(User, approver_recipient.user_id)
            if approver_recipient.user_id
            else None
        )
        approve_link = _expense_link(expense)
        if approver_user is not None:
            try:
                approve_token, _row = create_action_token(
                    db,
                    user_id=approver_user.id,
                    company_id=expense.company_id,
                    action="approve",
                    resource_type="expense",
                    resource_id=expense.id,
                )
                approve_link = (
                    f"{settings.web_base_url.rstrip('/')}"
                    f"/channels/action/{approve_token}"
                )
            except Exception:
                log.exception(
                    "Failed to mint approve token for approver %s expense %s",
                    approver_user.id,
                    expense.id,
                )
                approve_link = _expense_link(expense)

            reject_link = _expense_link(expense)
            if approver_user is not None:
                try:
                    reject_token, _row = create_action_token(
                        db,
                        user_id=approver_user.id,
                        company_id=expense.company_id,
                        action="reject",
                        resource_type="expense",
                        resource_id=expense.id,
                    )
                    reject_link = (
                        f"{settings.web_base_url.rstrip('/')}"
                        f"/channels/action/{reject_token}"
                    )
                except Exception:
                    log.exception(
                        "Failed to mint reject token for approver %s expense %s",
                        approver_user.id,
                        expense.id,
                    )
        ctx = _ctx_for_expense(
            expense, submitter=submitter, approver=approver_user, link=approve_link
        )
        msg = render_email(
            "expense_submitted_to_approver", _locale_for(approver_user), ctx
        )

        # Build WhatsApp-specific text with inline approve/reject links
        wa_amount = f"${float(expense.amount):,.2f}" if expense.amount else "—"
        wa_lines = [
            "📋 *Gasto pendiente de aprobación*",
            f"#{expense.id} — {wa_amount}",
            getattr(expense, 'description', '') or '',
        ]
        if approve_link and approve_link != _expense_link(expense):
            wa_lines.append(f"✅ Aprobar: {approve_link}")
        if reject_link and reject_link != _expense_link(expense):
            wa_lines.append(f"❌ Rechazar: {reject_link}")
        msg.whatsapp_text = "\n".join(wa_lines)

        # Send via both email and WhatsApp (WhatsApp only if user has verified phone)
        channels = ("email", "whatsapp") if (
            approver_recipient.whatsapp and approver_user
            and getattr(approver_user, 'whatsapp_verified', False)
        ) else ("email",)

        send(
            db,
            NotifyRequest(
                company_id=expense.company_id,
                event_type="expense.submitted",
                resource_type="expense",
                resource_id=expense.id,
                recipients=[approver_recipient],
                message=msg,
                channels=channels,
            ),
        )


def _notify_approved(db: Session, expense, actor_user_id: int | None) -> None:
    submitter = _resolve_submitter(db, expense)
    if submitter is None:
        return
    approver = db.get(User, actor_user_id) if actor_user_id else None
    ctx = _ctx_for_expense(expense, submitter=submitter, approver=approver)
    msg = render_email("expense_approved_to_submitter", _locale_for(submitter), ctx)
    send(
        db,
        NotifyRequest(
            company_id=expense.company_id,
            event_type="expense.approved",
            resource_type="expense",
            resource_id=expense.id,
            recipients=recipients_from_users([submitter]),
            message=msg,
            channels=("email",),
        ),
    )


def _notify_rejected(db: Session, expense, actor_user_id: int | None) -> None:
    submitter = _resolve_submitter(db, expense)
    if submitter is None:
        return
    approver = db.get(User, actor_user_id) if actor_user_id else None
    ctx = _ctx_for_expense(
        expense, submitter=submitter, approver=approver, reason=expense.notes or "—"
    )
    msg = render_email("expense_rejected_to_submitter", _locale_for(submitter), ctx)
    send(
        db,
        NotifyRequest(
            company_id=expense.company_id,
            event_type="expense.rejected",
            resource_type="expense",
            resource_id=expense.id,
            recipients=recipients_from_users([submitter]),
            message=msg,
            channels=("email",),
        ),
    )


def _notify_returned(db: Session, expense, actor_user_id: int | None) -> None:
    submitter = _resolve_submitter(db, expense)
    if submitter is None:
        return
    approver = db.get(User, actor_user_id) if actor_user_id else None
    ctx = _ctx_for_expense(
        expense, submitter=submitter, approver=approver, comment=expense.notes or "—"
    )
    msg = render_email("expense_returned_to_submitter", _locale_for(submitter), ctx)
    send(
        db,
        NotifyRequest(
            company_id=expense.company_id,
            event_type="expense.returned",
            resource_type="expense",
            resource_id=expense.id,
            recipients=recipients_from_users([submitter]),
            message=msg,
            channels=("email",),
        ),
    )


# ── Magic-link ───────────────────────────────────────────────────────────────

def notify_magic_link(
    db: Session,
    user: User,
    *,
    link: str,
    ttl_minutes: int,
    token_id: int,
) -> list:
    """Send a magic-link email through the unified Notifier.
    
    Returns list of NotificationDispatch rows that were created/sent.
    """
    try:
        ctx = {"user": user, "link": link, "ttl_minutes": ttl_minutes}
        msg = render_email("magic_link", _locale_for(user), ctx)
        return send(
            db,
            NotifyRequest(
                company_id=user.company_id,
                event_type="auth.magic_link",
                resource_type="magic_link_token",
                resource_id=token_id,
                recipients=recipients_from_users([user]),
                message=msg,
                channels=("email",),
            ),
        )
    except Exception:  # pragma: no cover — defensive
        log.exception("event_router: failed to send magic-link email")
        return []


# ── Locale helper ────────────────────────────────────────────────────────────

def _locale_for(user: User | None) -> str:
    """Return the user's preferred locale; default to es."""
    if user is None:
        return "es"
    return getattr(user, "preferred_locale", None) or "es"
