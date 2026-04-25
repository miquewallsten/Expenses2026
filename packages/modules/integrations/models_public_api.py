"""Public Platform API + outbound webhooks (Phase 4.2).

Lives under the integrations module because it's the gateway for ERPs and
external systems to read approved expenses, polizas, master data, and to
report payment status back to the platform.

Tables here:

- platform_api_keys: per-company hashed API keys with JSON-array scopes.
  The plaintext key is shown exactly once at creation time and stored as
  a SHA-256 hash. `key_prefix` (first 8 chars) is searchable for lookup.

- webhook_subscriptions: per-company subscriptions to platform events.
  Targets are HTTPS URLs; each delivery is HMAC-SHA256 signed using the
  per-subscription secret with timestamp + replay nonce.

- webhook_deliveries: append-only delivery log for retry/observability.
  Reuses the dispatch shape from Phase 1 (NotificationDispatch) so admins
  see one mental model.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


WEBHOOK_DELIVERY_STATUSES = (
    "pending", "delivering", "succeeded", "failed", "abandoned",
)


class PlatformApiKey(Base):
    """API key issued to a company for use against the public /api/v1/* surface."""

    __tablename__ = "platform_api_keys"
    __table_args__ = (
        Index("ix_platform_api_keys_company_active", "company_id", "revoked_at"),
        Index("ix_platform_api_keys_prefix", "key_prefix"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # First 8 chars of the plaintext key — used for fast lookup before doing
    # the constant-time hash compare. Not a secret on its own.
    key_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    # SHA-256 hex digest of the plaintext key. Plaintext is never stored.
    hashed_secret: Mapped[str] = mapped_column(String(128), nullable=False)
    # Human-readable label set by the admin who created the key.
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    # JSON array of scope strings, e.g. ["expenses:read","payments:write"].
    scopes: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )


class WebhookSubscription(Base):
    """Outbound webhook target for a company."""

    __tablename__ = "webhook_subscriptions"
    __table_args__ = (
        Index("ix_webhook_subs_company_event", "company_id", "event_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # Wildcard "*" means "all events" — matched at dispatch time.
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    # Secret used for HMAC-SHA256 signature. Stored in plaintext; rotation is
    # the admin's responsibility and only happens through the admin UI.
    secret: Mapped[str] = mapped_column(String(120), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class WebhookDelivery(Base):
    """One attempted delivery of a webhook event to a subscription."""

    __tablename__ = "webhook_deliveries"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','delivering','succeeded','failed','abandoned')",
            name="ck_webhook_delivery_status_valid",
        ),
        UniqueConstraint(
            "subscription_id",
            "event_type",
            "resource_type",
            "resource_id",
            "nonce",
            name="uq_webhook_delivery_dedup",
        ),
        Index(
            "ix_webhook_deliveries_status_next",
            "status",
            "next_attempt_at",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(40), nullable=False)
    resource_id: Mapped[int] = mapped_column(Integer, nullable=False)
    nonce: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
