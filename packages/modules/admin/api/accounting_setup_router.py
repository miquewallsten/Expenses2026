from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.admin.schemas.accounting_setup import (
    AccountingSetupRead,
    AccountingSetupUpdate,
)
from packages.modules.admin.service.accounting_setup_service import (
    get_or_create_accounting_setup,
    upsert_accounting_setup,
)

router = APIRouter(prefix="/admin/accounting-setup", tags=["admin"])


@router.get("/{company_id}", response_model=AccountingSetupRead)
def get_accounting_setup_route(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_accounting_setup(db, company_id)


@router.put("/{company_id}", response_model=AccountingSetupRead)
def upsert_accounting_setup_route(
    company_id: int,
    data: AccountingSetupUpdate,
    db: Session = Depends(get_db),
):
    return upsert_accounting_setup(db, company_id, data)
