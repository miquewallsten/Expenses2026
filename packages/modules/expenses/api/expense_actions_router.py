from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.action_resolver_service import (
    resolve_accounting_actions,
    resolve_employee_actions,
    resolve_manager_actions,
)

router = APIRouter(prefix="/expenses/actions", tags=["expenses"])

_VALID_ROLES = {"employee", "manager", "accounting"}


class ExpenseActionsResponse(BaseModel):
    portal_role: str
    actions: dict


@router.get("/{expense_id}", response_model=ExpenseActionsResponse)
def get_expense_actions(
    expense_id: int,
    portal_role: str = Query(..., description="One of: employee, manager, accounting"),
    db: Session = Depends(get_db),
):
    if portal_role not in _VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid portal_role '{portal_role}'. Must be one of: {', '.join(sorted(_VALID_ROLES))}.",
        )

    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if expense is None:
        raise HTTPException(status_code=404, detail=f"Expense {expense_id} not found.")

    if portal_role == "employee":
        actions = resolve_employee_actions(db, expense)
    elif portal_role == "manager":
        actions = resolve_manager_actions(db, expense)
    else:
        actions = resolve_accounting_actions(db, expense)

    return ExpenseActionsResponse(portal_role=portal_role, actions=actions)
