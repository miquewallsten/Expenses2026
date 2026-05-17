from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_super_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.schemas import CompanyCreate, CompanyRead, CompanyUpdate
from packages.core.platform.service import (
    create_company,
    delete_company,
    get_company,
    list_companies,
    update_company,
)

router = APIRouter(prefix="/companies", tags=["companies"])


@router.post("/", response_model=CompanyRead)
def create_company_route(payload: CompanyCreate, db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    try:
        return create_company(db, payload)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/", response_model=list[CompanyRead])
def list_companies_route(db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    return list_companies(db)


@router.get("/{company_id}", response_model=CompanyRead)
def get_company_route(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # Super admins can read any company; tenant users can only read their own
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    company = get_company(db, company_id)

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    return company


@router.patch("/{company_id}", response_model=CompanyRead)
def update_company_route(
    company_id: int,
    payload: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    try:
        company = update_company(db, company_id, payload)

        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        return company
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{company_id}")
def delete_company_route(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_super_admin)):
    deleted = delete_company(db, company_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Company not found")

    return {"status": "deleted"}
@router.get("/{company_id}/features")
def get_company_features(company_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Authenticated endpoint to check enabled features for a company."""
    setup = db.query(CompanySetup).filter(CompanySetup.company_id == company_id).first()
    if not setup:
        return {"dev_login_enabled": False}
    return {
        "dev_login_enabled": setup.dev_login_enabled,
        "expenses_enabled": setup.expenses_module_enabled,
        "onboarding_step": setup.onboarding_step,
    }
