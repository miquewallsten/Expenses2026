"""Admin API for channel configuration and message monitoring.

Endpoints
---------
GET  /admin/channels/settings/{company_id}           — list both channel configs
GET  /admin/channels/settings/{company_id}/{channel} — get one channel config
PUT  /admin/channels/settings/{company_id}/{channel} — upsert channel config
GET  /admin/channels/messages/{company_id}           — paginated message log
POST /admin/channels/test/{company_id}/{channel}     — send a test message
POST /admin/channels/test-connection/{company_id}/{channel} — verify credentials
"""

from __future__ import annotations

import secrets
from typing import Literal

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from apps.api.auth import require_admin
from apps.api.deps import get_db
from packages.modules.channels.models import ChannelMessage, ChannelSettings
from packages.modules.channels.schemas import (
    ChannelMessageRead,
    ChannelSettingsRead,
    ChannelSettingsUpdate,
    TestMessageRequest,
)

router = APIRouter(prefix="/admin/channels", tags=["admin-channels"], dependencies=[Depends(require_admin)])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_or_create(db: Session, company_id: int, channel: str) -> ChannelSettings:
    obj = (
        db.query(ChannelSettings)
        .filter(ChannelSettings.company_id == company_id, ChannelSettings.channel == channel)
        .first()
    )
    if not obj:
        obj = ChannelSettings(company_id=company_id, channel=channel)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj


def _to_read(obj: ChannelSettings) -> dict:
    """Convert ORM object to response dict with secrets redacted."""
    return ChannelSettingsRead.from_orm_redacted(obj).model_dump()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.get("/settings/{company_id}")
def list_channel_settings(company_id: int, db: Session = Depends(get_db)) -> list[dict]:
    """Return settings for both channels, creating defaults if they don't exist."""
    wa  = _get_or_create(db, company_id, "whatsapp")
    em  = _get_or_create(db, company_id, "email")
    return [_to_read(wa), _to_read(em)]


@router.get("/settings/{company_id}/{channel}")
def get_channel_settings(
    company_id: int,
    channel: Literal["whatsapp", "email"],
    db: Session = Depends(get_db),
) -> dict:
    obj = _get_or_create(db, company_id, channel)
    return _to_read(obj)


@router.put("/settings/{company_id}/{channel}")
def upsert_channel_settings(
    company_id: int,
    channel: Literal["whatsapp", "email"],
    data: ChannelSettingsUpdate,
    db: Session = Depends(get_db),
) -> dict:
    obj = _get_or_create(db, company_id, channel)
    update_data = data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        # Empty string for secret fields = clear the field
        if value == "" and key in ("wa_access_token", "email_smtp_password", "email_webhook_secret"):
            setattr(obj, key, None)
        elif value is not None:
            setattr(obj, key, value)

    # Auto-generate verify token if WhatsApp is being enabled without one
    if channel == "whatsapp" and obj.is_enabled and not obj.wa_webhook_verify_token:
        obj.wa_webhook_verify_token = secrets.token_urlsafe(24)

    db.commit()
    db.refresh(obj)
    return _to_read(obj)


@router.get("/messages/{company_id}")
def list_channel_messages(
    company_id: int,
    channel: str | None = Query(default=None),
    direction: str | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[ChannelMessageRead]:
    """Return message log, newest first. Filterable by channel and direction."""
    q = db.query(ChannelMessage).filter(ChannelMessage.company_id == company_id)
    if channel:
        q = q.filter(ChannelMessage.channel == channel)
    if direction:
        q = q.filter(ChannelMessage.direction == direction)
    msgs = q.order_by(ChannelMessage.created_at.desc()).offset(offset).limit(limit).all()
    return [ChannelMessageRead.model_validate(m) for m in msgs]


@router.post("/test/{company_id}/{channel}")
def send_test_message(
    company_id: int,
    channel: Literal["whatsapp", "email"],
    body: TestMessageRequest,
    db: Session = Depends(get_db),
) -> dict:
    """Send a test message to verify channel connectivity."""
    settings = (
        db.query(ChannelSettings)
        .filter(ChannelSettings.company_id == company_id, ChannelSettings.channel == channel)
        .first()
    )
    if not settings or not settings.is_enabled:
        raise HTTPException(status_code=400, detail="Channel not configured or not enabled")

    if channel == "whatsapp":
        from packages.modules.channels.service.whatsapp_client import send_text
        try:
            result = send_text(
                settings.wa_phone_number_id,
                settings.wa_access_token,
                body.recipient,
                body.body,
            )
            return {"ok": True, "result": result}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    elif channel == "email":
        if not settings.email_smtp_host or not settings.email_smtp_from:
            raise HTTPException(status_code=400, detail="Email SMTP not configured")
        import smtplib
        from email.mime.text import MIMEText
        try:
            msg = MIMEText(body.body, "plain", "utf-8")
            msg["Subject"] = "Test message — Financial Ops Platform"
            msg["From"] = settings.email_smtp_from
            msg["To"] = body.recipient
            port = settings.email_smtp_port or 587
            with smtplib.SMTP(settings.email_smtp_host, port, timeout=10) as smtp:
                smtp.ehlo()
                smtp.starttls()
                if settings.email_smtp_user and settings.email_smtp_password:
                    smtp.login(settings.email_smtp_user, settings.email_smtp_password)
                smtp.sendmail(settings.email_smtp_from, [body.recipient], msg.as_string())
            return {"ok": True}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc))

    raise HTTPException(status_code=400, detail="Unknown channel")


