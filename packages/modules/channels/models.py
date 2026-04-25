"""
Channel gateway database models.

Tables
------
channel_settings      — Per-company configuration for each channel (WhatsApp, Email).
channel_conversations — Stateful conversation threads (multi-turn flows, pending verifications).
channel_messages      — Immutable audit log of every inbound and outbound message.
channel_verifications — Short-lived OTP records used to link a phone/email to a platform user.

User extension columns (whatsapp_phone, whatsapp_verified, whatsapp_verified_at) are added
to the existing users table via the _USER_CHANNEL_COLS migration helper at the bottom of
this file; called from main.py after Base.metadata.create_all().
"""

import json
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.sql import func

from apps.api.db import Base


class ChannelSettings(Base):
    """One row per (company, channel) pair. Stores credentials and enable/disable state."""
    __tablename__ = "channel_settings"
    __table_args__ = (UniqueConstraint("company_id", "channel", name="uq_channel_settings_company_channel"),)

    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    channel    = Column(String(30), nullable=False)   # "whatsapp" | "email"
    is_enabled = Column(Boolean, default=False, nullable=False)

    # ── WhatsApp Cloud API ────────────────────────────────────────────────────
    wa_phone_number_id    = Column(String(64),  nullable=True)   # Meta phone_number_id
    wa_waba_id            = Column(String(64),  nullable=True)   # Meta WABA id
    wa_access_token       = Column(Text,        nullable=True)   # System user token
    wa_webhook_verify_token = Column(String(128), nullable=True) # Random secret for Meta verification
    wa_display_name       = Column(String(120), nullable=True)

    # ── Inbound Email ─────────────────────────────────────────────────────────
    # The corporate address employees forward expenses to (e.g. gastos@company.com)
    email_inbound_address = Column(String(255), nullable=True)
    # Provider webhook secret for HMAC validation (SendGrid / Postmark / Mailgun)
    email_webhook_secret  = Column(String(128), nullable=True)
    # SMTP for outbound replies
    email_smtp_host       = Column(String(255), nullable=True)
    email_smtp_port       = Column(Integer,     nullable=True)
    email_smtp_user       = Column(String(255), nullable=True)
    email_smtp_password   = Column(Text,        nullable=True)
    email_smtp_from       = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ChannelConversation(Base):
    """Tracks the state of a multi-turn conversation with a single user on a single channel."""
    __tablename__ = "channel_conversations"

    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    channel    = Column(String(30), nullable=False)            # "whatsapp" | "email"
    thread_id  = Column(String(255), nullable=False, index=True)  # phone number or email thread id
    sender_ref = Column(String(255), nullable=False)           # phone (+521...) or from-address

    # Resolved after verification
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # State machine
    # States: awaiting_email | awaiting_code | verified | awaiting_project | done | failed
    state        = Column(String(50),  nullable=False, default="awaiting_email")
    context_json = Column(Text,        nullable=True)  # JSON blob for current intent + partial data

    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # ── Helpers ──────────────────────────────────────────────────────────────
    def get_context(self) -> dict:
        if not self.context_json:
            return {}
        return json.loads(self.context_json)

    def set_context(self, ctx: dict) -> None:
        self.context_json = json.dumps(ctx)


class ChannelMessage(Base):
    """Immutable audit log — one row per message in either direction."""
    __tablename__ = "channel_messages"

    id         = Column(Integer, primary_key=True)
    company_id = Column(Integer, nullable=False, index=True)
    channel    = Column(String(30), nullable=False)
    direction  = Column(String(10), nullable=False)   # "inbound" | "outbound"

    # Sender / recipient
    sender_ref    = Column(String(255), nullable=False)  # phone or email address
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Threading
    thread_id  = Column(String(255), nullable=True, index=True)
    wa_message_id = Column(String(128), nullable=True)   # Meta message id for deduplication

    # Content
    body             = Column(Text, nullable=True)
    attachments_json = Column(Text, nullable=True)   # JSON: [{filename, content_type, url}]

    # AI processing
    intent       = Column(String(50),  nullable=True)   # classified intent key
    status       = Column(String(30),  nullable=False, default="received")
    # Statuses: received | processing | replied | error | ignored
    error_detail = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChannelVerification(Base):
    """Short-lived OTP for linking a WhatsApp phone number (or unregistered email) to a user."""
    __tablename__ = "channel_verifications"

    id           = Column(Integer, primary_key=True)
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    channel      = Column(String(30), nullable=False)     # "whatsapp" | "email"
    recipient_ref = Column(String(255), nullable=False)   # phone or email being verified
    code_hash    = Column(String(128), nullable=False)    # bcrypt hash of the 6-digit code
    attempts     = Column(Integer,  default=0, nullable=False)
    expires_at   = Column(DateTime(timezone=True), nullable=False)
    used_at      = Column(DateTime(timezone=True), nullable=True)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())


class NotificationDispatch(Base):
    """One row per outbound notification attempt — idempotency + retry + audit.

    Unique key: (event_type, resource_type, resource_id, recipient_user_id, channel)
    prevents the same event from notifying the same user twice on the same channel.
    """
    __tablename__ = "notification_dispatches"
    __table_args__ = (
        UniqueConstraint(
            "event_type",
            "resource_type",
            "resource_id",
            "recipient_user_id",
            "channel",
            name="uq_notification_dispatch_idem",
        ),
    )

    id                 = Column(Integer, primary_key=True)
    company_id         = Column(Integer, nullable=False, index=True)
    event_type         = Column(String(80), nullable=False, index=True)
    resource_type      = Column(String(50), nullable=False)
    resource_id        = Column(Integer,    nullable=False)
    recipient_user_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recipient_address  = Column(String(255), nullable=True)  # email or phone, denormalised for audit
    channel            = Column(String(30),  nullable=False)  # "email" | "whatsapp"
    status             = Column(String(20),  nullable=False, default="pending")
    # Statuses: pending | sent | failed | suppressed
    attempts           = Column(Integer, nullable=False, default=0)
    last_error         = Column(Text, nullable=True)
    payload_json       = Column(Text, nullable=True)
    created_at         = Column(DateTime(timezone=True), server_default=func.now())
    sent_at            = Column(DateTime(timezone=True), nullable=True)
    updated_at         = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
