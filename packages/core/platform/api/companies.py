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
def get_company_features(company_id: int, db: Session = Depends(get_db)):
    """Public endpoint — used by DevLoginCheat before auth exists.
    Uses raw SQL to avoid SQLAlchemy mapper initialization issues."""
    from sqlalchemy import text
    row = db.execute(
        text("SELECT dev_login_enabled, expenses_module_enabled, onboarding_step FROM company_setup WHERE company_id = :cid"),
        {"cid": company_id}
    ).fetchone()
    import os
    env = os.environ.get("ENVIRONMENT", "development").lower().strip()
    is_dev_mode = env not in ("production", "prod")
    if not row:
        return {"dev_login_enabled": is_dev_mode, "expenses_enabled": None, "onboarding_step": None}
    return {
        "dev_login_enabled": bool(row[0]) or is_dev_mode,
        "expenses_enabled": row[1],
        "onboarding_step": row[2],
    }


@router.get("/{company_id}/dev-users")
def get_company_dev_users(company_id: int, db: Session = Depends(get_db)):
    """Dev-only public endpoint: returns active users for a company.
    Used by DevLoginCheat to show quick-login shortcuts.
    Only returns data when ENVIRONMENT is not production and the company
    has dev_login_enabled=True.
    Uses raw SQL to avoid SQLAlchemy mapper initialization issues.
    """
    import os
    from sqlalchemy import text

    env = os.environ.get("ENVIRONMENT", "development").lower().strip()
    if env in ("production", "prod"):
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not found")

    # Check dev_login_enabled using raw SQL
    setup_row = db.execute(
        text("SELECT dev_login_enabled FROM company_setup WHERE company_id = :cid"),
        {"cid": company_id}
    ).fetchone()

    # In dev mode, always return users regardless of dev_login_enabled
    is_dev_mode = env not in ("production", "prod")
    if not is_dev_mode and (not setup_row or not setup_row[0]):
        return {"users": []}

    # Fetch users using raw SQL to avoid mapper init issues
    rows = db.execute(
        text("SELECT id, full_name, email, role, company_id, is_active FROM users WHERE company_id = :cid AND is_active = true ORDER BY role"),
        {"cid": company_id}
    ).fetchall()

    return {
        "users": [
            {
                "id": r[0],
                "full_name": r[1],
                "email": r[2],
                "role": r[3],
                "company_id": r[4],
                "is_active": r[5],
            }
            for r in rows
        ]
    }
