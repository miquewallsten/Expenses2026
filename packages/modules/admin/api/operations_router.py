"""Admin Operations dashboard — live app metrics (expense pipeline, reports, approvals)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func as sa_func, extract, case
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense

router = APIRouter(
    prefix="/admin/operations",
    tags=["admin-operations"],
    dependencies=[Depends(require_admin)],
)


@router.get("/{company_id}")
def operations_dashboard(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    this_month = now.month
    this_year = now.year

    # ── Expense counts by status ──────────────────────────────────────────
    status_counts = (
        db.query(Expense.status, sa_func.count(Expense.id), sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(Expense.company_id == company_id)
        .group_by(Expense.status)
        .all()
    )
    by_status: dict[str, dict] = {}
    for status, count, total in status_counts:
        by_status[status] = {"count": count, "amount": float(total)}

    # ── Verified expenses not yet in a report (expense_report_id is null AND status >= manager_approved) ──
    verified_unreported = (
        db.query(sa_func.count(Expense.id), sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(["manager_approved", "approved"]),
            Expense.report_id.is_(None),
        )
        .first()
    )
    unreported_count = verified_unreported[0] or 0
    unreported_amount = float(verified_unreported[1] or 0)

    # ── Expenses in expense reports ───────────────────────────────────────
    in_report = (
        db.query(sa_func.count(Expense.id), sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.report_id.isnot(None),
        )
        .first()
    )
    in_report_count = in_report[0] or 0
    in_report_amount = float(in_report[1] or 0)

    # ── This month's activity ────────────────────────────────────────────
    month_created = (
        db.query(sa_func.count(Expense.id), sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            extract("month", Expense.created_at) == this_month,
            extract("year", Expense.created_at) == this_year,
        )
        .first()
    )
    month_created_count = month_created[0] or 0
    month_created_amount = float(month_created[1] or 0)

    month_approved = (
        db.query(sa_func.count(Expense.id), sa_func.coalesce(sa_func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
            extract("month", Expense.created_at) == this_month,
            extract("year", Expense.created_at) == this_year,
        )
        .first()
    )
    month_approved_count = month_approved[0] or 0
    month_approved_amount = float(month_approved[1] or 0)

    # ── CFDI status ───────────────────────────────────────────────────────
    cfdi_verified = (
        db.query(sa_func.count(Expense.id))
        .filter(Expense.company_id == company_id, Expense.cfdi_uuid.isnot(None), Expense.cfdi_uuid != "")
        .scalar()
    ) or 0
    cfdi_mismatch = (
        db.query(sa_func.count(Expense.id))
        .filter(Expense.company_id == company_id, Expense.cfdi_status == "mismatch")
        .scalar()
    ) or 0
    cfdi_missing = (
        db.query(sa_func.count(Expense.id))
        .filter(Expense.company_id == company_id, Expense.status == "approved", (Expense.cfdi_uuid.is_(None) | (Expense.cfdi_uuid == "")))
        .scalar()
    ) or 0

    # ── Total ─────────────────────────────────────────────────────────────
    total_expenses = sum(v["count"] for v in by_status.values())
    total_amount = sum(v["amount"] for v in by_status.values())

    return {
        "total_expenses": total_expenses,
        "total_amount": total_amount,
        "by_status": by_status,
        "verified_unreported": {"count": unreported_count, "amount": unreported_amount},
        "in_reports": {"count": in_report_count, "amount": in_report_amount},
        "this_month": {
            "created": {"count": month_created_count, "amount": month_created_amount},
            "approved": {"count": month_approved_count, "amount": month_approved_amount},
        },
        "cfdi": {
            "verified": cfdi_verified,
            "mismatch": cfdi_mismatch,
            "missing": cfdi_missing,
        },
    }
