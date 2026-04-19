from sqlalchemy.orm import Session

from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition
from packages.core.platform.schemas_workflow import WorkflowStageCreate, WorkflowTransitionCreate


def create_workflow_stage(db: Session, data: WorkflowStageCreate) -> WorkflowStage:
    obj = WorkflowStage(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_workflow_stages(
    db: Session,
    company_id: int | None = None,
    module_key: str | None = None,
) -> list[WorkflowStage]:
    q = db.query(WorkflowStage)
    if company_id is not None:
        q = q.filter(WorkflowStage.company_id == company_id)
    if module_key is not None:
        q = q.filter(WorkflowStage.module_key == module_key)
    return q.order_by(WorkflowStage.stage_order).all()


def create_workflow_transition(db: Session, data: WorkflowTransitionCreate) -> WorkflowTransition:
    obj = WorkflowTransition(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_workflow_transitions(
    db: Session,
    company_id: int | None = None,
    module_key: str | None = None,
) -> list[WorkflowTransition]:
    q = db.query(WorkflowTransition)
    if company_id is not None:
        q = q.filter(WorkflowTransition.company_id == company_id)
    if module_key is not None:
        q = q.filter(WorkflowTransition.module_key == module_key)
    return q.all()


def get_next_transitions(
    db: Session,
    company_id: int,
    module_key: str,
    current_stage_key: str,
) -> list[WorkflowTransition]:
    return (
        db.query(WorkflowTransition)
        .filter(
            WorkflowTransition.company_id == company_id,
            WorkflowTransition.module_key == module_key,
            WorkflowTransition.from_stage_key == current_stage_key,
        )
        .all()
    )
