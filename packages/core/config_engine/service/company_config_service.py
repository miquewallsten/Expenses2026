from sqlalchemy.orm import Session

from packages.core.config_engine.models.config_version import ConfigVersion


def get_latest_config_for_company(
    db: Session,
    company_id: int,
    config_type: str,
) -> ConfigVersion | None:
    return (
        db.query(ConfigVersion)
        .filter(
            ConfigVersion.setup_session_id == company_id,
            ConfigVersion.config_type == config_type,
            ConfigVersion.status == "active",
        )
        .order_by(ConfigVersion.id.desc())
        .first()
    )
