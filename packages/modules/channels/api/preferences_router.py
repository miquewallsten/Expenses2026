"""Phase 1.7 — per-user notification preferences API.

Endpoints
---------
GET  /me/notification-preferences  → list current rows
PATCH /me/notification-preferences → upsert one (event_type required)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.channels.service.preferences import (
    list_preferences,
    upsert_preference,
)


router = APIRouter(prefix="/me/notification-preferences", tags=["me"])


class PreferenceOut(BaseModel):
    event_type: str
    email_enabled: bool
    whatsapp_enabled: bool
    digest_only: bool

    model_config = {"from_attributes": True}


class PreferenceUpsert(BaseModel):
    event_type: str = Field(min_length=1, max_length=80)
    email_enabled: bool | None = None
    whatsapp_enabled: bool | None = None
    digest_only: bool | None = None


@router.get("", response_model=list[PreferenceOut])
def list_my_preferences(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PreferenceOut]:
    rows = list_preferences(db, user.id)
    return [PreferenceOut.model_validate(r) for r in rows]


@router.patch("", response_model=PreferenceOut)
def upsert_my_preference(
    body: PreferenceUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PreferenceOut:
    if all(
        v is None
        for v in (body.email_enabled, body.whatsapp_enabled, body.digest_only)
    ):
        raise HTTPException(
            status_code=400,
            detail="At least one of email_enabled / whatsapp_enabled / digest_only is required.",
        )
    row = upsert_preference(
        db,
        user_id=user.id,
        event_type=body.event_type,
        email_enabled=body.email_enabled,
        whatsapp_enabled=body.whatsapp_enabled,
        digest_only=body.digest_only,
    )
    return PreferenceOut.model_validate(row)
