from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.service.expense_blocker_service import (
    get_allocation_presence,
    get_expense_allocations,
)

router = APIRouter(prefix="/expenses/allocations-summary", tags=["expenses"])


@router.get("/{expense_id}")
def get_expense_allocations_summary(
    expense_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    expense = get_expense_for_user(expense_id, db, current_user)

    rows = get_expense_allocations(db, expense_id)
    presence = get_allocation_presence(db, expense_id)

    return {
        "expense_id": expense_id,
        "items": [
            {
                "id":              row.id,
                "project_id":      row.project_id,
                "client_id":       row.client_id,
                "cost_center_id":  row.cost_center_id,
                "percent":         row.percent,
            }
            for row in rows
        ],
        "presence": presence,
    }
