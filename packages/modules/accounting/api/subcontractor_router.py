"""Subcontractor API endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission, require_same_company
from packages.core.platform.module_gate import require_module
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.accounting.service.subcontractor_service import (
    list_subcontractors,
    get_subcontractor,
    create_subcontractor,
)

router = APIRouter(
    prefix="/accounting/subcontractors",
    tags=["accounting"],
    dependencies=[Depends(require_permission("accounting:configure")), Depends(require_module("subcontractor"))],
)


class SubcontractorCreate(BaseModel):
    name: str
    rfc: str
    code: str | None = None
    legal_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    address: str | None = None
    notes: str | None = None


@router.get("/{company_id}")
def list_subs(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)
    return list_subcontractors(db, company_id)


@router.get("/{company_id}/{client_id}")
def get_sub(company_id: int, client_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)
    result = get_subcontractor(db, company_id, client_id)
    if not result:
        raise HTTPException(404, "Subcontractor not found")
    return result


@router.post("/{company_id}", status_code=201)
def create_sub(company_id: int, body: SubcontractorCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    require_same_company(company_id, current_user)
    try:
        return create_subcontractor(db, company_id, body.model_dump())
    except ValueError as e:
        raise HTTPException(400, str(e))
