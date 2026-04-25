"""Phase 4.7 — finance analytics endpoints."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.api.finance_analytics_router import (
    approval_funnel,
    spend_by_category,
    spend_by_month,
)
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def co_with_data(db_session: Session) -> dict:
    co = Company(name="P47", slug="p47")
    db_session.add(co)
    db_session.commit()
    user = User(
        company_id=co.id, email="u@p47.test", full_name="U", role="manager"
    )
    db_session.add(user)
    db_session.commit()

    db_session.add_all([
        Expense(company_id=co.id, amount=Decimal("100.00"), description="A",
                status="approved", category_code="600-01-001",
                expense_date=date(2026, 3, 5)),
        Expense(company_id=co.id, amount=Decimal("50.00"), description="B",
                status="approved", category_code="600-01-001",
                expense_date=date(2026, 3, 20)),
        Expense(company_id=co.id, amount=Decimal("200.00"), description="C",
                status="approved", category_code="700-02-001",
                expense_date=date(2026, 4, 1)),
        Expense(company_id=co.id, amount=Decimal("80.00"), description="D",
                status="submitted", category_code="600-01-001",
                expense_date=date(2026, 4, 2)),
        Expense(company_id=co.id, amount=Decimal("25.00"), description="E",
                status="rejected", category_code=None,
                expense_date=date(2026, 4, 3)),
        # leakage check
        Expense(company_id=999, amount=Decimal("9999.00"), description="leak",
                status="approved", category_code="600-01-001",
                expense_date=date(2026, 4, 4)),
    ])
    db_session.commit()
    return {"company": co, "user": user}


def test_spend_by_month_groups_and_filters_company(
    db_session: Session, co_with_data: dict
) -> None:
    resp = spend_by_month(months=12, db=db_session, current_user=co_with_data["user"])
    by_period = {b.period: b for b in resp.items}
    assert by_period["2026-03"].total == "150.00"
    assert by_period["2026-03"].count == 2
    assert by_period["2026-04"].total == "200.00"
    assert by_period["2026-04"].count == 1
    # No leakage from company_id=999
    total_sum = sum(Decimal(b.total) for b in resp.items)
    assert total_sum == Decimal("350.00")


def test_spend_by_category_orders_by_total_desc(
    db_session: Session, co_with_data: dict
) -> None:
    resp = spend_by_category(db=db_session, current_user=co_with_data["user"])
    assert [b.category_code for b in resp.items[:2]] == ["700-02-001", "600-01-001"]
    by_code = {b.category_code: b for b in resp.items}
    assert by_code["600-01-001"].total == "150.00"
    assert by_code["700-02-001"].total == "200.00"


def test_approval_funnel_returns_all_statuses(
    db_session: Session, co_with_data: dict
) -> None:
    resp = approval_funnel(db=db_session, current_user=co_with_data["user"])
    by_status = {b.status: b for b in resp.items}
    assert set(by_status.keys()) == {
        "draft", "submitted", "manager_approved", "approved", "rejected",
    }
    assert by_status["approved"].count == 3
    assert by_status["approved"].total == "350.00"
    assert by_status["submitted"].count == 1
    assert by_status["rejected"].count == 1
    assert by_status["draft"].count == 0
