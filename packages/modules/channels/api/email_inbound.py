"""
Email inbound webhook router.

Receives parsed inbound emails from transactional email provider webhooks:

  SendGrid   Inbound Parse  →  multipart/form-data
  Postmark   Inbound        →  application/json
  Mailgun    Routes         →  multipart/form-data

Security
--------
Every inbound request must authenticate. Providers differ:

* Postmark / SendGrid — no standard per-request signature for inbound webhooks,
  so we require a shared secret. Configure your provider to include the
  secret as either `?secret=…` in the URL or header `X-Inbound-Secret: …`.
  Expected value is env var `EMAIL_INBOUND_SECRET`. In production an unset
  secret causes every request to 401; in development a missing secret logs
  a warning and accepts.

* Mailgun — uses built-in HMAC: timestamp + token + signature, keyed off the
  Mailgun API signing key in env var `MAILGUN_SIGNING_KEY`.

Multi-tenancy
-------------
We route by the recipient address matched against `ChannelSettings.email_inbound_address`.
If the recipient is not registered for any tenant the message is dropped
(no hardcoded default tenant).
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
from packages.modules.channels.schemas import InboundAttachment, NormalizedMessage
from packages.modules.agent.core.channel_dispatcher import CHANNEL_DISPATCHER

log = logging.getLogger(__name__)

router = APIRouter(prefix="/channels/email", tags=["channels-email"])

_INBOUND_SECRET = os.environ.get("EMAIL_INBOUND_SECRET", "").strip()
_MAILGUN_KEY    = os.environ.get("MAILGUN_SIGNING_KEY", "").strip()


# ── Auth helpers ──────────────────────────────────────────────────────────────

def _check_shared_secret(request: Request, query_secret: str | None) -> bool:
    if not _INBOUND_SECRET:
        if app_settings.is_production:
            log.error("EMAIL_INBOUND_SECRET not set — rejecting inbound webhook")
            return False
        log.warning(
            "EMAIL_INBOUND_SECRET not set — accepting inbound webhook (dev mode)"
        )
        return True
    header_val = request.headers.get("x-inbound-secret", "") or ""
    provided = header_val or (query_secret or "")
    if not provided:
        return False
    return hmac.compare_digest(provided, _INBOUND_SECRET)


def _verify_mailgun(form: dict) -> bool:
    if not _MAILGUN_KEY:
        if app_settings.is_production:
            log.error("MAILGUN_SIGNING_KEY not set — rejecting Mailgun webhook")
            return False
        log.warning("MAILGUN_SIGNING_KEY not set — accepting Mailgun webhook (dev mode)")
        return True
    timestamp = str(form.get("timestamp", ""))
    token     = str(form.get("token", ""))
    signature = str(form.get("signature", ""))
    if not (timestamp and token and signature):
        return False
    expected = hmac.new(
        _MAILGUN_KEY.encode("utf-8"),
        f"{timestamp}{token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Routing ───────────────────────────────────────────────────────────────────

def _resolve_company_by_address(db: Session, to_address: str) -> int | None:
    normalised = to_address.lower().strip()
    if not normalised:
        return None
    rows = (
        db.query(ChannelSettings)
        .filter(
            ChannelSettings.channel == "email",
            ChannelSettings.is_enabled == True,
        )
        .all()
    )
    for s in rows:
        if s.email_inbound_address and s.email_inbound_address.lower() in normalised:
            return s.company_id
    return None


# ── Provider-specific parsers ──────────────────────────────────────────────────

def _parse_sendgrid(form: dict) -> dict[str, Any]:
    headers_str = form.get("headers", "") or ""
    msg_id = ""
    if "Message-ID:" in headers_str:
        try:
            msg_id = headers_str.split("Message-ID:")[1].split("\n")[0].strip()
        except Exception:
            msg_id = ""
    return {
        "from":    form.get("from", ""),
        "to":      form.get("to", ""),
        "subject": form.get("subject", ""),
        "body":    form.get("text") or form.get("html") or "",
        "message_id": msg_id,
        "attachments": int(form.get("attachments", "0") or 0),
    }


def _parse_postmark(data: dict) -> dict[str, Any]:
    atts = data.get("Attachments") or []
    return {
        "from":    data.get("From", ""),
        "to":      data.get("To", ""),
        "subject": data.get("Subject", ""),
        "body":    data.get("TextBody") or data.get("HtmlBody") or "",
        "message_id": data.get("MessageID", ""),
        "attachments": len(atts),
        "attachment_meta": [
            {
                "filename":     a.get("Name"),
                "content_type": a.get("ContentType"),
                "size_bytes":   a.get("ContentLength"),
                "content_b64":  a.get("Content"),
            }
            for a in atts
        ],
    }


def _parse_mailgun(form: dict) -> dict[str, Any]:
    return {
        "from":    form.get("sender", ""),
        "to":      form.get("recipient", ""),
        "subject": form.get("subject", ""),
        "body":    form.get("stripped-text") or form.get("body-plain") or "",
        "message_id": form.get("Message-Id", ""),
        "attachments": int(form.get("attachment-count", "0") or 0),
    }


# ── Webhook endpoint ───────────────────────────────────────────────────────────

@router.post("/inbound")
async def email_inbound(
    request: Request,
    background_tasks: BackgroundTasks,
    provider: str = Query(default="sendgrid"),
    secret: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """
    Receive inbound emails from email provider webhooks.
    401 on auth failure, 400 on malformed payload, 200 after success.
    """
    content_type = request.headers.get("content-type", "")
    try:
        if "application/json" in content_type:
            data = await request.json()
        else:
            form = await request.form()
            data = dict(form)
    except Exception as exc:
        log.error("Email inbound parse error: %s", exc)
        raise HTTPException(status_code=400, detail="Malformed payload")

    if provider == "mailgun":
        if not _verify_mailgun(data):
            raise HTTPException(status_code=401, detail="Invalid Mailgun signature")
        parsed = _parse_mailgun(data)
    else:
        if not _check_shared_secret(request, secret):
            raise HTTPException(status_code=401, detail="Invalid inbound secret")
        if provider == "postmark":
            parsed = _parse_postmark(data)
        else:
            parsed = _parse_sendgrid(data)

    background_tasks.add_task(_process_email, parsed, db)
    return Response(status_code=200)


def _process_email(parsed: dict[str, Any], db: Session) -> None:
    try:
        from_addr  = _extract_email_address(parsed.get("from", ""))
        to_addr    = parsed.get("to", "")
        body       = (parsed.get("body") or "").strip()
        message_id = parsed.get("message_id", "") or from_addr

        company_id = _resolve_company_by_address(db, to_addr)
        if not company_id:
            log.warning(
                "Inbound email to %r not registered for any tenant — dropped",
                to_addr,
            )
            return

        att_count = int(parsed.get("attachments", 0) or 0)
        meta      = parsed.get("attachment_meta") or []
        attachments: list[InboundAttachment] = []
        for i in range(att_count):
            m = meta[i] if i < len(meta) else {}
            attachments.append(
                InboundAttachment(
                    filename=m.get("filename") or f"attachment_{i+1}",
                    content_type=m.get("content_type") or "application/octet-stream",
                    size_bytes=m.get("size_bytes"),
                    content_b64=m.get("content_b64"),
                )
            )

        norm = NormalizedMessage(
            channel="email",
            company_id=company_id,
            sender_ref=from_addr,
            thread_id=message_id,
            body=body,
            attachments=attachments,
            raw=parsed,
        )

        # Best-effort CFDI XML → draft expense before agent classification.
        try:
            from packages.modules.channels.service.inbound_drafts import (
                try_create_draft_from_email,
                try_create_draft_from_receipt,
            )

            draft = try_create_draft_from_email(db, norm)
            if not draft:
                # No CFDI found — try receipt extraction (PDF/image)
                try_create_draft_from_receipt(db, norm)
        except Exception:
            log.exception("inbound draft creation crashed")

        # Log the inbound message to the audit trail
        try:
            from packages.modules.channels.models import ChannelMessage
            msg_log = ChannelMessage(
                company_id=company_id,
                channel="email",
                direction="inbound",
                sender_ref=from_addr,
                thread_id=message_id or from_addr,
                body=body[:4000] if body else None,
                intent="expense_submission" if norm.attachments else "general_chat",
                status="received",
            )
            db.add(msg_log)
            db.commit()
        except Exception:
            log.exception("Failed to log inbound email message")

        # Dispatch to autonomous agent
        CHANNEL_DISPATCHER.dispatch(
            db=db,
            channel_type="email",
            message=norm.body or "",
            user_id=norm.sender_ref,  # email string — resolved to User inside dispatcher
            company_id=company_id,
            confidence=1.0,
        )

    except Exception as exc:
        log.error("Error processing inbound email: %s", exc, exc_info=True)


def _extract_email_address(raw: str) -> str:
    if "<" in raw and ">" in raw:
        return raw.split("<")[1].split(">")[0].strip().lower()
    return raw.strip().lower()
