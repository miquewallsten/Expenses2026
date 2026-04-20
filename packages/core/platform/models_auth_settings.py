from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CompanyAuthSettings(Base):
    __tablename__ = "company_auth_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, unique=True)

    # ── Magic Link ──────────────────────────────────────────────────────────────
    magic_link_enabled: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # JSON array of allowed email domains, e.g. '["acme.com","acme.mx"]'
    # NULL = no restriction (any domain allowed)
    allowed_email_domains: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── SSO / SAML (future) ─────────────────────────────────────────────────────
    sso_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    sso_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sso_metadata_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # ── Session settings ────────────────────────────────────────────────────────
    session_timeout_hours: Mapped[int] = mapped_column(Integer, default=24, server_default="24")
    require_mfa: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
