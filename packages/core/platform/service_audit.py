from sqlalchemy.orm import Session

from packages.core.platform.models_audit import AuditLog


def log_event(
    db: Session,
    entity_type: str,
    entity_id: int,
    action: str,
    actor_user_id: int | None,
    detail_text: str,
    company_id: int | None = None,
) -> AuditLog:
    entry = AuditLog(
        company_id=company_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_user_id=actor_user_id,
        detail_text=detail_text,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
