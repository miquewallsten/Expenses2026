"""Accounting dashboard endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.accounting.service.accounting_dashboard_service import get_dashboard

router = APIRouter(
    prefix="/accounting/dashboard",
    tags=["accounting"],
    dependencies=[Depends(require_permission("accounting:configure"))],
)


@router.get("/{company_id}")
def dashboard(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return get_dashboard(db, company_id)
