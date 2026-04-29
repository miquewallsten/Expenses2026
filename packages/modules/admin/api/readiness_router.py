from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.service.tenant_validator import (
    VALIDATOR,
    ReadinessReport,
    RequirementGap,
    ModuleReadiness,
)

router = APIRouter(prefix="/admin/readiness", tags=["admin-readiness"])


# ── Schemas ─────────────────────────────────────────────────────────────────

class RequirementGapOut(BaseModel):
    module: str
    kind: str
    target: str
    message: str
    severity: str
    wizard_step: str | None


class ModuleReadinessOut(BaseModel):
    module: str
    enabled: bool
    ok: bool
    gaps: list[RequirementGapOut]


class ReadinessReportOut(BaseModel):
    company_id: int
    ok: bool
    modules: list[ModuleReadinessOut]
    blockers: list[RequirementGapOut]
    warnings: list[RequirementGapOut]


# ── Helpers ─────────────────────────────────────────────────────────────────

def _to_gap_out(g: RequirementGap) -> dict:
    return {
        "module": g.module,
        "kind": g.kind,
        "target": g.target,
        "message": g.message,
        "severity": g.severity,
        "wizard_step": g.wizard_step,
    }


def _to_module_out(m: ModuleReadiness) -> dict:
    return {
        "module": m.module,
        "enabled": m.enabled,
        "ok": m.ok,
        "gaps": [_to_gap_out(g) for g in m.gaps],
    }


def _to_report_out(r: ReadinessReport) -> dict:
    return {
        "company_id": r.company_id,
        "ok": r.ok,
        "modules": [_to_module_out(m) for m in r.modules],
        "blockers": [_to_gap_out(g) for g in r.blockers],
        "warnings": [_to_gap_out(g) for g in r.warnings],
    }


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/{company_id}", response_model=ReadinessReportOut)
def get_readiness(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    report = VALIDATOR.validate_company(db, company_id)
    return _to_report_out(report)


@router.get("/{company_id}/blockers")
def get_blockers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    blockers = VALIDATOR.get_blockers(db, company_id)
    return {"company_id": company_id, "blockers": [_to_gap_out(g) for g in blockers]}


@router.get("/{company_id}/module/{module_key}")
def get_module_readiness(
    company_id: int,
    module_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    mod = VALIDATOR.validate_module(db, company_id, module_key)
    return _to_module_out(mod)
