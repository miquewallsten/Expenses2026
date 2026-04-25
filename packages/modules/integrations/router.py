"""HTTP API for the Integrations module.

Phase 4.1 — read-only listing of a company's integrations and recent sync
runs. Configuration UI, secret handling, and adapter execution land in
phases 4.2 and 4.3.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.integrations.models import (
    ExpensePaymentStatus,
    Integration,
    IntegrationEndpoint,
    IntegrationSyncRun,
)


router = APIRouter(prefix="/integrations", tags=["integrations"])


class IntegrationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    kind: Literal["erp", "bank_statement", "hris", "generic_webhook"]
    vendor: str
    name: str
    is_enabled: bool
    created_at: datetime
    updated_at: datetime


class IntegrationEndpointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    integration_id: int
    endpoint: str
    is_enabled: bool
    auth_strategy: str | None
    target_url: str | None
    schedule_cron: str | None
    last_run_at: datetime | None
    last_status: str | None


class IntegrationSyncRunRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    integration_id: int
    endpoint: str
    direction: Literal["outbound", "inbound"]
    status: Literal["pending", "running", "succeeded", "failed", "partial"]
    started_at: datetime
    finished_at: datetime | None
    items_ok: int
    items_failed: int
    error_summary: str | None
    request_id: str | None


class ExpensePaymentStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    expense_id: int
    integration_id: int
    erp_payment_reference: str | None
    erp_payment_date: date | None
    erp_status: str | None
    reported_at: datetime


def _company_integration_or_404(
    db: Session, integration_id: int, company_id: int
) -> Integration:
    obj = (
        db.query(Integration)
        .filter(Integration.id == integration_id, Integration.company_id == company_id)
        .one_or_none()
    )
    if obj is None:
        raise HTTPException(status_code=404, detail="Integration not found")
    return obj


@router.get("", response_model=list[IntegrationRead])
def list_integrations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IntegrationRead]:
    rows = (
        db.query(Integration)
        .filter(Integration.company_id == current_user.company_id)
        .order_by(Integration.id.asc())
        .all()
    )
    return [IntegrationRead.model_validate(r) for r in rows]


@router.get("/{integration_id}", response_model=IntegrationRead)
def get_integration(
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> IntegrationRead:
    obj = _company_integration_or_404(db, integration_id, current_user.company_id)
    return IntegrationRead.model_validate(obj)


@router.get(
    "/{integration_id}/endpoints", response_model=list[IntegrationEndpointRead]
)
def list_endpoints(
    integration_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IntegrationEndpointRead]:
    _company_integration_or_404(db, integration_id, current_user.company_id)
    rows = (
        db.query(IntegrationEndpoint)
        .filter(IntegrationEndpoint.integration_id == integration_id)
        .order_by(IntegrationEndpoint.id.asc())
        .all()
    )
    return [IntegrationEndpointRead.model_validate(r) for r in rows]


@router.get(
    "/{integration_id}/runs", response_model=list[IntegrationSyncRunRead]
)
def list_runs(
    integration_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[IntegrationSyncRunRead]:
    _company_integration_or_404(db, integration_id, current_user.company_id)
    rows = (
        db.query(IntegrationSyncRun)
        .filter(IntegrationSyncRun.integration_id == integration_id)
        .order_by(IntegrationSyncRun.started_at.desc())
        .limit(min(max(limit, 1), 200))
        .all()
    )
    return [IntegrationSyncRunRead.model_validate(r) for r in rows]
