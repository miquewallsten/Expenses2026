"""Phase 5.3 — duplicate detection endpoint."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.service.duplicate_detection_service import (
    DuplicateMatch,
    find_duplicates,
    has_blocking_duplicate,
)


router = APIRouter(prefix="/expenses/duplicates", tags=["expenses"])


class DuplicateCheckRequest(BaseModel):
    amount: Decimal = Field(..., ge=0)
    expense_date: date | None = None
    description: str = ""
    cfdi_uuid: str | None = None
    exclude_id: int | None = None


class DuplicateMatchRead(BaseModel):
    expense_id: int
    confidence: str
    reasons: list[str]


class DuplicateCheckResponse(BaseModel):
    matches: list[DuplicateMatchRead]
    blocking: bool


@router.post("/check", response_model=DuplicateCheckResponse)
def check_duplicates(
    payload: DuplicateCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> DuplicateCheckResponse:
    matches: list[DuplicateMatch] = find_duplicates(
        db,
        company_id=current_user.company_id,
        amount=payload.amount,
        expense_date=payload.expense_date,
        description=payload.description,
        cfdi_uuid=payload.cfdi_uuid,
        exclude_id=payload.exclude_id,
    )
    return DuplicateCheckResponse(
        matches=[
            DuplicateMatchRead(
                expense_id=m.expense_id,
                confidence=m.confidence,
                reasons=m.reasons,
            )
            for m in matches
        ],
        blocking=has_blocking_duplicate(matches),
    )
