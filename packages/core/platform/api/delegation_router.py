"""Delegation API — manage approval delegation with date ranges."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_delegation import Delegation
from packages.core.platform.service_delegation import (
    create_delegation,
    get_active_delegates,
    is_delegate_active,
    list_delegations_for_company,
    list_my_principals,
    revoke_delegation,
)

router = APIRouter(prefix="/delegations", tags=["delegations"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class DelegationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    delegate_user_id: int
    principal_user_id: int
    start_date: date | None = None
    end_date: date | None = None


class DelegationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_id: int
    delegate_user_id: int
    principal_user_id: int
    start_date: date | None
    end_date: date | None
    is_active: bool


class DelegationSummary(BaseModel):
    id: int
    delegate_user_id: int
    delegate_name: str
    principal_user_id: int
    principal_name: str
    start_date: date | None
    end_date: date | None
    is_active: bool
    is_currently_active: bool


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{company_id}", response_model=list[DelegationSummary])
def list_company_delegations(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> list[DelegationSummary]:
    """List all delegations for a company (admin only)."""
    delegations = list_delegations_for_company(db, company_id)
    today = date.today()
    result = []
    for d in delegations:
        active = d.is_active
        if d.start_date and d.start_date > today:
            active = False
        if d.end_date and d.end_date < today:
            active = False
        delegate = db.query(User).filter(User.id == d.delegate_user_id).first()
        principal = db.query(User).filter(User.id == d.principal_user_id).first()
        result.append(DelegationSummary(
            id=d.id,
            delegate_user_id=d.delegate_user_id,
            delegate_name=delegate.full_name if delegate else "Unknown",
            principal_user_id=d.principal_user_id,
            principal_name=principal.full_name if principal else "Unknown",
            start_date=d.start_date,
            end_date=d.end_date,
            is_active=d.is_active,
            is_currently_active=active,
        ))
    return result


@router.post("/", response_model=DelegationRead, status_code=201)
def create_new_delegation(
    body: DelegationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> Delegation:
    """Create a new approval delegation (admin only)."""
    company_id = current_user.company_id
    try:
        d = create_delegation(
            db=db,
            company_id=company_id,
            delegate_user_id=body.delegate_user_id,
            principal_user_id=body.principal_user_id,
            start_date=body.start_date,
            end_date=body.end_date,
        )
        return d
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{delegation_id}")
def revoke_delegation_endpoint(
    delegation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> dict:
    """Revoke a delegation (admin only)."""
    ok = revoke_delegation(db, delegation_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Delegation not found")
    return {"ok": True}


@router.get("/my-principals/{company_id}", response_model=list[DelegationRead])
def my_principals(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[DelegationRead]:
    """List principals the current user is a delegate for."""
    delegations = list_my_principals(db, company_id, current_user.id)
    return [DelegationRead.model_validate(d) for d in delegations]


@router.get("/active-delegates/{company_id}/{principal_id}", response_model=list[dict])
def active_delegates(
    company_id: int,
    principal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """Get active delegates for a principal user."""
    delegates = get_active_delegates(db, company_id, principal_id)
    return [
        {"user_id": d.id, "full_name": d.full_name, "email": d.email}
        for d in delegates
    ]


@router.get("/check/{company_id}/{delegate_id}/{principal_id}")
def check_delegation(
    company_id: int,
    delegate_id: int,
    principal_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Check if a specific delegation is currently active."""
    active = is_delegate_active(db, company_id, delegate_id, principal_id)
    return {"is_active": active}
