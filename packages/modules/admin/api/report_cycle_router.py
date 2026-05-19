from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.admin.schemas.report_cycle import (
    BundleResult,
    ReportCycleSettingsRead,
    ReportCycleSettingsUpdate,
)
from packages.modules.admin.service.report_cycle_service import (
    bundle_expenses,
    get_or_create_report_cycle_settings,
    update_report_cycle_settings,
)

router = APIRouter(prefix="/admin/report-cycle", tags=["admin"], dependencies=[Depends(require_admin)])


@router.get("/{company_id}", response_model=ReportCycleSettingsRead)
def get_report_cycle_route(company_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    return get_or_create_report_cycle_settings(db, company_id)


@router.put("/{company_id}", response_model=ReportCycleSettingsRead)
def update_report_cycle_route(
    company_id: int,
    data: ReportCycleSettingsUpdate,
    db: Session = Depends(get_db),
):
    return update_report_cycle_settings(db, company_id, data)


@router.post("/{company_id}/trigger", response_model=BundleResult)
def trigger_bundle_route(company_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    """Manually trigger a report-generation cycle for this company right now."""
    try:
        result = bundle_expenses(db, company_id, triggered_by="manual")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result

def trigger_bundle_route(company_id: int, db: Session = Depends(get_db)):
    """Manually trigger a report-generation cycle for this company right now."""
    try:
        result = bundle_expenses(db, company_id, triggered_by="manual")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return result
