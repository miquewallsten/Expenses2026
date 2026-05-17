from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.schemas_workflow import (
    WorkflowStageCreate,
    WorkflowStageRead,
    WorkflowTransitionCreate,
    WorkflowTransitionRead,
)
from packages.core.platform.service_workflow import (
    create_workflow_stage,
    list_workflow_stages,
    create_workflow_transition,
    list_workflow_transitions,
    get_next_transitions,
)

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.post("/stages", response_model=WorkflowStageRead)
def create_stage_route(data: WorkflowStageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(data.company_id, current_user)
    return create_workflow_stage(db, data)


@router.get("/stages", response_model=list[WorkflowStageRead])
def list_stages_route(
    company_id: int | None = None,
    module_key: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Non-super-admins can only see their own company's workflows
    if not getattr(current_user, "is_super_admin", False):
        company_id = current_user.company_id
    return list_workflow_stages(db, company_id=company_id, module_key=module_key)


@router.post("/transitions", response_model=WorkflowTransitionRead)
def create_transition_route(data: WorkflowTransitionCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(data.company_id, current_user)
    return create_workflow_transition(db, data)


@router.get("/transitions", response_model=list[WorkflowTransitionRead])
def list_transitions_route(
    company_id: int | None = None,
    module_key: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Non-super-admins can only see their own company's workflows
    if not getattr(current_user, "is_super_admin", False):
        company_id = current_user.company_id
    return list_workflow_transitions(db, company_id=company_id, module_key=module_key)


@router.get("/next-transitions", response_model=list[WorkflowTransitionRead])
def next_transitions_route(
    company_id: int,
    module_key: str,
    current_stage_key: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not getattr(current_user, "is_super_admin", False):
        require_same_company(company_id, current_user)
    return get_next_transitions(db, company_id=company_id, module_key=module_key, current_stage_key=current_stage_key)
