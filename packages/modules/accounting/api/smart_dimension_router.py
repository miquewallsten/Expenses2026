"""Smart dimension suggestion endpoint."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.accounting.service.smart_dimension_service import suggest_dimensions

router = APIRouter(
    prefix="/accounting/smart-dimension",
    tags=["accounting"],
    dependencies=[Depends(require_permission("accounting:configure"))],
)


@router.post("/{company_id}/suggest/{expense_id}")
def suggest(company_id: int, expense_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return suggest_dimensions(db, company_id, expense_id)
