"""
WhatsApp Cloud API client.

Uses Meta's Graph API v19.0 — no third-party SDK required.
Official docs: https://developers.facebook.com/docs/whatsapp/cloud-api

Key design:
- All calls go to https://graph.facebook.com/v19.0/
- phone_number_id identifies our sending phone number
- access_token is the system user permanent token stored in ChannelSettings
"""

from __future__ import annotations

import logging
import os
from typing import Any

import httpx

log = logging.getLogger(__name__)

_GRAPH_BASE = "https://graph.facebook.com/v19.0"
_DEFAULT_TIMEOUT = 15.0


def _headers(access_token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }


def send_text(
    phone_number_id: str,
    access_token: str,
    to: str,
    body: str,
) -> dict[str, Any]:
    """Send a plain text message to a WhatsApp user."""
    url = f"{_GRAPH_BASE}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": body, "preview_url": False},
    }
    try:
        resp = httpx.post(url, json=payload, headers=_headers(access_token), timeout=_DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        log.error("WhatsApp send_text failed: %s — %s", exc.response.status_code, exc.response.text)
        raise
    except Exception as exc:
        log.error("WhatsApp send_text error: %s", exc)
        raise


def send_template(
    phone_number_id: str,
    access_token: str,
    to: str,
    template_name: str,
    language_code: str = "es",
    components: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Send a pre-approved WhatsApp template message.

    Templates are required when messaging users outside of a 24-hour customer-service window.
    All business-initiated conversations must use templates.
    """
    url = f"{_GRAPH_BASE}/{phone_number_id}/messages"
    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
    if components:
        payload["template"]["components"] = components
    try:
        resp = httpx.post(url, json=payload, headers=_headers(access_token), timeout=_DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json()
    except httpx.HTTPStatusError as exc:
        log.error("WhatsApp send_template failed: %s — %s", exc.response.status_code, exc.response.text)
        raise


def mark_as_read(
    phone_number_id: str,
    access_token: str,
    message_id: str,
) -> None:
    """Mark an inbound message as read (shows double blue ticks)."""
    url = f"{_GRAPH_BASE}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "status": "read",
        "message_id": message_id,
    }
    try:
        resp = httpx.post(url, json=payload, headers=_headers(access_token), timeout=_DEFAULT_TIMEOUT)
        resp.raise_for_status()
    except Exception:
        pass  # Non-critical — don't let read-receipt errors kill message processing


def get_media_url(access_token: str, media_id: str) -> str | None:
    """
    Step 1 of media download: resolve the media_id to a temporary URL.
    The URL expires after ~5 minutes — download immediately.
    """
    url = f"{_GRAPH_BASE}/{media_id}"
    try:
        resp = httpx.get(url, headers=_headers(access_token), timeout=_DEFAULT_TIMEOUT)
        resp.raise_for_status()
        return resp.json().get("url")
    except Exception as exc:
        log.error("get_media_url failed for %s: %s", media_id, exc)
        return None


def download_media(access_token: str, media_url: str) -> bytes | None:
    """Step 2: actually download the media bytes using the resolved URL."""
    try:
        resp = httpx.get(
            media_url,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30.0,
            follow_redirects=True,
        )
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        log.error("download_media failed: %s", exc)
        return None


def verify_webhook_signature(payload_bytes: bytes, x_hub_signature: str, app_secret: str) -> bool:
    """
    Validate the X-Hub-Signature-256 header Meta sends with each webhook POST.
    Best practice: always verify before processing payload.
    """
    import hashlib
    import hmac

    expected = "sha256=" + hmac.new(app_secret.encode(), payload_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, x_hub_signature)


def parse_inbound_webhook(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """
    Extract normalised message dicts from the Meta webhook payload.

    Returns a list (one webhook can carry multiple messages):
    {
        wa_message_id, from_phone, timestamp, type,
        text_body, media_id, media_type, media_mime_type,
        contact_name
    }
    """
    messages = []
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if change.get("field") != "messages":
                    continue
                contacts = {c["wa_id"]: c.get("profile", {}).get("name", "") for c in value.get("contacts", [])}
                for msg in value.get("messages", []):
                    msg_type = msg.get("type", "unknown")
                    parsed: dict[str, Any] = {
                        "wa_message_id":  msg.get("id"),
                        "from_phone":     "+" + msg.get("from", "").lstrip("+"),
                        "timestamp":      msg.get("timestamp"),
                        "type":           msg_type,
                        "text_body":      None,
                        "media_id":       None,
                        "media_type":     None,
                        "media_mime_type": None,
                        "contact_name":   contacts.get(msg.get("from", ""), ""),
                    }
                    if msg_type == "text":
                        parsed["text_body"] = msg.get("text", {}).get("body", "")
                    elif msg_type in ("image", "document", "audio", "video"):
                        media = msg.get(msg_type, {})
                        parsed["media_id"]        = media.get("id")
                        parsed["media_type"]      = msg_type
                        parsed["media_mime_type"] = media.get("mime_type")
                    messages.append(parsed)
    except Exception as exc:
        log.error("parse_inbound_webhook error: %s", exc)
    return messages
