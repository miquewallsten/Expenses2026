"""
WhatsApp Cloud API webhook router.

Meta webhook protocol
---------------------
GET  /channels/whatsapp/webhook  — Hub verification (must echo hub.challenge)
POST /channels/whatsapp/webhook  — Inbound messages / delivery receipts

Security:
- GET verify_token is matched against ChannelSettings per tenant.
- POST requests must carry a valid X-Hub-Signature-256 header (HMAC-SHA256
  of the raw body using the Meta App Secret). The secret is read from
  env var WHATSAPP_APP_SECRET. In production a missing secret rejects
  every request; in dev a missing secret logs a warning and accepts.
- Unresolvable phone_number_id → log + 200 (never fall back to a hardcoded
  tenant; we refuse to accept messages we can't attribute).
- Deduplication on wa_message_id is handled in the webhook handler before processing.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from apps.api.config import settings as app_settings
from apps.api.deps import get_db
from packages.modules.channels.models import ChannelSettings
from packages.modules.channels.schemas import NormalizedMessage, InboundAttachment
# from packages.modules.channels.service import agent  # Module does not exist
from packages.modules.channels.service.whatsapp_client import parse_inbound_webhook, mark_as_read, get_media_url, download_media
from packages.modules.agent.core.channel_dispatcher import CHANNEL_DISPATCHER

log = logging.getLogger(__name__)

router = APIRouter(prefix="/channels/whatsapp", tags=["channels-whatsapp"])

# Global WhatsApp App Secret (Meta App-level). Every webhook payload is signed
# by Meta with this secret via X-Hub-Signature-256.
_APP_SECRET = os.environ.get("WHATSAPP_APP_SECRET", "").strip()


def _verify_meta_signature(raw_body: bytes, header: str | None) -> bool:
    """Verify X-Hub-Signature-256 header against the raw request body.

    Returns True on match. Returns False on any malformed header, empty
    secret (production), or signature mismatch. Uses constant-time compare.
    """
    if not _APP_SECRET:
        # Allow in dev so local setups aren't blocked; reject in prod.
        if app_settings.is_production:
            log.error("WHATSAPP_APP_SECRET is not set — rejecting webhook")
            return False
        log.warning(
            "WHATSAPP_APP_SECRET is not set — skipping signature check (dev mode)"
        )
        return True
    if not header or not header.startswith("sha256="):
        return False
    provided = header.split("=", 1)[1].strip()
    expected = hmac.new(
        _APP_SECRET.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(provided, expected)


# ── Company resolver ──────────────────────────────────────────────────────────


def _resolve_company(db: Session, phone_number_id: str) -> int | None:
    """Find the company that owns this WhatsApp phone number."""
    setting = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.channel == "whatsapp",
            ChannelSettings.wa_phone_number_id == phone_number_id,
            ChannelSettings.is_enabled == True,
        )
        .first()
    )
    return setting.company_id if setting else None


# ── GET — Meta hub verification ────────────────────────────────────────────────

@router.get("/webhook")
def whatsapp_webhook_verify(
    request: Request,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    db: Session = Depends(get_db),
):
    """
    Meta sends a GET to verify webhook ownership.
    We validate the verify_token against all ChannelSettings records
    (so any company's token works), then echo hub.challenge.
    """
    if hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")

    if not hub_verify_token or not hub_challenge:
        raise HTTPException(status_code=400, detail="Missing hub parameters")

    # Check token against any stored settings
    match = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.channel == "whatsapp",
            ChannelSettings.wa_webhook_verify_token == hub_verify_token,
        )
        .first()
    )

    if not match:
        log.warning("WhatsApp webhook verification failed — unknown token")
        raise HTTPException(status_code=403, detail="Verification failed")

    log.info("WhatsApp webhook verified for company_id=%s", match.company_id)
    return Response(content=hub_challenge, media_type="text/plain")


# ── POST — Inbound messages ────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook_receive(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Receive inbound WhatsApp messages.
    Must return 200 immediately — processing is async via BackgroundTasks.
    """
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature-256")

    if not _verify_meta_signature(raw_body, signature):
        log.warning("WhatsApp webhook rejected — bad or missing signature")
        # 401 tells Meta the caller is unauthorized; a forged attacker gets
        # the same response as a misconfigured setup.
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        import json
        payload: dict[str, Any] = json.loads(raw_body or b"{}")
    except Exception:
        # Always return 200 to Meta even on parse errors to prevent retry storms
        return Response(status_code=200)

    # Kick off processing in background so we respond within Meta's 5-second window
    background_tasks.add_task(_process_whatsapp_payload, payload, db)
    return Response(status_code=200)


def _process_whatsapp_payload(payload: dict[str, Any], db: Session) -> None:
    """Parse Meta webhook payload and dispatch each message to the gateway agent."""
    messages = parse_inbound_webhook(payload)
    if not messages:
        return

    # Extract phone_number_id from first message's metadata to identify the company
    try:
        phone_number_id = (
            payload["entry"][0]["changes"][0]["value"].get("metadata", {}).get("phone_number_id")
        )
    except (KeyError, IndexError):
        phone_number_id = None

    if not phone_number_id:
        log.warning("WhatsApp payload missing phone_number_id — dropped")
        return
    company_id = _resolve_company(db, phone_number_id)
    if not company_id:
        # Refuse to attribute a message to an arbitrary tenant — drop it.
        log.warning(
            "WhatsApp payload phone_number_id=%s not registered — dropped",
            phone_number_id,
        )
        return

    # Load settings for read-receipts
    settings = (
        db.query(ChannelSettings)
        .filter(ChannelSettings.company_id == company_id, ChannelSettings.channel == "whatsapp")
        .first()
    )

    for raw_msg in messages:
        try:
            # Build normalised message
            attachments: list[InboundAttachment] = []
            if raw_msg.get("media_id"):
                attachments.append(InboundAttachment(
                    media_id=raw_msg["media_id"],
                    content_type=raw_msg.get("media_mime_type"),
                    filename=raw_msg.get("media_type", "attachment"),
                ))

            norm = NormalizedMessage(
                channel="whatsapp",
                company_id=company_id,
                sender_ref=raw_msg["from_phone"],
                thread_id=raw_msg["from_phone"],   # phone is the thread in 1:1 chat
                body=raw_msg.get("text_body") or "",
                attachments=attachments,
                raw=raw_msg,
                wa_message_id=raw_msg.get("wa_message_id"),
            )

            # Mark as read before processing (shows user their message was received)
            if settings and settings.wa_phone_number_id and settings.wa_access_token:
                if raw_msg.get("wa_message_id"):
                    mark_as_read(
                        settings.wa_phone_number_id,
                        settings.wa_access_token,
                        raw_msg["wa_message_id"],
                    )

            # Download WhatsApp media if present
            for i, att in enumerate(attachments):
                if att.media_id and settings:
                    try:
                        media_url = get_media_url(settings.wa_access_token, att.media_id)
                        if media_url:
                            media_bytes = download_media(settings.wa_access_token, media_url)
                            if media_bytes:
                                import base64
                                attachments[i] = InboundAttachment(
                                    media_id=att.media_id,
                                    filename=att.filename,
                                    content_type=att.content_type,
                                    url=att.url,
                                    size_bytes=len(media_bytes),
                                    content_b64=base64.b64encode(media_bytes).decode("ascii"),
                                )
                    except Exception:
                        log.exception("Failed to download WhatsApp media %s", att.media_id)

            # Deduplication: skip if we've already processed this wa_message_id
            wa_msg_id = raw_msg.get("wa_message_id")
            if wa_msg_id:
                from packages.modules.channels.models import ChannelMessage
                existing = (
                    db.query(ChannelMessage)
                    .filter(ChannelMessage.wa_message_id == wa_msg_id)
                    .first()
                )
                if existing:
                    log.warning("Duplicate WhatsApp message wa_message_id=%s — skipping", wa_msg_id)
                    continue

            # Log inbound message
            try:
                from packages.modules.channels.models import ChannelMessage
                msg_log = ChannelMessage(
                    company_id=company_id,
                    channel="whatsapp",
                    direction="inbound",
                    sender_ref=raw_msg.get("from_phone", ""),
                    thread_id=raw_msg.get("from_phone", ""),
                    body=raw_msg.get("text_body") or "",
                    wa_message_id=raw_msg.get("wa_message_id"),
                    intent="expense_submission" if attachments else "general_chat",
                    status="received",
                )
                db.add(msg_log)
                db.commit()
            except Exception:
                log.exception("Failed to log inbound WhatsApp message")

            # Check for active phone-linking conversation first
            from packages.modules.channels.service.phone_linking import process_linking_response
            from packages.modules.channels.models import ChannelConversation
            from datetime import datetime, timezone

            active_conv = (
                db.query(ChannelConversation)
                .filter(
                    ChannelConversation.company_id == company_id,
                    ChannelConversation.channel == "whatsapp",
                    ChannelConversation.thread_id == norm.sender_ref,
                    ChannelConversation.state == "awaiting_email",
                    ChannelConversation.expires_at > datetime.now(tz=timezone.utc),
                )
                .first()
            )

            if active_conv:
                # User is in the phone-linking flow — process their email response
                link_result = process_linking_response(
                    db, company_id, "whatsapp",
                    norm.sender_ref, norm.sender_ref,
                    norm.body or "",
                )
                if link_result["linked"]:
                    log.info("WhatsApp phone linked: user=%s phone=%s", link_result.get("user_id"), norm.sender_ref)
                # The reply is already sent inside process_linking_response via whatsapp_outbound
                # No need to dispatch to the agent
            else:
                # Permission gate: check if user's role is allowed for this channel
                from packages.core.platform.models_user import User as WaUser
                wa_user = (
                    db.query(WaUser)
                    .filter(WaUser.company_id == company_id, WaUser.whatsapp_phone == norm.sender_ref)
                    .first()
                )
                if wa_user is None:
                    # Also try phone field
                    wa_user = (
                        db.query(WaUser)
                        .filter(WaUser.company_id == company_id, WaUser.phone == norm.sender_ref)
                        .first()
                    )
                if wa_user and settings and settings.wa_allowed_roles:
                    allowed = [r.strip() for r in settings.wa_allowed_roles.split(",")]
                    if wa_user.role not in allowed:
                        from packages.modules.channels.service.whatsapp_outbound import send_whatsapp_reply
                        send_whatsapp_reply(
                            db, company_id, norm.sender_ref,
                            "Tu cuenta no tiene acceso a este canal. Contacta al administrador.",
                        )
                        continue

                # Dispatch to autonomous agent
                CHANNEL_DISPATCHER.dispatch(
                    db=db,
                    channel_type="whatsapp",
                    message=norm.body or "",
                    user_id=norm.sender_ref,  # phone string — resolved to User inside dispatcher
                    company_id=company_id,
                    confidence=1.0,
                )

        except Exception as exc:
            log.error("Error processing WhatsApp message: %s", exc, exc_info=True)
