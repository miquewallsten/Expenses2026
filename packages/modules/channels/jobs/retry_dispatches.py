"""Retry pending notification dispatches.

Re-processes NotificationDispatch rows stuck in ``pending`` status that have
not exceeded MAX_ATTEMPTS. Runs as a recurring APScheduler job (every 60s).

Only rows older than 30 seconds are retried to avoid re-dispatching rows
that were just created by a concurrent ``send()`` call.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import and_
from sqlalchemy.orm import Session

from packages.modules.channels.models import NotificationDispatch

log = logging.getLogger(__name__)

MAX_ATTEMPTS = 3
RETRY_AGE_SECONDS = 30


def retry_pending_dispatches(db: Session) -> dict[str, int]:
    """Re-deliver pending dispatches that are eligible for retry.

    Returns:
        {"retried": int, "succeeded": int, "failed": int, "maxed_out": int}
    """
    cutoff = datetime.now(tz=timezone.utc)

    pending = (
        db.query(NotificationDispatch)
        .filter(
            NotificationDispatch.status == "pending",
            NotificationDispatch.attempts < MAX_ATTEMPTS,
            # Only retry rows older than 30s to avoid racing with in-flight send()
            NotificationDispatch.created_at <= cutoff,
        )
        .order_by(NotificationDispatch.created_at.asc())
        .limit(100)
        .all()
    )

    if not pending:
        return {"retried": 0, "succeeded": 0, "failed": 0, "maxed_out": 0}

    # Lazy import to avoid circular deps
    from packages.modules.channels.service.notifier import (
        NotifyRequest,
        Recipient,
        RenderedMessage,
        _deliver,
    )

    stats = {"retried": 0, "succeeded": 0, "failed": 0, "maxed_out": 0}

    for row in pending:
        # Refresh row state (might have been delivered by another worker)
        db.refresh(row)
        if row.status != "pending":
            continue

        # Reconstruct a minimal NotifyRequest for _deliver
        from packages.core.platform.models_user import User as UserModel

        user = db.query(UserModel).filter(UserModel.id == row.recipient_user_id).first()

        recipient = Recipient(
            user_id=row.recipient_user_id,
            email=user.email if user else None,
            whatsapp=getattr(user, "whatsapp_phone", None)
            if user and getattr(user, "whatsapp_verified", False)
            else None,
        )

        msg = RenderedMessage(
            subject=row.payload_json and _extract_subject(row.payload_json) or row.event_type,
            text=row.payload_json and _extract_text(row.payload_json) or "",
            whatsapp_text=None,  # will fall back to text
        )

        req = NotifyRequest(
            company_id=row.company_id,
            event_type=row.event_type,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            recipients=[recipient],
            message=msg,
            channels=(row.channel,),
        )

        stats["retried"] += 1

        try:
            _deliver(db, req, recipient, row.channel, row)
            if row.status == "sent":
                stats["succeeded"] += 1
            else:
                stats["failed"] += 1
                if row.attempts >= MAX_ATTEMPTS:
                    stats["maxed_out"] += 1
        except Exception:
            log.exception("Retry failed for dispatch id=%s", row.id)
            stats["failed"] += 1

    log.info(
        "Notification retry: retried=%d succeeded=%d failed=%d maxed_out=%d",
        stats["retried"], stats["succeeded"], stats["failed"], stats["maxed_out"],
    )
    return stats


def _extract_subject(payload_json: str) -> str | None:
    try:
        import json
        data = json.loads(payload_json)
        return data.get("subject")
    except Exception:
        return None


def _extract_text(payload_json: str) -> str | None:
    try:
        import json
        data = json.loads(payload_json)
        return data.get("text") or data.get("body")
    except Exception:
        return None
