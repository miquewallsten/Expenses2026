"""Outbound webhook signing + dispatch enqueue (Phase 4.2).

Receivers verify a delivery by:

1. Reading the ``X-FinOps-Timestamp`` header. Reject if drift > 300s.
2. Reading the ``X-FinOps-Nonce`` header and rejecting any nonce already
   seen for the same subscription within the past 24 hours (replay guard).
3. Computing ``HMAC_SHA256(secret, f"{timestamp}.{nonce}.{raw_body}")`` and
   constant-time-comparing to ``X-FinOps-Signature``.

Actual HTTP POST + retry is handled by a background worker that pulls rows
where ``status == 'pending'`` and ``next_attempt_at <= now()``. This module
just signs and persists.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import secrets
from datetime import datetime
from typing import Any, Iterable

from sqlalchemy.orm import Session

from packages.modules.integrations.models_public_api import (
    WebhookDelivery,
    WebhookSubscription,
)


def sign(secret: str, timestamp: str, nonce: str, raw_body: bytes | str) -> str:
    if isinstance(raw_body, str):
        raw_body = raw_body.encode("utf-8")
    msg = f"{timestamp}.{nonce}.".encode("utf-8") + raw_body
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def canonical_body(payload: dict[str, Any]) -> str:
    """Stable JSON serialization so signer and verifier agree byte-for-byte."""
    return json.dumps(payload, separators=(",", ":"), sort_keys=True, default=str)


def matching_subscriptions(
    db: Session, *, company_id: int, event_type: str
) -> list[WebhookSubscription]:
    rows = (
        db.query(WebhookSubscription)
        .filter(
            WebhookSubscription.company_id == company_id,
            WebhookSubscription.is_enabled.is_(True),
        )
        .all()
    )
    return [r for r in rows if r.event_type in (event_type, "*")]


def emit_event(
    db: Session,
    *,
    company_id: int,
    event_type: str,
    resource_type: str,
    resource_id: int,
    payload: dict[str, Any],
) -> list[WebhookDelivery]:
    """Enqueue a delivery row per matching subscription. Worker sends them."""
    deliveries: list[WebhookDelivery] = []
    for sub in matching_subscriptions(
        db, company_id=company_id, event_type=event_type
    ):
        delivery = WebhookDelivery(
            subscription_id=sub.id,
            company_id=company_id,
            event_type=event_type,
            resource_type=resource_type,
            resource_id=resource_id,
            nonce=secrets.token_hex(16),
            payload=payload,
            status="pending",
            next_attempt_at=datetime.utcnow(),
        )
        db.add(delivery)
        deliveries.append(delivery)
    if deliveries:
        db.commit()
        for d in deliveries:
            db.refresh(d)
    return deliveries
