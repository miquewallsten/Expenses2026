"""Phase 1.3 — verify transitions emit notifications and magic-link routes through Notifier."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.channels.models import (
    ChannelSettings,
    NotificationDispatch,
)
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.transition_service import (
    submit_expense,
    manager_approve_expense,
    manager_reject_expense,
    manager_return_expense,
)


@pytest.fixture
def company_with_users(db_session: Session) -> dict:
    # Lazy import to avoid cycles in test collection.
    from packages.core.platform.models import Company

    company = Company(name="Acme", slug="acme")
    db_session.add(company)
    db_session.commit()

    submitter = User(
        company_id=company.id,
        email="ana@acme.test",
        full_name="Ana López",
        role="employee",
    )
    approver = User(
        company_id=company.id,
        email="boss@acme.test",
        full_name="Boss",
        role="manager",
    )
    db_session.add_all([submitter, approver])
    db_session.commit()

    # SMTP config so the email path doesn't auto-suppress.
    db_session.add(
        ChannelSettings(
            company_id=company.id,
            channel="email",
            email_smtp_host="smtp.example.com",
            email_smtp_port=587,
            email_smtp_user="acme",
            email_smtp_password="x",
            email_smtp_from="no-reply@acme.test",
        )
    )
    db_session.commit()

    # Enable manager approval flow so transition_service allows manager_*.
    from packages.modules.admin.service.company_setup_service import (
        get_or_create_company_setup,
    )
    from packages.modules.admin.service.approval_setup_service import (
        get_or_create_approval_setup,
    )

    cs = get_or_create_company_setup(db_session, company.id)
    cs.has_managers = True
    ap = get_or_create_approval_setup(db_session, company.id)
    ap.approval_mode = "manager_only"
    db_session.commit()

    return {"company": company, "submitter": submitter, "approver": approver}


@pytest.fixture
def submitted_expense(
    db_session: Session, company_with_users: dict, monkeypatch
) -> Expense:
    """Create a draft expense and submit it. Stub SMTP so notifier 'sends' OK."""
    from packages.modules.channels.service import notifier as notifier_mod

    class _StubSMTP:
        def __init__(self, *_a, **_k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def starttls(self): pass
        def login(self, *_a, **_k): pass
        def send_message(self, *_a, **_k): pass
        def sendmail(self, *_a, **_k): pass

    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _StubSMTP)

    expense = Expense(
        company_id=company_with_users["company"].id,
        amount=Decimal("100.00"),
        description="Lunch",
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()

    submit_expense(
        db_session,
        expense,
        actor_user_id=company_with_users["submitter"].id,
    )
    return expense


def test_submit_dispatches_to_approvers(
    db_session: Session, company_with_users: dict, submitted_expense: Expense
) -> None:
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == "expense.submitted")
        .all()
    )
    assert len(rows) == 1
    row = rows[0]
    assert row.recipient_user_id == company_with_users["approver"].id
    assert row.channel == "email"
    assert row.resource_id == submitted_expense.id


def test_approve_dispatches_to_submitter(
    db_session: Session, company_with_users: dict, submitted_expense: Expense
) -> None:
    manager_approve_expense(
        db_session,
        submitted_expense,
        actor_user_id=company_with_users["approver"].id,
    )
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == "expense.approved")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].recipient_user_id == company_with_users["submitter"].id


def test_reject_dispatches_rejection_to_submitter(
    db_session: Session, company_with_users: dict, submitted_expense: Expense
) -> None:
    manager_reject_expense(
        db_session,
        submitted_expense,
        actor_user_id=company_with_users["approver"].id,
        comment="Missing receipt; please attach.",
    )
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == "expense.rejected")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].recipient_user_id == company_with_users["submitter"].id


def test_return_dispatches_returned_to_submitter(
    db_session: Session, company_with_users: dict, submitted_expense: Expense
) -> None:
    manager_return_expense(
        db_session,
        submitted_expense,
        actor_user_id=company_with_users["approver"].id,
    )
    rows = (
        db_session.query(NotificationDispatch)
        .filter(NotificationDispatch.event_type == "expense.returned")
        .all()
    )
    assert len(rows) == 1
    assert rows[0].recipient_user_id == company_with_users["submitter"].id


def test_notification_failure_does_not_break_transition(
    db_session: Session, company_with_users: dict, monkeypatch
) -> None:
    """If notifier blows up, the expense transition still commits."""
    from packages.modules.channels.service import event_router

    def _boom(*_a, **_k):
        raise RuntimeError("kaboom")

    monkeypatch.setattr(event_router, "notify_status_change", _boom)

    expense = Expense(
        company_id=company_with_users["company"].id,
        amount=Decimal("50.00"),
        description="Test",
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()

    submit_expense(
        db_session,
        expense,
        actor_user_id=company_with_users["submitter"].id,
    )
    db_session.refresh(expense)
    assert expense.status == "submitted"


def test_audit_log_records_transition_actor(
    db_session: Session, company_with_users: dict, submitted_expense: Expense
) -> None:
    """Sanity: submitter discovery leans on audit log; verify the row exists."""
    rows = (
        db_session.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == submitted_expense.id,
            AuditLog.action == "status_change",
        )
        .all()
    )
    assert any(r.actor_user_id == company_with_users["submitter"].id for r in rows)
