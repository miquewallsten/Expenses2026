from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_setup import AccountingSetup


_ACCOUNTING_SETUP_DEFAULTS = {
    "accounting_review_mode": "all",
    "manager_approval_mode": "disabled",
    "manager_approval_threshold_amount": None,
    "reimbursement_entity_required": False,
    "poliza_required": False,
    "archive_retention_years": 5,
    "account_code_required": False,
    "subaccount_required": False,
    "auto_account_suggestion_enabled": True,
    "cost_center_required": False,
    "project_required": False,
    "client_required": False,
    "allow_accounting_override": True,
    "allow_submit_with_warnings": False,
    "require_final_accounting_review_before_export": True,
    "ai_accounting_assist_enabled": True,
    "ai_accounting_notes": None,
}


def get_accounting_setup(db: Session, company_id: int) -> AccountingSetup | None:
    return db.query(AccountingSetup).filter(AccountingSetup.company_id == company_id).first()


def get_or_create_accounting_setup(db: Session, company_id: int) -> AccountingSetup:
    setup = get_accounting_setup(db, company_id)
    if setup:
        return setup

    setup = AccountingSetup(company_id=company_id, **_ACCOUNTING_SETUP_DEFAULTS)
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup


def upsert_accounting_setup(db: Session, company_id: int, payload) -> AccountingSetup:
    setup = get_accounting_setup(db, company_id)

    if not setup:
        setup = AccountingSetup(company_id=company_id, **_ACCOUNTING_SETUP_DEFAULTS)
        db.add(setup)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(setup, field, value)

    db.commit()
    db.refresh(setup)
    return setup
