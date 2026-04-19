from sqlalchemy.orm import Session

from packages.core.config_engine.models.setup_session import SetupSession
from packages.core.config_engine.schemas.setup_session import SetupSessionCreate


VALID_SETUP_STAGE_TRANSITIONS = {
    "intake": ["accounting_setup"],
    "accounting_setup": ["tax_rules"],
    "tax_rules": ["approval_workflow"],
    "approval_workflow": ["complete"],
    "complete": [],
}


def create_setup_session(db: Session, payload: SetupSessionCreate) -> SetupSession:
    session = SetupSession(company_id=payload.company_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_setup_session(db: Session, session_id: int) -> SetupSession | None:
    return db.query(SetupSession).filter(SetupSession.id == session_id).first()


def advance_setup_stage(db: Session, session_id: int, next_stage: str) -> SetupSession | None:
    session = db.query(SetupSession).filter(SetupSession.id == session_id).first()

    if not session:
        return None

    allowed = VALID_SETUP_STAGE_TRANSITIONS.get(session.current_stage, [])

    if next_stage not in allowed:
        raise ValueError("Invalid setup stage transition")

    session.current_stage = next_stage
    db.commit()
    db.refresh(session)
    return session
