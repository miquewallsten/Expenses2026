from sqlalchemy.orm import Session

from packages.core.platform.models_workflow_setup import WorkflowSetup


_WORKFLOW_SETUP_DEFAULTS = {
    "default_expense_workflow_mode": "standard",
    "auto_submit_on_complete_upload": False,
    "block_submit_on_failed_validation": True,
    "allow_submit_with_warnings": False,
    "auto_assign_review_stage": True,
    "route_policy_failures_to": "accounting",
    "route_missing_documents_to": "employee",
    "route_international_expenses_to": "accounting",
    "allow_draft_save": True,
    "allow_resubmit_after_return": True,
    "show_next_action_guidance": True,
    "ai_workflow_assist_enabled": True,
    "ai_workflow_notes": None,
}


def get_workflow_setup(db: Session, company_id: int) -> WorkflowSetup | None:
    return db.query(WorkflowSetup).filter(WorkflowSetup.company_id == company_id).first()


def get_or_create_workflow_setup(db: Session, company_id: int) -> WorkflowSetup:
    setup = get_workflow_setup(db, company_id)
    if setup:
        return setup

    setup = WorkflowSetup(company_id=company_id, **_WORKFLOW_SETUP_DEFAULTS)
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup


def upsert_workflow_setup(db: Session, company_id: int, payload) -> WorkflowSetup:
    setup = get_workflow_setup(db, company_id)

    if not setup:
        setup = WorkflowSetup(company_id=company_id, **_WORKFLOW_SETUP_DEFAULTS)
        db.add(setup)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(setup, field, value)

    db.commit()
    db.refresh(setup)
    return setup
