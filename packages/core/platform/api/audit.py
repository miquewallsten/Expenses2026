from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_audit import AuditLog

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/")
def list_audit_logs(
    entity_type: str | None = None,
    entity_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(AuditLog)
    if entity_type is not None:
        query = query.filter(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(AuditLog.entity_id == entity_id)
    return query.order_by(AuditLog.id.desc()).all()
