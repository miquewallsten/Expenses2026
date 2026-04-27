"""ai_governance_router.py — Per-tenant AI governance policy (Phase 8.10).

GET   /admin/ai-policy/{company_id}  → fetch (creates row with defaults if missing)
PATCH /admin/ai-policy/{company_id}  → update; partial fields; audited.

Distinct from ``ai_policy_router`` which manages expense-validation rules.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_ai_governance import PII_LEVELS
from packages.core.platform.models_user import User
from packages.modules.agent.core import governance as governance_service


router = APIRouter(
    prefix="/admin/ai-policy",
    tags=["admin", "ai-governance"],
    dependencies=[Depends(require_admin)],
)


class AiPolicyRead(BaseModel):
    company_id: int
    ai_enabled: bool
    allowed_models: str
    pii_redaction_level: str
    max_tokens_per_call: int
    monthly_token_budget: int
    notes: Optional[str] = None


class AiPolicyPatch(BaseModel):
    ai_enabled: Optional[bool] = None
    allowed_models: Optional[str] = Field(default=None, max_length=512)
    pii_redaction_level: Optional[Literal["strict", "standard", "off"]] = None
    max_tokens_per_call: Optional[int] = Field(default=None, ge=0)
    monthly_token_budget: Optional[int] = Field(default=None, ge=0)
    notes: Optional[str] = None


@router.get("/{company_id}", response_model=AiPolicyRead)
def get_policy(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiPolicyRead:
    require_same_company(company_id, current_user)
    row = governance_service.get_or_create(db, company_id)
    return AiPolicyRead(**governance_service.to_dict(row))


@router.patch("/{company_id}", response_model=AiPolicyRead)
def patch_policy(
    company_id: int,
    body: AiPolicyPatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AiPolicyRead:
    require_same_company(company_id, current_user)
    try:
        row = governance_service.update(
            db,
            company_id=company_id,
            actor_user_id=current_user.id,
            patch=body.model_dump(exclude_unset=True),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return AiPolicyRead(**governance_service.to_dict(row))
