"""accounting_dashboard_service.py — at-a-glance metrics for accountants.

Returns:
  - pending review count and amount
  - this month's approved total
  - unposted entries (approved but no póliza generated)
  - CFDI mismatches (expenses with XML but wrong UUID or amount)
  - budget alerts (dimensions over budget)
  - category coverage (expenses with/without accounting category)
  - auto-categorization queue size
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.modules.expenses.models.expense import Expense


def get_dashboard(db: Session, company_id: int) -> dict[str, Any]:
    """Return accounting dashboard metrics for a company."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    this_month = now.month
    this_year = now.year

    # ── Pending review ────────────────────────────────────────────────────
    pending_q = (
        db.query(func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status.in_(["submitted", "manager_approved"]),
        )
        .first()
    )
    pending_count = pending_q[0] or 0
    pending_amount = float(pending_q[1] or 0)

    # ── This month's approved ─────────────────────────────────────────────
    approved_q = (
        db.query(func.count(Expense.id), func.coalesce(func.sum(Expense.amount), 0))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
            extract("month", Expense.created_at) == this_month,
            extract("year", Expense.created_at) == this_year,
        )
        .first()
    )
    approved_count = approved_q[0] or 0
    approved_amount = float(approved_q[1] or 0)

    # ── Category coverage ────────────────────────────────────────────────
    total_with_cat = (
        db.query(func.count(Expense.id))
        .filter(
            Expense.company_id == company_id,
            Expense.category_code.isnot(None),
            Expense.category_code != "",
        )
        .scalar() or 0
    )
    total_expenses = (
        db.query(func.count(Expense.id))
        .filter(Expense.company_id == company_id)
        .scalar() or 0
    )
    uncategorized = total_expenses - total_with_cat

    # ── CFDI mismatches ──────────────────────────────────────────────────
    cfdi_mismatch = (
        db.query(func.count(Expense.id))
        .filter(
            Expense.company_id == company_id,
            Expense.cfdi_status == "mismatch",
        )
        .scalar() or 0
    )

    # ── Missing CFDI (approved expenses without UUID) ────────────────────
    missing_cfdi = (
        db.query(func.count(Expense.id))
        .filter(
            Expense.company_id == company_id,
            Expense.status == "approved",
            Expense.cfdi_uuid.is_(None) | (Expense.cfdi_uuid == ""),
        )
        .scalar() or 0
    )

    # ── Active categories count ──────────────────────────────────────────
    active_categories = (
        db.query(func.count(AccountingCategory.id))
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.is_active.is_(True),
        )
        .scalar() or 0
    )

    # ── Mapped categories (have expense_account_id or expense_account_code) ─
    mapped_categories = (
        db.query(func.count(AccountingCategory.id))
        .filter(
            AccountingCategory.company_id == company_id,
            AccountingCategory.is_active.is_(True),
            (AccountingCategory.expense_account_id.isnot(None)) | (AccountingCategory.expense_account_code.isnot(None)),
        )
        .scalar() or 0
    )

    # ── Unmapped categories ──────────────────────────────────────────────
    unmapped_categories = active_categories - mapped_categories

    return {
        "pending_review": {
            "count": pending_count,
            "amount": pending_amount,
        },
        "this_month": {
            "approved_count": approved_count,
            "approved_amount": approved_amount,
        },
        "category_coverage": {
            "total": total_expenses,
            "categorized": total_with_cat,
            "uncategorized": uncategorized,
        },
        "cfdi": {
            "mismatches": cfdi_mismatch,
            "missing_uuid": missing_cfdi,
        },
        "categories": {
            "active": active_categories,
            "mapped": mapped_categories,
            "unmapped": unmapped_categories,
        },
    }
