from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CompanyChannelConfig(Base):
    """Company-wide configuration for notification and auth channels."""
    __tablename__ = "company_channel_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, unique=True)

    # ── Email (SMTP / SendGrid / Amazon SES) ──────────────────────────────────
    email_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    email_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # "smtp", "sendgrid", "ses"
    email_from_address: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    email_config_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Encrypted config

    # ── WhatsApp (Twilio / Meta API) ──────────────────────────────────────────
    whatsapp_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    whatsapp_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # "twilio", "meta"
    whatsapp_phone_number_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    whatsapp_config_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Encrypted config

    # ── Slack / Teams / Webhooks ──────────────────────────────────────────────
    slack_webhook_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