@router.post("/test-connection/{company_id}/{channel}")
def test_channel_connection(
    company_id: int,
    channel: Literal["whatsapp", "email"],
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
) -> dict:
    """Test connection/credentials for a channel.

    For WhatsApp: verifies credentials by calling the Meta Graph API.
    For Email: tests SMTP or IMAP connection with provided credentials (on-the-fly).
    """
    if channel == "whatsapp":
        settings = (
            db.query(ChannelSettings)
            .filter(ChannelSettings.company_id == company_id, ChannelSettings.channel == "whatsapp")
            .first()
        )
        if not settings:
            return {"ok": False, "error": "WhatsApp not configured for this company"}
        if not settings.wa_phone_number_id or not settings.wa_access_token:
            return {"ok": False, "error": "WhatsApp credentials incomplete (phone_number_id or access_token missing)"}

        from packages.modules.channels.service.whatsapp_client import verify_credentials
        return verify_credentials(settings.wa_phone_number_id, settings.wa_access_token)

    elif channel == "email":
        import asyncio
        from packages.core.platform.service.mail_tester import test_smtp_connection, test_imap_connection

        test_type = payload.get("type", "smtp")
        config = payload.get("config", {})

        # Fix: run async function properly in a sync FastAPI handler
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # We're inside an already-running event loop (ASGI) — use a thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                if test_type == "smtp":
                    result = pool.submit(asyncio.run, test_smtp_connection(config)).result()
                elif test_type == "imap":
                    result = pool.submit(asyncio.run, test_imap_connection(config)).result()
                else:
                    raise HTTPException(status_code=400, detail="Invalid test type. Use 'smtp' or 'imap'.")
                return result
        else:
            if test_type == "smtp":
                return asyncio.run(test_smtp_connection(config))
            elif test_type == "imap":
                return asyncio.run(test_imap_connection(config))
            else:
                raise HTTPException(status_code=400, detail="Invalid test type. Use 'smtp' or 'imap'.")

    raise HTTPException(status_code=400, detail="Unknown channel")


@router.get("/stats/{company_id}")
def channel_stats(company_id: int, db: Session = Depends(get_db)) -> dict:
    """Summary counts for the admin dashboard tile."""
    from sqlalchemy import func as sa_func

    total = db.query(sa_func.count(ChannelMessage.id)).filter(
        ChannelMessage.company_id == company_id
    ).scalar() or 0

    by_channel = (
        db.query(ChannelMessage.channel, sa_func.count(ChannelMessage.id))
        .filter(ChannelMessage.company_id == company_id)
        .group_by(ChannelMessage.channel)
        .all()
    )

    errors = db.query(sa_func.count(ChannelMessage.id)).filter(
        ChannelMessage.company_id == company_id,
        ChannelMessage.status == "error",
    ).scalar() or 0

    return {
        "total_messages": total,
        "by_channel": {ch: cnt for ch, cnt in by_channel},
        "errors": errors,
    }


@router.get("/dispatches/{company_id}")
def list_dispatches(
    company_id: int,
    channel: str | None = Query(default=None),
    status: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Phase 1.8 — recent NotificationDispatch rows for the admin panel.

    Newest first. Optional filters by channel ("email" / "whatsapp") and
    status ("pending" / "sent" / "failed"). Capped at 500 to keep payloads
    manageable.
    """
    from packages.modules.channels.models import NotificationDispatch

    q = db.query(NotificationDispatch).filter(
        NotificationDispatch.company_id == company_id
    )
    if channel:
        q = q.filter(NotificationDispatch.channel == channel)
    if status:
        q = q.filter(NotificationDispatch.status == status)
    rows = (
        q.order_by(NotificationDispatch.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "recipient_user_id": r.recipient_user_id,
            "recipient_address": r.recipient_address,
            "channel": r.channel,
            "status": r.status,
            "attempts": r.attempts,
            "last_error_text": getattr(r, "last_error_text", None),
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "sent_at": r.sent_at.isoformat() if getattr(r, "sent_at", None) else None,
        }
        for r in rows
    ]
