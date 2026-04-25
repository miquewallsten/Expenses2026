from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User
from packages.modules.expenses.api._security import get_expense_for_user

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


# ── Phase 4.9 — Per-expense audit trail (auth + cross-co + pagination) ─────


class AuditEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    action: str
    actor_user_id: int | None
    detail_text: str
    created_at: object


class ExpenseAuditPage(BaseModel):
    items: list[AuditEntryRead]
    next_cursor: int | None


@router.get("/expense/{expense_id}", response_model=ExpenseAuditPage)
def get_expense_audit(
    expense_id: int,
    cursor: int | None = Query(default=None, description="last id seen"),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ExpenseAuditPage:
    # Cross-company: 404 if not in caller's company
    get_expense_for_user(expense_id, db, current_user)

    q = (
        db.query(AuditLog)
        .filter(
            AuditLog.entity_type == "expense",
            AuditLog.entity_id == expense_id,
        )
        .order_by(AuditLog.id.desc())
    )
    if cursor is not None:
        q = q.filter(AuditLog.id < cursor)
    rows = q.limit(limit + 1).all()
    has_more = len(rows) > limit
    items = rows[:limit]
    next_cursor = items[-1].id if has_more and items else None
    return ExpenseAuditPage(
        items=[AuditEntryRead.model_validate(r) for r in items],
        next_cursor=next_cursor,
    )

