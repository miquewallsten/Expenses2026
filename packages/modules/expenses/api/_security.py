"""Shared security helpers for expense routers.

Every endpoint that operates on an expense by id MUST use `get_expense_for_user`
so cross-company access is rejected with a 404 (not 403 — we don't leak the
existence of another company's row).

For endpoints that accept `company_id` as a path/query parameter, use
`apps.api.auth.require_same_company` (which raises 403).
"""
from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense


def get_expense_for_user(expense_id: int, db: Session, current_user: User) -> Expense:
    """Return the expense only if it belongs to current_user's company.

    Returns 404 both for missing rows and for rows belonging to a different
    company. This prevents id-probe attacks that would otherwise reveal that
    an expense with a given id exists in another tenant.
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if expense is None or expense.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")
    return expense

