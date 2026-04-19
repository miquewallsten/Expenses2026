from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_session import SetupSession
from packages.core.config_engine.models.setup_artifact import SetupArtifact
from packages.core.config_engine.service.inference_service import create_inference


def run_setup_session_inference(db: Session, session_id: int, inference_type: str) -> dict | None:
    session = db.query(SetupSession).filter(SetupSession.id == session_id).first()

    if not session:
        return None

    artifacts = db.query(SetupArtifact).filter(
        SetupArtifact.setup_session_id == session_id
    ).all()

    if not artifacts:
        raise ValueError("No artifacts found for setup session")

    combined_text = "\n".join([a.content_text for a in artifacts])

    result_text = f"Inference type: {inference_type}\nArtifacts analyzed: {len(artifacts)}\nSummary:\n{combined_text[:1000]}"

    inference = create_inference(
        db,
        setup_session_id=session_id,
        inference_type=inference_type,
        result_text=result_text,
    )

    return {
        "session_id": session_id,
        "inference_type": inference_type,
        "artifacts_analyzed": len(artifacts),
        "inference_id": inference.id,
    }
