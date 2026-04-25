from sqlalchemy.orm import Session

from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_legal_entity import LegalEntity


_COMPANY_SETUP_DEFAULTS = {
    "display_name": None,
    "country_code": "MX",
    "base_currency": "MXN",
    "timezone": "America/Mexico_City",
    "language_code": "es-MX",
    "industry": None,
    "employee_count_range": None,
    "has_managers": False,
    "allocation_dimensions": "project_client_cost_center",
    "allow_split_allocations": True,
    "expenses_module_enabled": True,
    "time_allocation_module_enabled": False,
    "subcontractor_module_enabled": False,
    "approvals_module_enabled": True,
    "accounting_module_enabled": True,
    "archive_module_enabled": True,
    "purchase_requests_module_enabled": False,
    "amex_reconciliation_module_enabled": False,
    "ai_setup_notes": None,
    "ai_setup_last_summary": None,
}


def get_company_setup(db: Session, company_id: int) -> CompanySetup | None:
    return db.query(CompanySetup).filter(CompanySetup.company_id == company_id).first()


def get_or_create_company_setup(db: Session, company_id: int) -> CompanySetup:
    setup = get_company_setup(db, company_id)
    if setup:
        return setup

    setup = CompanySetup(company_id=company_id, **_COMPANY_SETUP_DEFAULTS)
    db.add(setup)
    db.commit()
    db.refresh(setup)
    return setup


def upsert_company_setup(db: Session, company_id: int, payload) -> CompanySetup:
    setup = get_company_setup(db, company_id)

    if not setup:
        setup = CompanySetup(company_id=company_id, **_COMPANY_SETUP_DEFAULTS)
        db.add(setup)

    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(setup, field, value)

    # Keep the expense policy in sync for fields that the admin Setup Studio
    # owns but that the portal-config / expense runtime reads from
    # ``company_expense_policies``. Without this the admin's choice silently
    # diverges from what employees see.
    policy_synced_fields = {"allocation_dimensions", "allow_split_allocations"}
    if policy_synced_fields & data.keys():
        from packages.core.platform.models_expense_policy import CompanyExpensePolicy
        policy = (
            db.query(CompanyExpensePolicy)
            .filter(CompanyExpensePolicy.company_id == company_id)
            .first()
        )
        if policy is None:
            policy = CompanyExpensePolicy(company_id=company_id)
            db.add(policy)
        for field in policy_synced_fields & data.keys():
            setattr(policy, field, data[field])

    db.commit()
    db.refresh(setup)
    return setup


def list_legal_entities(db: Session, company_id: int) -> list[LegalEntity]:
    return db.query(LegalEntity).filter(LegalEntity.company_id == company_id).all()


def create_legal_entity(db: Session, payload) -> LegalEntity:
    entity = LegalEntity(**payload.model_dump())
    db.add(entity)
    db.commit()
    db.refresh(entity)
    return entity


def update_legal_entity(db: Session, entity_id: int, payload) -> LegalEntity | None:
    entity = db.query(LegalEntity).filter(LegalEntity.id == entity_id).first()
    if not entity:
        return None

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(entity, field, value)

    db.commit()
    db.refresh(entity)
    return entity


def delete_legal_entity(db: Session, entity_id: int) -> bool:
    entity = db.query(LegalEntity).filter(LegalEntity.id == entity_id).first()
    if not entity:
        return False

    db.delete(entity)
    db.commit()
    return True
