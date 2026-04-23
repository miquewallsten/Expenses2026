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
    "has_accounting_team": True,
    "has_subcontractors": False,
    "operates_multi_entity": False,
    "operates_multi_country": False,
    "allocation_dimensions": "project_client_cost_center",
    "allow_split_allocations": True,
    "expenses_module_enabled": True,
    "time_allocation_module_enabled": False,
    "subcontractor_module_enabled": False,
    "approvals_module_enabled": True,
    "accounting_module_enabled": True,
    "archive_module_enabled": True,
    "ai_copilot_enabled": True,
    "ai_setup_completed": False,
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
