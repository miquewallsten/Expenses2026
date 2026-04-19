from sqlalchemy.orm import Session

from packages.core.platform.models_approval_setup import ApprovalSetup


_APPROVAL_SETUP_DEFAULTS = {
    "approval_mode": "none",
    "manager_threshold_amount": None,
    "accounting_threshold_amount": None,
    "require_manager_for_all_employees": False,
    "require_accounting_for_all_expenses": True,
    "allow_self_submission_without_manager": True,
    "allow_resubmission_after_rejection": True,
    "escalate_policy_failures_to_accounting": True,
    "escalate_international_to_accounting": True,
    "escalate_missing_documents_to_manager": False,
    "ai_approval_assist_enabled": True,
    "ai_approval_notes": None,
}


def get_approval_setup(db: Session, company_id: int) -> ApprovalSetup | None:
    return db.query(ApprovalSetup).filter(ApprovalSetup.company_id == company_id).first()


def get_or_create_approval_setup(db: Session, company_id: int) -> ApprovalSetup:
    setup = get_approval_setup(db, company_id)
    if setup:
        return setup

    setup = ApprovalSetup(company_id=company_id, **_APPROVAL_SETUP_DEFAULTS)
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup


def upsert_approval_setup(db: Session, company_id: int, payload) -> ApprovalSetup:
    setup = get_approval_setup(db, company_id)

    if not setup:
        setup = ApprovalSetup(company_id=company_id, **_APPROVAL_SETUP_DEFAULTS)
        db.add(setup)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(setup, field, value)

    db.commit()
    db.refresh(setup)
    return setup
