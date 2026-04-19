from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.expenses.service.review_queue_service import (
    build_queue_summary,
    list_accounting_queue,
)

router = APIRouter(prefix="/accounting/queue", tags=["accounting"])


class AccountingQueueResponse(BaseModel):
    items: list[ExpenseRead]
    summary: dict


@router.get("/{company_id}", response_model=AccountingQueueResponse)
def get_accounting_queue(company_id: int, db: Session = Depends(get_db)):
    expenses = list_accounting_queue(db, company_id)
    return AccountingQueueResponse(
        items=[ExpenseRead.model_validate(e) for e in expenses],
        summary=build_queue_summary(expenses),
    )
