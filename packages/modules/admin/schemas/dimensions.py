"""Pydantic schemas for enriched CostCenter, Project, Client CRUD."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── CostCenter ──────────────────────────────────────────────────────────────

class CostCenterCreate(BaseModel):
    company_id: int
    name: str
    code: str
    description: str | None = None
    budget_amount: float | None = None
    budget_currency: str = "MXN"
    responsible_user_id: int | None = None
    parent_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_billable: bool = False
    notes: str | None = None
    status: str = "active"


class CostCenterUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    budget_amount: float | None = None
    budget_currency: str | None = None
    responsible_user_id: int | None = None
    parent_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_billable: bool | None = None
    notes: str | None = None
    status: str | None = None


class CostCenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    description: str | None
    budget_amount: float | None
    budget_currency: str
    responsible_user_id: int | None
    parent_id: int | None
    start_date: datetime | None
    end_date: datetime | None
    is_billable: bool
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime | None


# ── Project ─────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    company_id: int
    name: str
    code: str
    description: str | None = None
    budget_amount: float | None = None
    budget_currency: str = "MXN"
    responsible_user_id: int | None = None
    parent_id: int | None = None
    client_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_billable: bool = False
    notes: str | None = None
    status: str = "active"


class ProjectUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    budget_amount: float | None = None
    budget_currency: str | None = None
    responsible_user_id: int | None = None
    parent_id: int | None = None
    client_id: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_billable: bool | None = None
    notes: str | None = None
    status: str | None = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    description: str | None
    budget_amount: float | None
    budget_currency: str
    responsible_user_id: int | None
    parent_id: int | None
    client_id: int | None
    start_date: datetime | None
    end_date: datetime | None
    is_billable: bool
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime | None


# ── Client ──────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    company_id: int
    name: str
    code: str
    description: str | None = None
    rfc: str | None = None
    legal_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    responsible_user_id: int | None = None
    parent_id: int | None = None
    notes: str | None = None
    status: str = "active"


class ClientUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    rfc: str | None = None
    legal_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    responsible_user_id: int | None = None
    parent_id: int | None = None
    notes: str | None = None
    status: str | None = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    description: str | None
    rfc: str | None
    legal_name: str | None
    contact_email: str | None
    contact_phone: str | None
    address: str | None
    responsible_user_id: int | None
    parent_id: int | None
    is_active: bool
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime | None


# ── Dimension Budget Summary ────────────────────────────────────────────────

class DimensionBudgetSummary(BaseModel):
    """Budget vs. actual for a single dimension item."""
    id: int
    code: str
    name: str
    budget_amount: float | None
    spent_amount: float
    remaining: float | None
    percent_used: float | None
