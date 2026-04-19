from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.admin.schemas.approval_setup import ApprovalSetupRead, ApprovalSetupUpdate
from packages.modules.admin.service.approval_setup_service import (
    get_or_create_approval_setup,
    upsert_approval_setup,
)

router = APIRouter(prefix="/admin/approval-setup", tags=["admin"])


@router.get("/{company_id}", response_model=ApprovalSetupRead)
def get_approval_setup_route(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_approval_setup(db, company_id)


@router.put("/{company_id}", response_model=ApprovalSetupRead)
def upsert_approval_setup_route(company_id: int, data: ApprovalSetupUpdate, db: Session = Depends(get_db)):
    return upsert_approval_setup(db, company_id, data)
