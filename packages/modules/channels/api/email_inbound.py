"""
Email inbound webhook router.

This endpoint receives parsed inbound emails from any transactional email provider
that supports inbound routing via webhook POST:

  Supported providers (all post multipart/form-data or JSON):
  - SendGrid   Inbound Parse  →  multipart/form-data
  - Postmark   Inbound        →  application/json
  - Mailgun    Routes         →  multipart/form-data

Configure your provider to POST to:
  https://your-domain/channels/email/inbound?provider=sendgrid  (or postmark / mailgun)

The corporate inbound address (e.g. gastos@company.com) should be the one
registered with your email provider.
"""

from __future__ import annotations

import email as email_lib
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from apps.api.deps import get_db
from packages.modules.channels.models import ChannelSettings
from packages.modules.channels.schemas import InboundAttachment, NormalizedMessage
from packages.modules.channels.service import agent

log = logging.getLogger(__name__)

router = APIRouter(prefix="/channels/email", tags=["channels-email"])

_DEFAULT_COMPANY_ID = 1


def _resolve_company_by_address(db: Session, to_address: str) -> int | None:
    """Find company whose inbound email address matches the 'to' field."""
    normalised = to_address.lower().strip()
    setting = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.channel == "email",
            ChannelSettings.is_enabled == True,
        )
        .all()
    )
    for s in setting:
        if s.email_inbound_address and s.email_inbound_address.lower() in normalised:
            return s.company_id
    return None


# ── Provider-specific parsers ──────────────────────────────────────────────────

def _parse_sendgrid(form: dict) -> dict[str, Any]:
    """Parse SendGrid Inbound Parse multipart/form-data payload."""
    return {
        "from":    form.get("from", ""),
        "to":      form.get("to", ""),
        "subject": form.get("subject", ""),
        "body":    form.get("text") or form.get("html") or "",
        "message_id": form.get("headers", "").split("Message-ID:")[1].split("\n")[0].strip()
                      if "Message-ID:" in form.get("headers", "") else "",
        "attachments": int(form.get("attachments", "0")),
    }


def _parse_postmark(data: dict) -> dict[str, Any]:
    """Parse Postmark inbound JSON payload."""
    return {
        "from":    data.get("From", ""),
        "to":      data.get("To", ""),
        "subject": data.get("Subject", ""),
        "body":    data.get("TextBody") or data.get("HtmlBody") or "",
        "message_id": data.get("MessageID", ""),
        "attachments": len(data.get("Attachments", [])),
    }


def _parse_mailgun(form: dict) -> dict[str, Any]:
    """Parse Mailgun Routes multipart/form-data payload."""
    return {
        "from":    form.get("sender", ""),
        "to":      form.get("recipient", ""),
        "subject": form.get("subject", ""),
        "body":    form.get("stripped-text") or form.get("body-plain") or "",
        "message_id": form.get("Message-Id", ""),
        "attachments": int(form.get("attachment-count", "0")),
    }


# ── Webhook endpoint ───────────────────────────────────────────────────────────

@router.post("/inbound")
async def email_inbound(
    request: Request,
    background_tasks: BackgroundTasks,
    provider: str = Query(default="sendgrid"),
    db: Session = Depends(get_db),
):
    """
    Receive inbound emails from email provider webhooks.
    Returns 200 immediately — processing happens in background.
    """
    try:
        content_type = request.headers.get("content-type", "")
        if "application/json" in content_type:
            data = await request.json()
            parsed = _parse_postmark(data) if provider == "postmark" else data
        else:
            form = await request.form()
            form_dict = dict(form)
            if provider == "mailgun":
                parsed = _parse_mailgun(form_dict)
            else:
                parsed = _parse_sendgrid(form_dict)  # default / sendgrid
    except Exception as exc:
        log.error("Email inbound parse error: %s", exc)
        return Response(status_code=200)

    background_tasks.add_task(_process_email, parsed, db)
    return Response(status_code=200)


def _process_email(parsed: dict[str, Any], db: Session) -> None:
    """Normalise and dispatch an inbound email to the gateway agent."""
    try:
        from_addr = _extract_email_address(parsed.get("from", ""))
        to_addr   = parsed.get("to", "")
        body      = (parsed.get("body") or "").strip()
        message_id = parsed.get("message_id", "") or from_addr

        company_id = _resolve_company_by_address(db, to_addr)
        if not company_id:
            company_id = _DEFAULT_COMPANY_ID

        att_count = parsed.get("attachments", 0)
        attachments = [
            InboundAttachment(filename=f"attachment_{i+1}", content_type="application/octet-stream")
            for i in range(att_count if isinstance(att_count, int) else 0)
        ]

        norm = NormalizedMessage(
            channel="email",
            company_id=company_id,
            sender_ref=from_addr,
            thread_id=message_id,
            body=body,
            attachments=attachments,
            raw=parsed,
        )

        agent.process_message(db, norm)

    except Exception as exc:
        log.error("Error processing inbound email: %s", exc, exc_info=True)


def _extract_email_address(raw: str) -> str:
    """Extract plain email from 'Name <email@domain.com>' format."""
    if "<" in raw and ">" in raw:
        return raw.split("<")[1].split(">")[0].strip().lower()
    return raw.strip().lower()
