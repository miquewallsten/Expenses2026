from sqlalchemy.orm import Session

from packages.core.platform.models_company_module import CompanyModule
from packages.core.platform.models_module import PlatformModule
from packages.core.platform.schemas_module import CompanyModuleCreate, PlatformModuleCreate


def create_platform_module(db: Session, payload: PlatformModuleCreate) -> PlatformModule:
    existing = db.query(PlatformModule).filter(PlatformModule.key == payload.key).first()
    if existing:
        raise ValueError("Module with this key already exists")
    module = PlatformModule(**payload.model_dump())
    db.add(module)
    db.commit()
    db.refresh(module)
    return module


def list_platform_modules(db: Session) -> list[PlatformModule]:
    return db.query(PlatformModule).order_by(PlatformModule.id).all()


def enable_company_module(db: Session, payload: CompanyModuleCreate) -> CompanyModule:
    record = (
        db.query(CompanyModule)
        .filter(
            CompanyModule.company_id == payload.company_id,
            CompanyModule.module_key == payload.module_key,
        )
        .first()
    )
    if record:
        record.enabled = payload.enabled
        record.config_json = payload.config_json
        db.commit()
        db.refresh(record)
        return record
    record = CompanyModule(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_company_modules(db: Session, company_id: int) -> list[CompanyModule]:
    return (
        db.query(CompanyModule)
        .filter(CompanyModule.company_id == company_id)
        .all()
    )


def list_enabled_module_keys_for_company(db: Session, company_id: int) -> list[str]:
    rows = (
        db.query(CompanyModule.module_key)
        .filter(
            CompanyModule.company_id == company_id,
            CompanyModule.enabled.is_(True),
        )
        .all()
    )
    return [row.module_key for row in rows]
