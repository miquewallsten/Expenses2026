"""platform_api_router.py — Phase 4.2 admin slice.

Admin CRUD for ``PlatformApiKey`` (issue, list, revoke) and
``WebhookSubscription`` (list, create, update, delete). All endpoints are
admin-gated and same-company scoped.

API key plaintext is returned exactly once at creation time; subsequent
listings only expose ``key_prefix``. Webhook secret is auto-generated on
create and returned exactly once; subsequent listings expose only a masked
preview.
"""

from __future__ import annotations

import secrets
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user, require_admin, require_same_company
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.integrations.models_public_api import (
    PlatformApiKey,
    WebhookSubscription,
)
from packages.modules.integrations.service import api_keys as api_keys_service


router = APIRouter(
    prefix="/admin/platform-api",
    tags=["admin", "platform-api"],
    dependencies=[Depends(require_admin)],
)


# ── API keys ───────────────────────────────────────────────────────────────────


class ApiKeyRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    key_prefix: str
    scopes: list[str]
    created_at: str
    last_used_at: Optional[str] = None
    revoked_at: Optional[str] = None


class ApiKeyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    scopes: list[str] = Field(default_factory=list)


class ApiKeyCreated(BaseModel):
    row: ApiKeyRow
    plaintext: str


def _serialize_key(row: PlatformApiKey) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "key_prefix": row.key_prefix,
        "scopes": list(row.scopes or []),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "last_used_at": row.last_used_at.isoformat() if row.last_used_at else None,
        "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
    }


@router.get("/{cid}/keys", response_model=list[ApiKeyRow])
def list_api_keys(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    rows = (
        db.query(PlatformApiKey)
        .filter(PlatformApiKey.company_id == cid)
        .order_by(PlatformApiKey.created_at.desc())
        .all()
    )
    return [_serialize_key(r) for r in rows]


@router.post("/{cid}/keys", response_model=ApiKeyCreated, status_code=status.HTTP_201_CREATED)
def create_api_key(
    cid: int,
    body: ApiKeyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row, plaintext = api_keys_service.generate_api_key(
        db,
        company_id=cid,
        name=body.name.strip(),
        scopes=body.scopes,
        created_by_user_id=current_user.id,
    )
    return {"row": _serialize_key(row), "plaintext": plaintext}


@router.delete("/{cid}/keys/{key_id}")
def revoke_api_key(
    cid: int,
    key_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    ok = api_keys_service.revoke_api_key(db, key_id, company_id=cid)
    if not ok:
        raise HTTPException(status_code=404, detail="key_not_found_or_already_revoked")
    return {"ok": True, "revoked_id": key_id}


# ── Webhook subscriptions ─────────────────────────────────────────────────────


class WebhookRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_type: str
    target_url: str
    is_enabled: bool
    description: Optional[str] = None
    secret_preview: str
    created_at: str


class WebhookCreate(BaseModel):
    event_type: str = Field(..., min_length=1, max_length=80)
    target_url: HttpUrl
    description: Optional[str] = Field(default=None, max_length=255)


class WebhookUpdate(BaseModel):
    event_type: Optional[str] = Field(default=None, min_length=1, max_length=80)
    target_url: Optional[HttpUrl] = None
    description: Optional[str] = Field(default=None, max_length=255)
    is_enabled: Optional[bool] = None


class WebhookCreated(BaseModel):
    row: WebhookRow
    secret: str


def _mask_secret(secret: str) -> str:
    if not secret:
        return ""
    if len(secret) <= 8:
        return "*" * len(secret)
    return f"{secret[:4]}…{secret[-4:]}"


def _serialize_sub(row: WebhookSubscription) -> dict:
    return {
        "id": row.id,
        "event_type": row.event_type,
        "target_url": row.target_url,
        "is_enabled": bool(row.is_enabled),
        "description": row.description,
        "secret_preview": _mask_secret(row.secret or ""),
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.get("/{cid}/webhooks", response_model=list[WebhookRow])
def list_webhooks(
    cid: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    rows = (
        db.query(WebhookSubscription)
        .filter(WebhookSubscription.company_id == cid)
        .order_by(WebhookSubscription.created_at.desc())
        .all()
    )
    return [_serialize_sub(r) for r in rows]


@router.post("/{cid}/webhooks", response_model=WebhookCreated, status_code=status.HTTP_201_CREATED)
def create_webhook(
    cid: int,
    body: WebhookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    secret = secrets.token_urlsafe(32)
    row = WebhookSubscription(
        company_id=cid,
        event_type=body.event_type.strip(),
        target_url=str(body.target_url),
        secret=secret,
        is_enabled=True,
        description=(body.description or None),
        created_by_user_id=current_user.id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"row": _serialize_sub(row), "secret": secret}


@router.patch("/{cid}/webhooks/{sub_id}", response_model=WebhookRow)
def update_webhook(
    cid: int,
    sub_id: int,
    body: WebhookUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row = (
        db.query(WebhookSubscription)
        .filter(
            WebhookSubscription.id == sub_id,
            WebhookSubscription.company_id == cid,
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="webhook_not_found")
    if body.event_type is not None:
        row.event_type = body.event_type.strip()
    if body.target_url is not None:
        row.target_url = str(body.target_url)
    if body.description is not None:
        row.description = body.description or None
    if body.is_enabled is not None:
        row.is_enabled = bool(body.is_enabled)
    db.commit()
    db.refresh(row)
    return _serialize_sub(row)


@router.delete("/{cid}/webhooks/{sub_id}")
def delete_webhook(
    cid: int,
    sub_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_same_company(cid, current_user)
    row = (
        db.query(WebhookSubscription)
        .filter(
            WebhookSubscription.id == sub_id,
            WebhookSubscription.company_id == cid,
        )
        .one_or_none()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="webhook_not_found")
    db.delete(row)
    db.commit()
    return {"ok": True, "deleted_id": sub_id}
