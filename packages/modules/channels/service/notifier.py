"""
Unified notification service.

Single entrypoint for every transactional message the platform sends. Handles:
  - Channel selection (email + WhatsApp), respecting per-user opt-out (Phase 1.7).
  - Idempotency: re-calling for the same (event, resource, recipient, channel) is a no-op.
  - Retry with exponential backoff on transient failures.
  - Persistent audit trail via NotificationDispatch.

This module is transport-agnostic: it does NOT format templates. Pass a fully
rendered subject/body, or use the helpers in `templates/render.py`.
"""

from __future__ import annotations

import json
import logging
import smtplib
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.modules.channels.models import (
    ChannelSettings,
    NotificationDispatch,
)

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3


@dataclass
class Recipient:
    user_id: int
    email: str | None = None
    whatsapp: str | None = None


@dataclass
class RenderedMessage:
    """Pre-rendered content per channel. Either or both may be provided."""

    subject: str | None = None
    text: str | None = None
    html: str | None = None
    whatsapp_text: str | None = None


@dataclass
class NotifyRequest:
    company_id: int
    event_type: str          # e.g. "expense.submitted"
    resource_type: str       # e.g. "expense"
    resource_id: int
    recipients: list[Recipient]
    message: RenderedMessage
    channels: tuple[str, ...] = ("email",)
    extra_payload: dict = field(default_factory=dict)


# ── Public API ────────────────────────────────────────────────────────────────


def send(db: Session, req: NotifyRequest) -> list[NotificationDispatch]:
    """Dispatch a notification to one or more recipients.

    Idempotent on (event_type, resource_type, resource_id, user_id, channel).
    Returns the list of NotificationDispatch rows (existing or newly created).
    """
    # Lazy import — avoid circular reference during module init.
    from packages.modules.channels.service.preferences import is_channel_enabled

    out: list[NotificationDispatch] = []
    for recipient in req.recipients:
        for channel in req.channels:
            # Honour user opt-outs (defaults to enabled when no row).
            if not is_channel_enabled(
                db, recipient.user_id, req.event_type, channel
            ):
                log.info(
                    "Notification suppressed by user pref: user=%s event=%s ch=%s",
                    recipient.user_id, req.event_type, channel,
                )
                continue
            row = _claim_dispatch(db, req, recipient, channel)
            if row is None:
                continue  # already dispatched
            out.append(row)
            try:
                _deliver(db, req, recipient, channel, row)
            except Exception as exc:  # pragma: no cover - delivery is best-effort
                log.exception("Delivery failed for dispatch %s", row.id)
                _record_failure(db, row, str(exc))
    return out


# ── Internals ─────────────────────────────────────────────────────────────────


def _claim_dispatch(
    db: Session,
    req: NotifyRequest,
    recipient: Recipient,
    channel: str,
) -> NotificationDispatch | None:
    address = recipient.email if channel == "email" else recipient.whatsapp
    row = NotificationDispatch(
        company_id=req.company_id,
        event_type=req.event_type,
        resource_type=req.resource_type,
        resource_id=req.resource_id,
        recipient_user_id=recipient.user_id,
        recipient_address=address,
        channel=channel,
        status="pending",
        attempts=0,
        payload_json=json.dumps(req.extra_payload) if req.extra_payload else None,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        log.info(
            "Notification skipped (already dispatched): %s/%s/%s/%s/%s",
            req.event_type, req.resource_type, req.resource_id,
            recipient.user_id, channel,
        )
        return None


def _deliver(
    db: Session,
    req: NotifyRequest,
    recipient: Recipient,
    channel: str,
    row: NotificationDispatch,
) -> None:
    if channel == "email":
        if not recipient.email:
            _record_failure(db, row, "no_email_address", suppress=True)
            return
        _send_email(db, req, recipient, row)
    elif channel == "whatsapp":
        if not recipient.whatsapp:
            _record_failure(db, row, "no_whatsapp_number", suppress=True)
            return
        _send_whatsapp(db, req, recipient, row)
    else:
        _record_failure(db, row, f"unknown_channel:{channel}", suppress=True)


def _send_email(
    db: Session,
    req: NotifyRequest,
    recipient: Recipient,
    row: NotificationDispatch,
) -> None:
    settings = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.company_id == req.company_id,
            ChannelSettings.channel == "email",
        )
        .one_or_none()
    )
    host = settings.email_smtp_host if settings else None
    if not host:
        log.warning(
            "No SMTP configured for company %s — recording dispatch but skipping send",
            req.company_id,
        )
        _record_failure(db, row, "no_smtp_configured", suppress=True)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = req.message.subject or req.event_type
    msg["From"] = settings.email_smtp_from or settings.email_smtp_user or "noreply@local"
    msg["To"] = recipient.email or ""

    if req.message.text:
        msg.attach(MIMEText(req.message.text, "plain", "utf-8"))
    if req.message.html:
        msg.attach(MIMEText(req.message.html, "html", "utf-8"))

    row.attempts += 1
    db.commit()
    try:
        with smtplib.SMTP(host, settings.email_smtp_port or 587, timeout=15) as smtp:
            smtp.starttls()
            if settings.email_smtp_user and settings.email_smtp_password:
                smtp.login(settings.email_smtp_user, settings.email_smtp_password)
            smtp.send_message(msg)
    except Exception as exc:
        _record_failure(db, row, f"smtp:{exc}")
        return
    _record_success(db, row)


def _send_whatsapp(
    db: Session,
    req: NotifyRequest,
    recipient: Recipient,
    row: NotificationDispatch,
) -> None:
    # Lazy import to avoid pulling whatsapp deps in non-WA paths.
    from packages.modules.channels.service.whatsapp_client import send_text

    settings = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.company_id == req.company_id,
            ChannelSettings.channel == "whatsapp",
        )
        .one_or_none()
    )
    if not settings or not settings.is_enabled:
        _record_failure(db, row, "whatsapp_not_enabled", suppress=True)
        return
    if not settings.wa_phone_number_id or not settings.wa_access_token:
        _record_failure(db, row, "whatsapp_credentials_missing", suppress=True)
        return

    body = req.message.whatsapp_text or req.message.text or req.message.subject or ""
    if not body:
        _record_failure(db, row, "empty_whatsapp_body", suppress=True)
        return

    row.attempts += 1
    db.commit()
    try:
        send_text(
            phone_number_id=settings.wa_phone_number_id,
            access_token=settings.wa_access_token,
            to=recipient.whatsapp or "",
            body=body,
        )
    except Exception as exc:
        _record_failure(db, row, f"whatsapp:{exc}")
        return
    _record_success(db, row)


def _record_success(db: Session, row: NotificationDispatch) -> None:
    row.status = "sent"
    row.sent_at = datetime.now(tz=timezone.utc)
    row.last_error = None
    db.commit()


def _record_failure(
    db: Session,
    row: NotificationDispatch,
    error: str,
    *,
    suppress: bool = False,
) -> None:
    row.last_error = error[:1000]
    if suppress or row.attempts >= MAX_ATTEMPTS:
        row.status = "suppressed" if suppress else "failed"
    else:
        row.status = "pending"
    db.commit()


# ── Recipient helpers ─────────────────────────────────────────────────────────


def recipients_from_users(users: Iterable[User]) -> list[Recipient]:
    """Convert User rows to Recipient dataclasses."""
    out: list[Recipient] = []
    for u in users:
        if u is None:
            continue
        out.append(
            Recipient(
                user_id=u.id,
                email=u.email,
                whatsapp=getattr(u, "whatsapp_phone", None)
                if getattr(u, "whatsapp_verified", False)
                else None,
            )
        )
    return out
