"""Phase 4.7 — Finance analytics endpoints.

All queries scope to the caller's company_id and return pre-aggregated JSON
shaped for charts. No raw expenses are returned.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense

router = APIRouter(prefix="/analytics/finance", tags=["analytics"])


def _zero() -> Decimal:
    return Decimal("0.00")


def _to_money(value: object) -> str:
    if value is None:
        return "0.00"
    return f"{Decimal(str(value)):.2f}"


# ── Spend by month ────────────────────────────────────────────────────────────


class MonthlySpendBucket(BaseModel):
    period: str
    total: str
    count: int


class MonthlySpendResponse(BaseModel):
    items: list[MonthlySpendBucket]


@router.get("/spend-by-month", response_model=MonthlySpendResponse)
def spend_by_month(
    months: int = Query(default=12, ge=1, le=36),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MonthlySpendResponse:
    period = func.strftime("%Y-%m", Expense.expense_date) if db.bind.dialect.name == "sqlite" else func.to_char(Expense.expense_date, "YYYY-MM")
    rows = (
        db.query(
            period.label("period"),
            func.coalesce(func.sum(Expense.amount), 0).label("total"),
            func.count(Expense.id).label("count"),
        )
        .filter(
            Expense.company_id == current_user.company_id,
            Expense.status == "approved",
            Expense.expense_date.is_not(None),
        )
        .group_by("period")
        .order_by("period")
        .all()
    )
    items = [
        MonthlySpendBucket(period=r.period, total=_to_money(r.total), count=int(r.count))
        for r in rows
        if r.period is not None
    ]
    return MonthlySpendResponse(items=items[-months:])


# ── Spend by category ────────────────────────────────────────────────────────


class CategoryBucket(BaseModel):
    category_code: str | None
    total: str
    count: int


class CategoryBreakdownResponse(BaseModel):
    items: list[CategoryBucket]


@router.get("/spend-by-category", response_model=CategoryBreakdownResponse)
def spend_by_category(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CategoryBreakdownResponse:
    rows = (
        db.query(
            Expense.category_code.label("category_code"),
            func.coalesce(func.sum(Expense.amount), 0).label("total"),
            func.count(Expense.id).label("count"),
        )
        .filter(
            Expense.company_id == current_user.company_id,
            Expense.status == "approved",
        )
        .group_by(Expense.category_code)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )
    items = [
        CategoryBucket(
            category_code=r.category_code,
            total=_to_money(r.total),
            count=int(r.count),
        )
        for r in rows
    ]
    return CategoryBreakdownResponse(items=items)


# ── Approval funnel ──────────────────────────────────────────────────────────


class FunnelBucket(BaseModel):
    status: str
    count: int
    total: str


class ApprovalFunnelResponse(BaseModel):
    items: list[FunnelBucket]


_FUNNEL_ORDER = ("draft", "submitted", "manager_approved", "approved", "rejected")


@router.get("/approval-funnel", response_model=ApprovalFunnelResponse)
def approval_funnel(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ApprovalFunnelResponse:
    rows = (
        db.query(
            Expense.status.label("status"),
            func.count(Expense.id).label("count"),
            func.coalesce(func.sum(Expense.amount), 0).label("total"),
        )
        .filter(Expense.company_id == current_user.company_id)
        .group_by(Expense.status)
        .all()
    )
    by_status = {r.status: r for r in rows}
    items: list[FunnelBucket] = []
    for s in _FUNNEL_ORDER:
        r = by_status.get(s)
        items.append(
            FunnelBucket(
                status=s,
                count=int(r.count) if r else 0,
                total=_to_money(r.total) if r else "0.00",
            )
        )
    return ApprovalFunnelResponse(items=items)
