from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.admin.schemas.workflow_setup import WorkflowSetupRead, WorkflowSetupUpdate
from packages.modules.admin.service.workflow_setup_service import (
    get_or_create_workflow_setup,
    upsert_workflow_setup,
)

router = APIRouter(prefix="/admin/workflow-setup", tags=["admin"])


@router.get("/{company_id}", response_model=WorkflowSetupRead)
def get_workflow_setup_route(company_id: int, db: Session = Depends(get_db)):
    return get_or_create_workflow_setup(db, company_id)


@router.put("/{company_id}", response_model=WorkflowSetupRead)
def upsert_workflow_setup_route(company_id: int, data: WorkflowSetupUpdate, db: Session = Depends(get_db)):
    return upsert_workflow_setup(db, company_id, data)
