"""Phase 1.5 — daily digest + 48h nudge jobs."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.channels.jobs.digest import (
    NUDGE_EVENT_TYPE,
    run_48h_nudges,
    run_daily_digest,
)
from packages.modules.channels.models import (
    ChannelSettings,
    NotificationDispatch,
)
from packages.modules.channels.service import notifier as notifier_mod
from packages.modules.expenses.models.expense import Expense


class _StubSMTP:
    sent: list = []

    def __init__(self, *_a, **_k):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_a):
        return False

    def starttls(self): pass
    def login(self, *_a, **_k): pass
    def send_message(self, msg, *_a, **_k):
        type(self).sent.append(msg)


@pytest.fixture(autouse=True)
def _smtp_stub(monkeypatch):
    _StubSMTP.sent = []
    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _StubSMTP)
    yield


def _seed(db: Session) -> dict:
    company = Company(name="Acme", slug="acme")
    db.add(company)
    db.commit()

    db.add(
        ChannelSettings(
            company_id=company.id,
            channel="email",
            email_smtp_host="smtp.test",
            email_smtp_port=587,
            email_smtp_user="bot",
            email_smtp_password="pw",
            email_smtp_from="bot@acme.test",
        )
    )

    approver = User(
        company_id=company.id,
        email="boss@acme.test",
        full_name="Boss",
        role="manager",
    )
    submitter = User(
        company_id=company.id,
        email="ana@acme.test",
        full_name="Ana",
        role="employee",
    )
    db.add_all([approver, submitter])
    db.commit()

    expense = Expense(
        company_id=company.id,
        amount=Decimal("123.00"),
        description="Taxi",
        status="submitted",
    )
    db.add(expense)
    db.commit()

    # Audit log: Ana submitted this expense.
    db.add(
        AuditLog(
            company_id=company.id,
            entity_type="expense",
            entity_id=expense.id,
            action="status_change",
            actor_user_id=submitter.id,
            detail_text="draft → submitted",
        )
    )
    db.commit()

    return {
        "company": company,
        "approver": approver,
        "submitter": submitter,
        "expense": expense,
    }


# ── Daily digest ─────────────────────────────────────────────────────────────


def test_digest_dispatches_one_email_per_approver(db_session: Session) -> None:
    s = _seed(db_session)
    sent = run_daily_digest(db_session, today=datetime(2026, 1, 15, tzinfo=timezone.utc))
    assert sent == 1
    rows = db_session.query(NotificationDispatch).all()
    assert len(rows) == 1
    assert rows[0].recipient_user_id == s["approver"].id
    assert rows[0].event_type.startswith("expense.daily_digest.")


def test_digest_idempotent_within_same_day(db_session: Session) -> None:
    _seed(db_session)
    today = datetime(2026, 1, 15, tzinfo=timezone.utc)
    run_daily_digest(db_session, today=today)
    run_daily_digest(db_session, today=today)
    rows = db_session.query(NotificationDispatch).all()
    assert len(rows) == 1


def test_digest_fires_again_next_day(db_session: Session) -> None:
    _seed(db_session)
    run_daily_digest(db_session, today=datetime(2026, 1, 15, tzinfo=timezone.utc))
    run_daily_digest(db_session, today=datetime(2026, 1, 16, tzinfo=timezone.utc))
    rows = db_session.query(NotificationDispatch).all()
    assert len(rows) == 2


def test_digest_skips_when_no_pending(db_session: Session) -> None:
    s = _seed(db_session)
    s["expense"].status = "approved"
    db_session.commit()
    sent = run_daily_digest(db_session)
    assert sent == 0


# ── 48h nudges ───────────────────────────────────────────────────────────────


def test_nudge_skips_recent_submissions(db_session: Session) -> None:
    _seed(db_session)
    sent = run_48h_nudges(db_session, now=datetime.now(tz=timezone.utc))
    assert sent == 0


def test_nudge_fires_after_48h(db_session: Session) -> None:
    s = _seed(db_session)
    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == s["expense"].id)
        .first()
    )
    audit.created_at = datetime.now(tz=timezone.utc) - timedelta(hours=72)
    db_session.commit()

    sent = run_48h_nudges(db_session)
    assert sent == 1
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == NUDGE_EVENT_TYPE)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].recipient_user_id == s["approver"].id


def test_nudge_idempotent_per_expense_per_approver(db_session: Session) -> None:
    s = _seed(db_session)
    audit = (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_id == s["expense"].id)
        .first()
    )
    audit.created_at = datetime.now(tz=timezone.utc) - timedelta(hours=72)
    db_session.commit()

    run_48h_nudges(db_session)
    run_48h_nudges(db_session)
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == NUDGE_EVENT_TYPE)
        .all()
    )
    assert len(rows) == 1
