from fastapi import APIRouter, Depends, Query
from packages.core.platform.module_gate import require_module
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import require_manager_or_accountant, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.schemas.expense import ExpenseRead
from packages.modules.expenses.service.review_queue_service import (
    build_queue_summary,
    list_manager_queue_paginated,
)

router = APIRouter(prefix="/manager/queue", tags=["manager"], dependencies=[Depends(require_module("approvals"))])


class PaginatedQueueResponse(BaseModel):
    items: list[ExpenseRead]
    total: int
    page: int
    pages: int
    summary: dict


@router.get("/{company_id}", response_model=PaginatedQueueResponse)
def get_manager_queue(
    company_id: int,
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(50, ge=1, le=100, description="Items per page (max 100)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_manager_or_accountant),
):
    """Get paginated manager approval queue."""
    require_same_company(company_id, current_user)

    result = list_manager_queue_paginated(
        db=db,
        company_id=company_id,
        page=page,
        limit=limit,
    )

    return PaginatedQueueResponse(
        items=[ExpenseRead.model_validate(e) for e in result["items"]],
        total=result["total"],
        page=result["page"],
        pages=result["pages"],
        summary=build_queue_summary(result["items"]),
    )
