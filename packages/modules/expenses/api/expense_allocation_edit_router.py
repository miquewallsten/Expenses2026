from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.deps import get_db
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
):
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
