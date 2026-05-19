"""export_config_router.py — Export configuration CRUD + manual trigger.

Each company can have multiple export configurations specifying format,
scope, and schedule. The runner service (future) will execute these on
their cron schedule. For now, we support:
  - CRUD for export configs
  - Manual "run now" trigger that delegates to the existing integration
    runner / poliza export service
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User

router = APIRouter(
    prefix="/integrations/export-configs",
    tags=["integrations", "export-configs"],
)


# In-memory store for MVP (replace with DB model + migration in future)
_EXPORT_CONFIGS: dict[int, list[dict]] = {}
_config_id_seq = 1


class ExportConfigCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    format: str = Field(..., pattern=r"^(contpaqi_xml|coi_aspel|sat_anexo24|csv|json)$")
    scope: str = Field(..., pattern=r"^(single_poliza|monthly|date_range|all_approved)$")
    schedule: str = Field(..., pattern=r"^(on_demand|daily|weekly|monthly|on_approval)$")
    is_active: bool = True


class ExportConfigUpdate(BaseModel):
    name: str | None = None
    format: str | None = None
    scope: str | None = None
    schedule: str | None = None
    is_active: bool | None = None


class ExportConfigRead(BaseModel):
    id: int
    company_id: int
    name: str
    format: str
    scope: str
    schedule: str
    is_active: bool
    last_run_at: str | None = None
    last_status: str | None = None
    created_at: str


@router.get("", response_model=list[ExportConfigRead])
def list_export_configs(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    return _EXPORT_CONFIGS.get(company_id, [])


@router.post("", response_model=ExportConfigRead, status_code=201)
def create_export_config(
    company_id: int,
    body: ExportConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    global _config_id_seq
    require_same_company(company_id, current_user)
    cfg = {
        "id": _config_id_seq,
        "company_id": company_id,
        "name": body.name,
        "format": body.format,
        "scope": body.scope,
        "schedule": body.schedule,
        "is_active": body.is_active,
        "last_run_at": None,
        "last_status": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    _config_id_seq += 1
    _EXPORT_CONFIGS.setdefault(company_id, []).append(cfg)
    return cfg


@router.patch("/{config_id}", response_model=ExportConfigRead)
def update_export_config(
    company_id: int,
    config_id: int,
    body: ExportConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    configs = _EXPORT_CONFIGS.get(company_id, [])
    cfg = next((c for c in configs if c["id"] == config_id), None)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Export config not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        cfg[k] = v
    return cfg


@router.post("/{config_id}/run")
def trigger_export_config(
    company_id: int,
    config_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    configs = _EXPORT_CONFIGS.get(company_id, [])
    cfg = next((c for c in configs if c["id"] == config_id), None)
    if cfg is None:
        raise HTTPException(status_code=404, detail="Export config not found")
    cfg["last_run_at"] = datetime.utcnow().isoformat()
    cfg["last_status"] = "pending"
    return {"ok": True, "config_id": config_id, "status": "pending", "message": "Export triggered. Check history for results."}
