from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_draft import SetupDraft
from packages.core.config_engine.models.config_version import ConfigVersion


def publish_draft(db: Session, draft_id: int) -> ConfigVersion | None:
    draft = db.query(SetupDraft).filter(SetupDraft.id == draft_id).first()

    if not draft:
        return None

    if draft.status != "approved":
        raise ValueError("Only approved drafts can be published")

    config = ConfigVersion(
        setup_session_id=draft.setup_session_id,
        config_type=draft.draft_type,
        content_text=draft.content_text,
    )
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


def list_config_versions(db: Session, setup_session_id: int) -> list[ConfigVersion]:
    return db.query(ConfigVersion).filter(ConfigVersion.setup_session_id == setup_session_id).all()


def get_latest_config_by_type(
    db: Session,
    setup_session_id: int,
    config_type: str,
) -> ConfigVersion | None:
    return (
        db.query(ConfigVersion)
        .filter(
            ConfigVersion.setup_session_id == setup_session_id,
            ConfigVersion.config_type == config_type,
            ConfigVersion.status == "active",
        )
        .order_by(ConfigVersion.id.desc())
        .first()
    )
