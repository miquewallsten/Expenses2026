"""Phase 4.9 — GET /audit/expense/{id} (per-expense audit trail)."""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.api.audit import get_expense_audit
from packages.core.platform.models import Company
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def co_with_expense(db_session: Session) -> dict:
    co = Company(name="A", slug="a-49")
    db_session.add(co)
    db_session.commit()
    user = User(
        company_id=co.id, email="u@a.test", full_name="U", role="manager"
    )
    db_session.add(user)
    db_session.commit()
    expense = Expense(
        company_id=co.id, amount=Decimal("10.00"), description="x", status="approved"
    )
    db_session.add(expense)
    db_session.commit()
    return {"company": co, "user": user, "expense": expense}


def _seed_audits(db: Session, expense_id: int, n: int) -> None:
    for i in range(n):
        db.add(
            AuditLog(
                entity_type="expense",
                entity_id=expense_id,
                action=f"action_{i}",
                detail_text=f"detail {i}",
                actor_user_id=None,
            )
        )
    db.commit()


def test_returns_only_expense_entries_newest_first(
    db_session: Session, co_with_expense: dict
) -> None:
    expense = co_with_expense["expense"]
    _seed_audits(db_session, expense.id, 3)
    db_session.add(
        AuditLog(
            entity_type="other_thing",
            entity_id=expense.id,
            action="noise",
            detail_text="should not appear",
        )
    )
    db_session.commit()

    page = get_expense_audit(
        expense_id=expense.id,
        cursor=None,
        limit=50,
        db=db_session,
        current_user=co_with_expense["user"],
    )
    assert page.next_cursor is None
    assert [i.action for i in page.items] == ["action_2", "action_1", "action_0"]


def test_pagination_via_cursor(
    db_session: Session, co_with_expense: dict
) -> None:
    expense = co_with_expense["expense"]
    _seed_audits(db_session, expense.id, 5)

    p1 = get_expense_audit(
        expense_id=expense.id,
        cursor=None,
        limit=2,
        db=db_session,
        current_user=co_with_expense["user"],
    )
    assert len(p1.items) == 2
    assert p1.next_cursor is not None

    p2 = get_expense_audit(
        expense_id=expense.id,
        cursor=p1.next_cursor,
        limit=2,
        db=db_session,
        current_user=co_with_expense["user"],
    )
    assert len(p2.items) == 2
    p1_ids = {i.id for i in p1.items}
    p2_ids = {i.id for i in p2.items}
    assert p1_ids.isdisjoint(p2_ids)


def test_cross_company_returns_404(
    db_session: Session, co_with_expense: dict
) -> None:
    from fastapi import HTTPException

    other_co = Company(name="B", slug="b-49")
    db_session.add(other_co)
    db_session.commit()
    other_user = User(
        company_id=other_co.id, email="o@b.test", full_name="O", role="manager"
    )
    db_session.add(other_user)
    db_session.commit()

    with pytest.raises(HTTPException) as excinfo:
        get_expense_audit(
            expense_id=co_with_expense["expense"].id,
            cursor=None,
            limit=50,
            db=db_session,
            current_user=other_user,
        )
    assert excinfo.value.status_code == 404
