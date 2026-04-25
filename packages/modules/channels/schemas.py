"""Pydantic schemas for the channels module."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ── Channel Settings ──────────────────────────────────────────────────────────

class ChannelSettingsBase(BaseModel):
    channel:    Literal["whatsapp", "email"]
    is_enabled: bool = False

    # WhatsApp
    wa_phone_number_id:     str | None = None
    wa_waba_id:             str | None = None
    wa_access_token:        str | None = None
    wa_webhook_verify_token: str | None = None
    wa_display_name:        str | None = None

    # Email
    email_inbound_address: str | None = None
    email_webhook_secret:  str | None = None
    email_smtp_host:       str | None = None
    email_smtp_port:       int | None = None
    email_smtp_user:       str | None = None
    email_smtp_password:   str | None = None
    email_smtp_from:       str | None = None


class ChannelSettingsRead(ChannelSettingsBase):
    id:         int
    company_id: int
    created_at: datetime
    updated_at: datetime

    # Never expose raw tokens in reads — redact to boolean presence
    wa_access_token:      str | None = Field(None, exclude=True)
    email_smtp_password:  str | None = Field(None, exclude=True)
    email_webhook_secret: str | None = Field(None, exclude=True)

    wa_access_token_set:      bool = False
    email_smtp_password_set:  bool = False
    email_webhook_secret_set: bool = False

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_redacted(cls, obj: Any) -> "ChannelSettingsRead":
        d = {
            c.name: getattr(obj, c.name)
            for c in obj.__table__.columns
            if c.name not in ("wa_access_token", "email_smtp_password", "email_webhook_secret")
        }
        d["wa_access_token_set"]      = bool(obj.wa_access_token)
        d["email_smtp_password_set"]  = bool(obj.email_smtp_password)
        d["email_webhook_secret_set"] = bool(obj.email_webhook_secret)
        return cls(**d)


class ChannelSettingsUpdate(BaseModel):
    is_enabled: bool | None = None

    wa_phone_number_id:      str | None = None
    wa_waba_id:              str | None = None
    wa_access_token:         str | None = None   # None = don't change; "" = clear
    wa_webhook_verify_token: str | None = None
    wa_display_name:         str | None = None

    email_inbound_address: str | None = None
    email_webhook_secret:  str | None = None
    email_smtp_host:       str | None = None
    email_smtp_port:       int | None = None
    email_smtp_user:       str | None = None
    email_smtp_password:   str | None = None
    email_smtp_from:       str | None = None

    model_config = {"extra": "ignore"}


# ── Channel Messages ──────────────────────────────────────────────────────────

class ChannelMessageRead(BaseModel):
    id:              int
    company_id:      int
    channel:         str
    direction:       str
    sender_ref:      str
    user_id:         int | None
    thread_id:       str | None
    body:            str | None
    attachments_json: str | None
    intent:          str | None
    status:          str
    error_detail:    str | None
    created_at:      datetime

    model_config = {"from_attributes": True}


# ── Inbound webhook payloads (internal) ───────────────────────────────────────

class InboundAttachment(BaseModel):
    media_id:     str | None = None   # WhatsApp media id (must be fetched)
    filename:     str | None = None
    content_type: str | None = None
    url:          str | None = None   # pre-signed URL (email providers)
    size_bytes:   int | None = None
    content_b64:  str | None = None   # inline base64 bytes (Postmark)


class NormalizedMessage(BaseModel):
    """Channel-agnostic representation used by the gateway agent."""
    channel:      Literal["whatsapp", "email"]
    company_id:   int
    sender_ref:   str            # phone E.164 or email address
    thread_id:    str            # phone number or email Message-ID
    body:         str
    attachments:  list[InboundAttachment] = []
    raw:          dict[str, Any] = {}
    wa_message_id: str | None = None


# ── Admin test-send ────────────────────────────────────────────────────────────

class TestMessageRequest(BaseModel):
    recipient: str   # phone E.164 or email
    body: str = Field(default="Test message from Financial Ops Platform.")
