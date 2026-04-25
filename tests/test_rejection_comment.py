"""Phase 4.5 — approver comment on rejection.

Service-level + audit-log assertions. We reuse the `submitted_expense` fixture
from test_event_router (same pattern: stubs SMTP and submits a fresh expense)
by rebuilding it locally so this file is self-contained.
"""

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.transition_service import (
    MIN_REJECTION_COMMENT_LEN,
    accounting_reject_expense,
    manager_reject_expense,
    manager_return_expense,
    submit_expense,
)


def _make_company_with_managers(db_session: Session) -> dict:
    """Manager-only approval setup so manager_* transitions are enabled."""
    from packages.modules.admin.service.approval_setup_service import (
        get_or_create_approval_setup,
    )
    from packages.modules.admin.service.company_setup_service import (
        get_or_create_company_setup,
    )

    company = Company(name="Phase 4.5 Co", slug="phase45")
    db_session.add(company)
    db_session.commit()

    submitter = User(
        email="submitter@example.com",
        full_name="S",
        role="user",
        company_id=company.id,
    )
    approver = User(
        email="approver@example.com",
        full_name="A",
        role="manager",
        company_id=company.id,
    )
    db_session.add_all([submitter, approver])
    db_session.commit()

    cs = get_or_create_company_setup(db_session, company.id)
    cs.has_managers = True
    approval = get_or_create_approval_setup(db_session, company.id)
    approval.approval_mode = "manager_only"
    approval.allow_resubmission_after_rejection = True
    db_session.commit()

    return {"company": company, "submitter": submitter, "approver": approver}


@pytest.fixture
def submitted(db_session: Session, monkeypatch) -> dict:
    from packages.modules.channels.service import notifier as notifier_mod

    class _StubSMTP:
        def __init__(self, *_a, **_k): pass
        def __enter__(self): return self
        def __exit__(self, *_a): return False
        def starttls(self): pass
        def login(self, *_a, **_k): pass
        def send_message(self, *_a, **_k): pass
        def sendmail(self, *_a, **_k): pass

    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _StubSMTP)

    fixt = _make_company_with_managers(db_session)
    expense = Expense(
        company_id=fixt["company"].id,
        amount=Decimal("50.00"),
        description="Office supplies",
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()
    submit_expense(db_session, expense, actor_user_id=fixt["submitter"].id)
    fixt["expense"] = expense
    return fixt


def _audit_for(db_session: Session, expense_id: int) -> list[AuditLog]:
    return (
        db_session.query(AuditLog)
        .filter(AuditLog.entity_type == "expense", AuditLog.entity_id == expense_id)
        .order_by(AuditLog.id.asc())
        .all()
    )


def test_manager_reject_without_comment_raises(submitted: dict, db_session: Session) -> None:
    with pytest.raises(ValueError, match="at least"):
        manager_reject_expense(
            db_session,
            submitted["expense"],
            actor_user_id=submitted["approver"].id,
        )
    # Status unchanged, no rejection audit row written.
    db_session.refresh(submitted["expense"])
    assert submitted["expense"].status == "submitted"


def test_manager_reject_with_short_comment_raises(submitted: dict, db_session: Session) -> None:
    short = "x" * (MIN_REJECTION_COMMENT_LEN - 1)
    with pytest.raises(ValueError):
        manager_reject_expense(
            db_session,
            submitted["expense"],
            actor_user_id=submitted["approver"].id,
            comment=short,
        )


def test_manager_reject_with_whitespace_comment_raises(submitted: dict, db_session: Session) -> None:
    with pytest.raises(ValueError):
        manager_reject_expense(
            db_session,
            submitted["expense"],
            actor_user_id=submitted["approver"].id,
            comment="   \n  ",
        )


def test_manager_reject_with_valid_comment_succeeds_and_audits(
    submitted: dict, db_session: Session
) -> None:
    comment = "Receipt is missing — please attach a CFDI."
    manager_reject_expense(
        db_session,
        submitted["expense"],
        actor_user_id=submitted["approver"].id,
        comment=comment,
    )
    db_session.refresh(submitted["expense"])
    assert submitted["expense"].status == "rejected"
    audit_rows = _audit_for(db_session, submitted["expense"].id)
    rejection = [a for a in audit_rows if "rejected" in (a.detail_text or "")]
    assert rejection, "expected an audit row for the rejection"
    assert comment in rejection[-1].detail_text


def test_manager_return_accepts_optional_comment(submitted: dict, db_session: Session) -> None:
    # No comment — allowed.
    manager_return_expense(
        db_session,
        submitted["expense"],
        actor_user_id=submitted["approver"].id,
    )
    db_session.refresh(submitted["expense"])
    assert submitted["expense"].status == "draft"


def test_accounting_reject_also_requires_comment(
    submitted: dict, db_session: Session
) -> None:
    # Switch the company to manager_then_accounting + enable accounting flow,
    # then advance the expense to manager_approved so accounting can act.
    from packages.modules.admin.service.accounting_setup_service import (
        get_or_create_accounting_setup,
    )
    from packages.modules.admin.service.approval_setup_service import (
        get_or_create_approval_setup,
    )
    from packages.modules.admin.service.company_setup_service import (
        get_or_create_company_setup,
    )
    from packages.modules.expenses.service.transition_service import (
        manager_approve_expense,
    )

    company_id = submitted["company"].id
    approval = get_or_create_approval_setup(db_session, company_id)
    approval.approval_mode = "manager_then_accounting"
    cs = get_or_create_company_setup(db_session, company_id)
    cs.accounting_module_enabled = True
    acct = get_or_create_accounting_setup(db_session, company_id)
    acct.accounting_review_mode = "all"
    db_session.commit()

    manager_approve_expense(
        db_session,
        submitted["expense"],
        actor_user_id=submitted["approver"].id,
    )
    db_session.refresh(submitted["expense"])
    assert submitted["expense"].status == "manager_approved"

    with pytest.raises(ValueError, match="at least"):
        accounting_reject_expense(
            db_session,
            submitted["expense"],
            actor_user_id=submitted["approver"].id,
        )

    accounting_reject_expense(
        db_session,
        submitted["expense"],
        actor_user_id=submitted["approver"].id,
        comment="Category mismatch with policy.",
    )
    db_session.refresh(submitted["expense"])
    assert submitted["expense"].status == "rejected"
