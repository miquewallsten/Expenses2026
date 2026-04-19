from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_artifact import SetupArtifact
from packages.core.config_engine.models.setup_session import SetupSession
from packages.core.config_engine.schemas.setup_artifact import SetupArtifactCreate


def create_artifact(db: Session, payload: SetupArtifactCreate) -> SetupArtifact:
    setup_session = db.query(SetupSession).filter(SetupSession.id == payload.setup_session_id).first()

    if not setup_session:
        raise ValueError("Setup session not found")

    artifact = SetupArtifact(
        setup_session_id=payload.setup_session_id,
        artifact_type=payload.artifact_type,
        filename=payload.filename,
        content_text=payload.content_text,
    )
    db.add(artifact)
    db.commit()
    db.refresh(artifact)
    return artifact


def list_artifacts(db: Session, setup_session_id: int) -> list[SetupArtifact]:
    return db.query(SetupArtifact).filter(SetupArtifact.setup_session_id == setup_session_id).all()
