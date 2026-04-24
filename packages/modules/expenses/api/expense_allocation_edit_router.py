from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user
from packages.modules.expenses.schemas.allocation_edit import (
    ExpenseAllocationReplaceRequest,
    ExpenseAllocationReplaceResponse,
)
from packages.modules.expenses.service.allocation_upsert_service import (
    replace_expense_allocations,
)

router = APIRouter(prefix="/expenses/allocation-edit", tags=["expenses"])


@router.put("/{expense_id}", response_model=ExpenseAllocationReplaceResponse)
def replace_allocations(
    expense_id: int,
    body: ExpenseAllocationReplaceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    get_expense_for_user(expense_id, db, current_user)
    try:
        created = replace_expense_allocations(
            db,
            expense_id,
            [item.model_dump() for item in body.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return ExpenseAllocationReplaceResponse(
        expense_id=expense_id,
        items=created,
    )
