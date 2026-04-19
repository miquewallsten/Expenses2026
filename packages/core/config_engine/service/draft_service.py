from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_draft import SetupDraft
from packages.core.config_engine.models.setup_inference import SetupInference


def generate_draft_from_inference(db: Session, setup_session_id: int, draft_type: str) -> SetupDraft | None:
    inference = (
        db.query(SetupInference)
        .filter(SetupInference.setup_session_id == setup_session_id)
        .order_by(SetupInference.id.desc())
        .first()
    )

    if not inference:
        return None

    draft = SetupDraft(
        setup_session_id=setup_session_id,
        draft_type=draft_type,
        content_text=inference.result_text,
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return draft


def approve_draft(db: Session, draft_id: int) -> SetupDraft | None:
    draft = db.query(SetupDraft).filter(SetupDraft.id == draft_id).first()

    if not draft:
        return None

    draft.status = "approved"
    db.commit()
    db.refresh(draft)
    return draft


def list_drafts(db: Session, setup_session_id: int) -> list[SetupDraft]:
    return db.query(SetupDraft).filter(SetupDraft.setup_session_id == setup_session_id).all()
