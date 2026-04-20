"""
WhatsApp Cloud API webhook router.

Meta webhook protocol
---------------------
GET  /channels/whatsapp/webhook  — Hub verification (must echo hub.challenge)
POST /channels/whatsapp/webhook  — Inbound messages / delivery receipts

Best practices implemented:
- Return HTTP 200 immediately before processing (prevents Meta retries)
- Use BackgroundTasks so the webhook responds in <1 s
- Verify webhook verify_token on GET
- Per-company routing: look up ChannelSettings by phone_number_id
- Deduplicate via wa_message_id (handled in agent.process_message)
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.channels.models import ChannelSettings
from packages.modules.channels.schemas import NormalizedMessage, InboundAttachment
from packages.modules.channels.service import agent
from packages.modules.channels.service.whatsapp_client import parse_inbound_webhook, mark_as_read

log = logging.getLogger(__name__)

router = APIRouter(prefix="/channels/whatsapp", tags=["channels-whatsapp"])

# ── Company resolver ──────────────────────────────────────────────────────────

_DEFAULT_COMPANY_ID = 1  # fallback for single-tenant deployments


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
    try:
        payload: dict[str, Any] = await request.json()
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

    company_id = None
    if phone_number_id:
        company_id = _resolve_company(db, phone_number_id)
    if not company_id:
        company_id = _DEFAULT_COMPANY_ID

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

            agent.process_message(db, norm)

        except Exception as exc:
            log.error("Error processing WhatsApp message: %s", exc, exc_info=True)
