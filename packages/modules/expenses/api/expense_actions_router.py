from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
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
    current_user: User = Depends(get_current_user),
):
    if portal_role not in _VALID_ROLES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid portal_role '{portal_role}'. Must be one of: {', '.join(sorted(_VALID_ROLES))}.",
        )

    expense = get_expense_for_user(expense_id, db, current_user)

    if portal_role == "employee":
        actions = resolve_employee_actions(db, expense)
    elif portal_role == "manager":
        actions = resolve_manager_actions(db, expense)
    else:
        actions = resolve_accounting_actions(db, expense)

    return ExpenseActionsResponse(portal_role=portal_role, actions=actions)
