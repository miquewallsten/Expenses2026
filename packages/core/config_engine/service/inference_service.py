from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_inference import SetupInference
from packages.core.config_engine.models.setup_session import SetupSession


def create_inference(db: Session, setup_session_id: int, inference_type: str, result_text: str) -> SetupInference:
    session = db.query(SetupSession).filter(SetupSession.id == setup_session_id).first()

    if not session:
        raise ValueError("Setup session not found")

    inference = SetupInference(
        setup_session_id=setup_session_id,
        inference_type=inference_type,
        result_text=result_text,
    )
    db.add(inference)
    db.commit()
    db.refresh(inference)
    return inference


def list_inferences(db: Session, setup_session_id: int) -> list[SetupInference]:
    return db.query(SetupInference).filter(SetupInference.setup_session_id == setup_session_id).all()
