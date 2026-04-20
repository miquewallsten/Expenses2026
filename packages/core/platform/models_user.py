from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="employee")

    # ── Extended profile ────────────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # ── Org assignment ──────────────────────────────────────────────────────────
    # Soft FK — avoids complex cross-model dependency during migrations
    legal_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Secretary → boss: who this user submits expenses on behalf of
    delegates_for_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Capability flags ────────────────────────────────────────────────────────
    can_create_expenses: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    can_create_corporate_expenses: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    can_invoice_corporation: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_amex_reconciler: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    requires_time_tracking: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    has_executive_reporting: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    # ── Channel identifiers ─────────────────────────────────────────────────────
    whatsapp_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True, unique=True)
    whatsapp_verified: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    whatsapp_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # ── Audit timestamps ────────────────────────────────────────────────────────
    invited_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class MagicLinkToken(Base):
    __tablename__ = "magic_link_tokens"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
