"""Phase 4.4 — bulk transition endpoint."""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.api.review_actions_router import (
    BulkTransitionRequest,
    bulk_transition,
)
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.transition_service import submit_expense


def _make_setup(db: Session, monkeypatch) -> dict:
    from packages.modules.admin.service.approval_setup_service import (
        get_or_create_approval_setup,
    )
    from packages.modules.admin.service.company_setup_service import (
        get_or_create_company_setup,
    )
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

    company = Company(name="P44", slug="p44")
    db.add(company)
    db.commit()
    submitter = User(
        email="s@p44.test", full_name="S", role="user", company_id=company.id
    )
    manager = User(
        email="m@p44.test", full_name="M", role="manager", company_id=company.id
    )
    db.add_all([submitter, manager])
    db.commit()

    cs = get_or_create_company_setup(db, company.id)
    cs.has_managers = True
    ap = get_or_create_approval_setup(db, company.id)
    ap.approval_mode = "manager_only"
    ap.allow_resubmission_after_rejection = True
    db.commit()

    return {"company": company, "submitter": submitter, "manager": manager}


@pytest.fixture
def submitted_batch(db_session: Session, monkeypatch) -> dict:
    fixt = _make_setup(db_session, monkeypatch)
    expenses: list[Expense] = []
    for i in range(3):
        e = Expense(
            company_id=fixt["company"].id,
            amount=Decimal("10.00") * (i + 1),
            description=f"Receipt {i}",
            status="draft",
        )
        db_session.add(e)
        db_session.commit()
        submit_expense(db_session, e, actor_user_id=fixt["submitter"].id)
        expenses.append(e)
    fixt["expenses"] = expenses
    return fixt


def test_bulk_manager_approve_all_succeed(
    db_session: Session, submitted_batch: dict
) -> None:
    body = BulkTransitionRequest(
        action="manager_approve",
        expense_ids=[e.id for e in submitted_batch["expenses"]],
    )
    resp = bulk_transition(
        body=body, db=db_session, current_user=submitted_batch["manager"]
    )
    assert resp.succeeded == 3
    assert resp.failed == 0
    for r in resp.results:
        assert r.ok and r.status == "approved"


def test_bulk_dedups_repeated_ids(
    db_session: Session, submitted_batch: dict
) -> None:
    e0 = submitted_batch["expenses"][0].id
    body = BulkTransitionRequest(
        action="manager_approve", expense_ids=[e0, e0, e0]
    )
    resp = bulk_transition(
        body=body, db=db_session, current_user=submitted_batch["manager"]
    )
    assert len(resp.results) == 1
    assert resp.succeeded == 1


def test_bulk_unknown_action_returns_400(
    db_session: Session, submitted_batch: dict
) -> None:
    from fastapi import HTTPException

    body = BulkTransitionRequest(action="not_a_real_action", expense_ids=[1])
    with pytest.raises(HTTPException) as excinfo:
        bulk_transition(
            body=body, db=db_session, current_user=submitted_batch["manager"]
        )
    assert excinfo.value.status_code == 400


def test_bulk_cross_company_id_marked_failed(
    db_session: Session, submitted_batch: dict
) -> None:
    foreign = Expense(
        company_id=999, amount=Decimal("5.00"), description="leak",
        status="submitted",
    )
    db_session.add(foreign)
    db_session.commit()

    body = BulkTransitionRequest(
        action="manager_approve",
        expense_ids=[submitted_batch["expenses"][0].id, foreign.id],
    )
    resp = bulk_transition(
        body=body, db=db_session, current_user=submitted_batch["manager"]
    )
    assert resp.succeeded == 1
    assert resp.failed == 1
    failed = [r for r in resp.results if not r.ok][0]
    assert failed.expense_id == foreign.id


def test_bulk_reject_requires_comment_validates_per_item(
    db_session: Session, submitted_batch: dict
) -> None:
    body = BulkTransitionRequest(
        action="manager_reject",
        expense_ids=[e.id for e in submitted_batch["expenses"]],
        comment=None,
    )
    resp = bulk_transition(
        body=body, db=db_session, current_user=submitted_batch["manager"]
    )
    assert resp.succeeded == 0
    assert resp.failed == 3
    assert all(r.error for r in resp.results)


def test_bulk_reject_with_comment_succeeds(
    db_session: Session, submitted_batch: dict
) -> None:
    body = BulkTransitionRequest(
        action="manager_reject",
        expense_ids=[e.id for e in submitted_batch["expenses"]],
        comment="Missing receipts in batch",
    )
    resp = bulk_transition(
        body=body, db=db_session, current_user=submitted_batch["manager"]
    )
    assert resp.succeeded == 3
    assert resp.failed == 0
    assert all(r.status == "rejected" for r in resp.results)
