"""audit_log_router.py — generic admin audit log viewer.

Surfaces the company's ``AuditLog`` rows so admins can investigate tool
RBAC denials (Phase 8.4), AI policy edits (Phase 8.10), action-link
consumption (Phase 1.4), expense transitions, and any other event the
backend emits via ``log_event(...)``.

GET ``/admin/audit-log/{company_id}`` returns the most recent rows
filterable by ``action`` (exact) and ``entity_type`` (exact), cursor-
paginated by descending ``id`` for stable scrolling.

GET ``/admin/audit-log/{company_id}/actions`` returns the distinct
``action`` strings present for the company, used to populate the filter
pills in the admin UI without hard-coding a list.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_audit import AuditLog
from packages.core.platform.models_user import User


router = APIRouter(
    prefix="/admin/audit-log",
    tags=["admin", "audit-log"],
    dependencies=[Depends(require_admin)],
)


class AuditLogRow(BaseModel):
    id: int
    company_id: Optional[int]
    entity_type: str
    entity_id: int
    action: str
    actor_user_id: Optional[int]
    detail_text: str
    created_at: str


class AuditLogPage(BaseModel):
    rows: list[AuditLogRow]
    next_cursor: Optional[int]


@router.get("/{company_id}", response_model=AuditLogPage)
def list_audit_log(
    company_id: int,
    action: Optional[str] = Query(default=None, max_length=50),
    entity_type: Optional[str] = Query(default=None, max_length=50),
    cursor: Optional[int] = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AuditLogPage:
    require_same_company(company_id, current_user)

    stmt = select(AuditLog).where(AuditLog.company_id == company_id)
    if action:
        stmt = stmt.where(AuditLog.action == action)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if cursor is not None:
        stmt = stmt.where(AuditLog.id < cursor)
    stmt = stmt.order_by(desc(AuditLog.id)).limit(limit + 1)

    items = list(db.execute(stmt).scalars())
    has_more = len(items) > limit
    rows = items[:limit]

    return AuditLogPage(
        rows=[
            AuditLogRow(
                id=r.id,
                company_id=r.company_id,
                entity_type=r.entity_type,
                entity_id=r.entity_id,
                action=r.action,
                actor_user_id=r.actor_user_id,
                detail_text=r.detail_text or "",
                created_at=r.created_at.isoformat() if r.created_at else "",
            )
            for r in rows
        ],
        next_cursor=rows[-1].id if has_more and rows else None,
    )


@router.get("/{company_id}/actions", response_model=list[str])
def list_actions(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[str]:
    require_same_company(company_id, current_user)
    rows = db.execute(
        select(AuditLog.action)
        .where(AuditLog.company_id == company_id)
        .distinct()
        .order_by(AuditLog.action)
    ).all()
    return [r[0] for r in rows if r[0]]
