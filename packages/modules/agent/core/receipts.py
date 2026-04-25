"""Two-phase commit: pending-action receipts.

A destructive tool does NOT write. Instead it calls ``create_receipt`` to park
the intended mutation and returns the ``receipt_id`` back through the agent
loop. The admin reviews the preview in the UI and confirms via
``POST /agent/confirm``, which calls ``confirm_receipt`` to re-dispatch the
tool with a ``_bypass_receipt`` flag that lets it actually write.

Receipts expire after 30 minutes.
"""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import update as sa_update
from sqlalchemy.orm import Session

from ..models import AgentPendingAction


RECEIPT_TTL_MINUTES = 30


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_receipt(
    db: Session,
    *,
    company_id: int,
    session_id: str | None,
    tool_name: str,
    args: dict[str, Any],
    preview: dict[str, Any],
) -> AgentPendingAction:
    receipt_id = secrets.token_urlsafe(24)[:36]
    row = AgentPendingAction(
        receipt_id=receipt_id,
        company_id=company_id,
        session_id=session_id,
        tool_name=tool_name,
        args=json.dumps(args, default=str),
        preview=json.dumps(preview, default=str),
        status="pending",
        expires_at=_now() + timedelta(minutes=RECEIPT_TTL_MINUTES),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def get_receipt(db: Session, receipt_id: str, *, company_id: int) -> AgentPendingAction | None:
    row = (
        db.query(AgentPendingAction)
        .filter(
            AgentPendingAction.receipt_id == receipt_id,
            AgentPendingAction.company_id == company_id,
        )
        .one_or_none()
    )
    if row is None:
        return None
    if row.status == "pending" and row.expires_at < _now():
        row.status = "expired"
        db.commit()
    return row


def claim_receipt(db: Session, receipt_id: str, *, company_id: int) -> AgentPendingAction | None:
    """Atomically transition status pending → confirming.

    Returns the row if we won the claim, None if someone else already claimed
    it or the receipt doesn't exist / isn't pending.  The caller must call
    mark_confirmed / mark_failed after the mutation completes.
    """
    result = db.execute(
        sa_update(AgentPendingAction)
        .where(
            AgentPendingAction.receipt_id == receipt_id,
            AgentPendingAction.company_id == company_id,
            AgentPendingAction.status == "pending",
        )
        .values(status="confirming")
        .execution_options(synchronize_session="fetch"),
    )
    if result.rowcount != 1:
        return None
    db.flush()
    return (
        db.query(AgentPendingAction)
        .filter(
            AgentPendingAction.receipt_id == receipt_id,
            AgentPendingAction.company_id == company_id,
        )
        .one_or_none()
    )


def mark_confirmed(
    db: Session,
    row: AgentPendingAction,
    *,
    confirmed_by: str,
    result: dict[str, Any],
) -> None:
    row.status = "confirmed"
    row.confirmed_at = _now()
    row.confirmed_by = confirmed_by
    row.result = json.dumps(result, default=str)
    db.commit()


def mark_rejected(db: Session, row: AgentPendingAction, *, confirmed_by: str) -> None:
    row.status = "rejected"
    row.confirmed_at = _now()
    row.confirmed_by = confirmed_by
    db.commit()


def mark_failed(db: Session, row: AgentPendingAction, *, error: str) -> None:
    row.status = "failed"
    row.error = error[:4000]
    db.commit()
