from sqlalchemy.orm import Session

from packages.core.platform.models_export_bundle_config import ExportBundleConfig

_DEFAULTS = {
    "bundle_name_pattern": "company{company_id}_{date}_export_bundle",
    "export_format": "json",
}


def get_export_bundle_config(db: Session, company_id: int) -> ExportBundleConfig | None:
    return (
        db.query(ExportBundleConfig)
        .filter(ExportBundleConfig.company_id == company_id)
        .first()
    )


def get_or_create_export_bundle_config(db: Session, company_id: int) -> ExportBundleConfig:
    config = get_export_bundle_config(db, company_id)
    if config:
        return config

    config = ExportBundleConfig(company_id=company_id, **_DEFAULTS)
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def upsert_export_bundle_config(db: Session, company_id: int, payload) -> ExportBundleConfig:
    config = get_export_bundle_config(db, company_id)

    if not config:
        config = ExportBundleConfig(company_id=company_id, **_DEFAULTS)
        db.add(config)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, field, value)

    db.commit()
    db.refresh(config)
    return config
