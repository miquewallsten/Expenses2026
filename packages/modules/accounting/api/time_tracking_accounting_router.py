"""Time tracking → accounting integration endpoint.

Gated on the time_allocation module being enabled — accounting users can only
access time allocation data if the company has installed the add-on.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.module_gate import require_module
from packages.modules.accounting.service.time_tracking_integration_service import get_time_allocation_summary

router = APIRouter(
    prefix="/accounting/time-allocation",
    tags=["accounting"],
    dependencies=[Depends(require_permission("accounting:configure")), Depends(require_module("time_allocation"))],
)


@router.get("/{company_id}/summary")
def time_summary(
    company_id: int,
    project_id: int | None = None,
    cost_center_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(company_id, current_user)
    return get_time_allocation_summary(db, company_id, project_id, cost_center_id)
