"""Phase 5.4 — anomaly detection endpoints."""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.expenses.service.anomaly_detection_service import (
    compute_baseline,
    detect_anomalies,
)


router = APIRouter(prefix="/expenses/anomalies", tags=["expenses"])


class AnomalyCheckRequest(BaseModel):
    amount: Decimal = Field(..., ge=0)
    category_code: str | None = None
    expense_date: date | None = None
    expense_id: int | None = None


class AnomalyFlagRead(BaseModel):
    kind: str
    severity: str
    message: str
    detail: dict[str, Any]


class AnomalyCheckResponse(BaseModel):
    flags: list[AnomalyFlagRead]
    has_alert: bool


class BaselineEntry(BaseModel):
    category_code: str
    mean: float
    stddev: float
    count: int
    sample_min: float
    sample_max: float


class BaselineResponse(BaseModel):
    window_days: int
    entries: list[BaselineEntry]


@router.post("/check", response_model=AnomalyCheckResponse)
def check_anomalies(
    payload: AnomalyCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AnomalyCheckResponse:
    flags = detect_anomalies(
        db,
        company_id=current_user.company_id,
        amount=payload.amount,
        category_code=payload.category_code,
        expense_date=payload.expense_date,
        expense_id=payload.expense_id,
    )
    return AnomalyCheckResponse(
        flags=[
            AnomalyFlagRead(
                kind=f.kind, severity=f.severity,
                message=f.message, detail=f.detail,
            )
            for f in flags
        ],
        has_alert=any(f.severity == "alert" for f in flags),
    )


@router.get("/baseline", response_model=BaselineResponse)
def get_baseline(
    window_days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> BaselineResponse:
    bl = compute_baseline(
        db, company_id=current_user.company_id, window_days=window_days,
    )
    entries = [
        BaselineEntry(
            category_code=cat,
            mean=float(v["mean"]),
            stddev=float(v["stddev"]),
            count=int(v["count"]),
            sample_min=float(v["sample_min"]),
            sample_max=float(v["sample_max"]),
        )
        for cat, v in sorted(bl.items())
    ]
    return BaselineResponse(window_days=window_days, entries=entries)
