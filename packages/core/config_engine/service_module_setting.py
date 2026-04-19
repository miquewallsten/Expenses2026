from sqlalchemy.orm import Session

from packages.core.config_engine.models_module_setting import ModuleSetting
from packages.core.config_engine.schemas_module_setting import ModuleSettingCreate


def upsert_module_setting(db: Session, payload: ModuleSettingCreate) -> ModuleSetting:
    existing = (
        db.query(ModuleSetting)
        .filter(
            ModuleSetting.company_id == payload.company_id,
            ModuleSetting.module_key == payload.module_key,
            ModuleSetting.setting_key == payload.setting_key,
        )
        .first()
    )

    if existing:
        existing.setting_value = payload.setting_value
        db.commit()
        db.refresh(existing)
        return existing

    row = ModuleSetting(
        company_id=payload.company_id,
        module_key=payload.module_key,
        setting_key=payload.setting_key,
        setting_value=payload.setting_value,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_module_settings(
    db: Session, company_id: int, module_key: str
) -> list[ModuleSetting]:
    return (
        db.query(ModuleSetting)
        .filter(
            ModuleSetting.company_id == company_id,
            ModuleSetting.module_key == module_key,
        )
        .order_by(ModuleSetting.id)
        .all()
    )


def get_module_settings_map(
    db: Session, company_id: int, module_key: str
) -> dict[str, str]:
    rows = list_module_settings(db, company_id, module_key)
    return {row.setting_key: row.setting_value for row in rows}
