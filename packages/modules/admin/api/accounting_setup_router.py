from fastapi import APIRouter, Depends
from packages.core.platform.module_gate import require_module
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_permission, require_same_company
from packages.core.platform.models_user import User
from apps.api.deps import get_db
from packages.modules.admin.schemas.accounting_setup import (
    AccountingSetupRead,
    AccountingSetupUpdate,
)
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
    upsert_accounting_setup,
)

router = APIRouter(
    prefix="/admin/accounting-setup",
    tags=["admin"],
    dependencies=[Depends(require_permission("accounting:configure")), Depends(require_module("accounting"))],
)


@router.get("/{company_id}", response_model=AccountingSetupRead)
def get_accounting_setup_route(company_id: int, db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)):
    return get_or_create_accounting_setup(db, company_id)


@router.put("/{company_id}", response_model=AccountingSetupRead)
def upsert_accounting_setup_route(
    company_id: int,
    data: AccountingSetupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = "accountant" if current_user.role == "accounting" else "admin"
    return upsert_accounting_setup(db, company_id, data, configured_by_role=role)


@router.patch("/{company_id}", response_model=AccountingSetupRead)
def patch_accounting_setup_route(
    company_id: int,
    data: AccountingSetupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    role = "accountant" if current_user.role == "accounting" else "admin"
    return upsert_accounting_setup(db, company_id, data, configured_by_role=role)
