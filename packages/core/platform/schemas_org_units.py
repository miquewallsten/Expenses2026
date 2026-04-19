from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ── Project ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    company_id: int
    name: str
    code: str
    status: Optional[str] = None


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    status: str
    created_at: datetime


# ── Client ────────────────────────────────────────────────────────────────────

class ClientCreate(BaseModel):
    company_id: int
    name: str
    code: str
    status: Optional[str] = None


class ClientRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    status: str
    created_at: datetime


# ── CostCenter ────────────────────────────────────────────────────────────────

class CostCenterCreate(BaseModel):
    company_id: int
    name: str
    code: str
    status: Optional[str] = None


class CostCenterRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    code: str
    status: str
    created_at: datetime
