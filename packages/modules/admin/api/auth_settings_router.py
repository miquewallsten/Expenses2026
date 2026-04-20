"""auth_settings_router.py — Company authentication settings endpoints.

GET  /admin/auth-settings/{company_id}  → fetch (or default) settings
PUT  /admin/auth-settings/{company_id}  → upsert settings
"""

import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.core.platform.models_auth_settings import CompanyAuthSettings

router = APIRouter(prefix="/admin/auth-settings", tags=["admin", "auth-settings"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AuthSettingsRead(BaseModel):
    company_id: int
    magic_link_enabled: bool
    allowed_email_domains: list[str]
    sso_enabled: bool
    sso_provider: Optional[str]
    sso_metadata_url: Optional[str]
    session_timeout_hours: int
    require_mfa: bool


class AuthSettingsUpdate(BaseModel):
    magic_link_enabled: bool | None = None
    allowed_email_domains: list[str] | None = None
    sso_enabled: bool | None = None
    sso_provider: str | None = None
    sso_metadata_url: str | None = None
    session_timeout_hours: int | None = None
    require_mfa: bool | None = None


_DEFAULTS = AuthSettingsRead(
    company_id=0,
    magic_link_enabled=True,
    allowed_email_domains=[],
    sso_enabled=False,
    sso_provider=None,
    sso_metadata_url=None,
    session_timeout_hours=24,
    require_mfa=False,
)


def _to_read(row: CompanyAuthSettings) -> AuthSettingsRead:
    domains: list[str] = []
    if row.allowed_email_domains:
        try:
            domains = json.loads(row.allowed_email_domains)
        except (ValueError, TypeError):
            domains = []
    return AuthSettingsRead(
        company_id=row.company_id,
        magic_link_enabled=row.magic_link_enabled,
        allowed_email_domains=domains,
        sso_enabled=row.sso_enabled,
        sso_provider=row.sso_provider,
        sso_metadata_url=row.sso_metadata_url,
        session_timeout_hours=row.session_timeout_hours,
        require_mfa=row.require_mfa,
    )


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/{company_id}", response_model=AuthSettingsRead)
def get_auth_settings(company_id: int, db: Session = Depends(get_db)):
    row = db.query(CompanyAuthSettings).filter(
        CompanyAuthSettings.company_id == company_id
    ).first()
    if row is None:
        defaults = _DEFAULTS.model_copy(update={"company_id": company_id})
        return defaults
    return _to_read(row)


@router.put("/{company_id}", response_model=AuthSettingsRead)
def upsert_auth_settings(
    company_id: int,
    payload: AuthSettingsUpdate,
    db: Session = Depends(get_db),
):
    row = db.query(CompanyAuthSettings).filter(
        CompanyAuthSettings.company_id == company_id
    ).first()

    if row is None:
        row = CompanyAuthSettings(company_id=company_id)
        db.add(row)

    if payload.magic_link_enabled is not None:
        row.magic_link_enabled = payload.magic_link_enabled
    if payload.allowed_email_domains is not None:
        row.allowed_email_domains = json.dumps(payload.allowed_email_domains)
    if payload.sso_enabled is not None:
        row.sso_enabled = payload.sso_enabled
    if payload.sso_provider is not None:
        row.sso_provider = payload.sso_provider
    if payload.sso_metadata_url is not None:
        row.sso_metadata_url = payload.sso_metadata_url
    if payload.session_timeout_hours is not None:
        row.session_timeout_hours = max(1, payload.session_timeout_hours)
    if payload.require_mfa is not None:
        row.require_mfa = payload.require_mfa

    db.commit()
    db.refresh(row)
    return _to_read(row)
