"""Public Platform API — versioned read/write endpoints for ERPs and external
systems (Phase 4.2).

Auth: ``Authorization: Bearer foplat_<key>``. Keys are issued via
``packages/modules/integrations/service/api_keys.py``. Each route declares the
scope it requires; missing scope → 403.

Cross-tenant: every query is filtered by the caller's ``company_id``.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi import status as http_status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_project import Project
from packages.modules.expenses.models.expense import Expense
from packages.modules.integrations.models import (
    ExpensePaymentStatus,
    Integration,
)
from packages.modules.integrations.models_public_api import PlatformApiKey
from packages.modules.integrations.service.api_keys import (
    has_scope,
    verify_api_key,
)


router = APIRouter(prefix="/api/v1", tags=["public-api"])


# ── Auth ────────────────────────────────────────────────────────────────────


def _bearer_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


def get_api_key(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    db: Session = Depends(get_db),
) -> PlatformApiKey:
    plaintext = _bearer_from_header(authorization)
    row = verify_api_key(db, plaintext)
    if row is None:
        raise HTTPException(
            status_code=http_status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or revoked API key",
            headers={"WWW-Authenticate": 'Bearer realm="api"'},
        )
    return row


def require_scope(scope: str):
    def _dep(api_key: PlatformApiKey = Depends(get_api_key)) -> PlatformApiKey:
        if not has_scope(api_key, scope):
            raise HTTPException(
                status_code=http_status.HTTP_403_FORBIDDEN,
                detail=f"Missing required scope: {scope}",
            )
        return api_key

    return _dep


# ── Schemas ─────────────────────────────────────────────────────────────────


class ExpenseRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    amount: Decimal
    description: str
    status: str
    category_code: str | None
    expense_date: date | None
    created_at: datetime


class CursorPage(BaseModel):
    items: list[ExpenseRead]
    next_cursor: int | None = None


class CostCenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    status: str


class AccountingCategoryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int


class PaymentStatusBody(BaseModel):
    integration_id: int = Field(...)
    erp_payment_reference: str | None = Field(default=None, max_length=120)
    erp_payment_date: date | None = None
    erp_status: str | None = Field(default=None, max_length=40)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    expense_id: int
    integration_id: int
    erp_payment_reference: str | None
    erp_payment_date: date | None
    erp_status: str | None
    reported_at: datetime


# ── Read endpoints ──────────────────────────────────────────────────────────


@router.get("/expenses", response_model=CursorPage)
def list_expenses(
    status: str | None = Query(default=None),
    cursor: int | None = Query(default=None, description="Last expense id seen"),
    limit: int = Query(default=50, ge=1, le=200),
    api_key: PlatformApiKey = Depends(require_scope("expenses:read")),
    db: Session = Depends(get_db),
) -> CursorPage:
    q = db.query(Expense).filter(Expense.company_id == api_key.company_id)
    if status is not None:
        q = q.filter(Expense.status == status)
    if cursor is not None:
        q = q.filter(Expense.id > cursor)
    rows = q.order_by(Expense.id.asc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    next_cursor = rows[-1].id if has_more and rows else None
    return CursorPage(
        items=[ExpenseRead.model_validate(r) for r in rows], next_cursor=next_cursor
    )


@router.get("/expenses/{expense_id}", response_model=ExpenseRead)
def get_expense(
    expense_id: int,
    api_key: PlatformApiKey = Depends(require_scope("expenses:read")),
    db: Session = Depends(get_db),
) -> ExpenseRead:
    row = (
        db.query(Expense)
        .filter(
            Expense.id == expense_id, Expense.company_id == api_key.company_id
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    return ExpenseRead.model_validate(row)


@router.get("/cost-centers", response_model=list[CostCenterRead])
def list_cost_centers(
    api_key: PlatformApiKey = Depends(require_scope("masterdata:read")),
    db: Session = Depends(get_db),
) -> list[CostCenterRead]:
    rows = (
        db.query(CostCenter)
        .filter(CostCenter.company_id == api_key.company_id)
        .order_by(CostCenter.code.asc())
        .all()
    )
    return [CostCenterRead.model_validate(r) for r in rows]


@router.get("/accounting-categories", response_model=list[AccountingCategoryRead])
def list_accounting_categories(
    api_key: PlatformApiKey = Depends(require_scope("masterdata:read")),
    db: Session = Depends(get_db),
) -> list[AccountingCategoryRead]:
    rows = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.company_id == api_key.company_id)
        .order_by(AccountingCategory.code.asc())
        .all()
    )
    return [AccountingCategoryRead.model_validate(r) for r in rows]


# ── Write endpoints ─────────────────────────────────────────────────────────


@router.post(
    "/expenses/{expense_id}/payment-status",
    response_model=PaymentStatusRead,
    status_code=http_status.HTTP_200_OK,
)
def report_payment_status(
    expense_id: int,
    body: PaymentStatusBody,
    api_key: PlatformApiKey = Depends(require_scope("payments:write")),
    db: Session = Depends(get_db),
) -> PaymentStatusRead:
    """ERP reports payment outcome for an expense.

    Idempotent on (expense_id, integration_id): subsequent calls update the
    existing row instead of creating a new one.
    """
    expense = (
        db.query(Expense)
        .filter(
            Expense.id == expense_id, Expense.company_id == api_key.company_id
        )
        .one_or_none()
    )
    if expense is None:
        raise HTTPException(status_code=404, detail="Expense not found")
    integration = (
        db.query(Integration)
        .filter(
            Integration.id == body.integration_id,
            Integration.company_id == api_key.company_id,
        )
        .one_or_none()
    )
    if integration is None:
        raise HTTPException(status_code=404, detail="Integration not found")

    row = (
        db.query(ExpensePaymentStatus)
        .filter(
            ExpensePaymentStatus.expense_id == expense_id,
            ExpensePaymentStatus.integration_id == integration.id,
        )
        .one_or_none()
    )
    if row is None:
        row = ExpensePaymentStatus(
            expense_id=expense_id,
            integration_id=integration.id,
        )
        db.add(row)

    row.erp_payment_reference = body.erp_payment_reference
    row.erp_payment_date = body.erp_payment_date
    row.erp_status = body.erp_status
    row.notes = body.notes
    row.reported_at = datetime.utcnow()
    db.commit()
    db.refresh(row)
    return PaymentStatusRead.model_validate(row)
