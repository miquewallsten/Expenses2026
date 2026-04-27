"""category_memory_router.py — Phase 8.3 admin inspector.

Read-only listing + delete for ``CategorizationFeedback`` rows, plus a thin
``suggest`` wrapper so admins can probe the kNN behaviour without filing a
real expense. Admin-scoped + same-company.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_super_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.ai.models_categorization_feedback import CategorizationFeedback
from packages.modules.ai.service import categorization_feedback_service as svc


# Super-admin only — kNN feedback store is cross-tenant infrastructure.
router = APIRouter(
    prefix="/admin/category-memory",
    tags=["admin", "category-memory"],
    dependencies=[Depends(require_super_admin)],
)


class FeedbackRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    expense_id: Optional[int] = None
    original_category: Optional[str] = None
    corrected_category: str
    description_text: str
    corrected_by_user_id: Optional[int] = None
    created_at: str


@router.get("/{cid}")
def list_feedback(
    cid: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    rows = (
        db.query(CategorizationFeedback)
        .filter(CategorizationFeedback.company_id == cid)
        .order_by(CategorizationFeedback.created_at.desc())
        .limit(limit)
        .all()
    )

    # Aggregate counts by corrected_category for the headline strip.
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.corrected_category] = counts.get(r.corrected_category, 0) + 1
    by_category = sorted(
        ({"category": k, "count": v} for k, v in counts.items()),
        key=lambda x: x["count"],
        reverse=True,
    )

    return {
        "items": [
            {
                "id": r.id,
                "expense_id": r.expense_id,
                "original_category": r.original_category,
                "corrected_category": r.corrected_category,
                "description_text": r.description_text,
                "corrected_by_user_id": r.corrected_by_user_id,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
        "total": len(rows),
        "by_category": by_category,
    }


class SuggestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(..., min_length=1, max_length=1000)


@router.post("/{cid}/suggest")
def suggest_category(
    cid: int,
    body: SuggestRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    res = svc.suggest_category(db, company_id=cid, description_text=body.description)
    return {"suggestion": res}


@router.delete("/{cid}/{feedback_id}")
def delete_feedback(
    cid: int,
    feedback_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row = (
        db.query(CategorizationFeedback)
        .filter(
            CategorizationFeedback.company_id == cid,
            CategorizationFeedback.id == feedback_id,
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Feedback row not found")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": feedback_id}
