from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import require_manager_or_accountant, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.expenses.service.review_queue_service import (
    build_queue_summary,
    list_manager_queue,
)

router = APIRouter(prefix="/manager/queue", tags=["manager"])


class ManagerQueueResponse(BaseModel):
    items: list[ExpenseRead]
    summary: dict


@router.get("/{company_id}", response_model=ManagerQueueResponse)
def get_manager_queue(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    require_same_company(company_id, current_user)
    expenses = list_manager_queue(db, company_id)
    return ManagerQueueResponse(
        items=[ExpenseRead.model_validate(e) for e in expenses],
        summary=build_queue_summary(expenses),
    )
