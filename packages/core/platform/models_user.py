from datetime import datetime
from typing import Optional, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, JSON, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Null for super-admins who have no company association
    company_id: Mapped[Optional[int]] = mapped_column(Integer, index=True, nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    full_name: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50), default="employee")

    # ── Extended profile ────────────────────────────────────────────────────────
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    # Platform operator (cross-tenant). NEVER granted to customer users.
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false", nullable=False)
    # Password hash for super-admin login. Null for magic-link-only users.
    password_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    job_title: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    # Responsibility tags, e.g. ["PAYMENT_STAMP", "SAT_RECONCILER"]
    tags: Mapped[Optional[dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # ── Org assignment ──────────────────────────────────────────────────────────
    # Soft FK — avoids complex cross-model dependency during migrations
    legal_entity_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # Executive Assistant → boss: who this user submits expenses on behalf of
    delegates_for_user_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # ── Capability flags ────────────────────────────────────────────────────────
    # These flags control what functional areas a user can access, regardless of role.
    # An admin with can_create_expenses=False is a configuration-only admin who
    # focuses on setup and doesn't submit expenses themselves.
    can_create_expenses: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    can_create_corporate_expenses: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    can_invoice_corporation: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    is_amex_reconciler: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Subcontractor user — can submit invoices/expenses as a subcontractor.
    # Only relevant when the subcontractor add-on is installed.
    is_subcontractor: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    requires_time_tracking: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    has_executive_reporting: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Accounting access: when True, user can access Accounting Review and Finance Analytics.
    # Used to give admins accounting visibility without changing their role.
    can_access_accounting: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Analytics access: when True, user can view Finance Analytics dashboard.
    # Separate from can_access_accounting for fine-grained control.
    can_view_analytics: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

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
