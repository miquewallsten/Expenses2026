"""Agent memory — persistent per-company facts/preferences/decisions.

Stored in ``agent_memory`` table; injected into the system prompt each turn.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ..models import AgentMemory


ALLOWED_KINDS = ("fact", "preference", "decision")


def remember(
    db: Session,
    *,
    company_id: int,
    key: str,
    value: Any,
    kind: str = "fact",
    user_id: int | None = None,
    expires_at: datetime | None = None,
) -> AgentMemory:
    if kind not in ALLOWED_KINDS:
        kind = "fact"
    # Upsert on (company_id, user_id, kind, key).
    q = db.query(AgentMemory).filter(
        AgentMemory.company_id == company_id,
        AgentMemory.user_id == user_id,
        AgentMemory.kind == kind,
        AgentMemory.key == key,
    )
    row = q.one_or_none()
    payload = json.dumps(value, default=str)
    if row is None:
        row = AgentMemory(
            company_id=company_id,
            user_id=user_id,
            kind=kind,
            key=key,
            value_json=payload,
            expires_at=expires_at,
        )
        db.add(row)
    else:
        row.value_json = payload
        row.expires_at = expires_at
    db.commit()
    db.refresh(row)
    return row


def recall(
    db: Session,
    *,
    company_id: int,
    key: str,
    kind: str | None = None,
    user_id: int | None = None,
) -> Any | None:
    q = db.query(AgentMemory).filter(
        AgentMemory.company_id == company_id,
        AgentMemory.key == key,
    )
    if kind is not None:
        q = q.filter(AgentMemory.kind == kind)
    if user_id is not None:
        q = q.filter(AgentMemory.user_id == user_id)
    row = q.order_by(AgentMemory.created_at.desc()).first()
    if row is None:
        return None
    try:
        return json.loads(row.value_json)
    except Exception:
        return row.value_json


def list_memories(
    db: Session,
    *,
    company_id: int,
    kind: str | None = None,
    user_id: int | None = None,
    limit: int = 50,
) -> list[AgentMemory]:
    q = db.query(AgentMemory).filter(AgentMemory.company_id == company_id)
    if kind is not None:
        q = q.filter(AgentMemory.kind == kind)
    if user_id is not None:
        q = q.filter(AgentMemory.user_id == user_id)
    return q.order_by(AgentMemory.created_at.desc()).limit(max(1, min(limit, 200))).all()


def forget(
    db: Session,
    *,
    company_id: int,
    key: str,
    kind: str | None = None,
    user_id: int | None = None,
) -> int:
    q = db.query(AgentMemory).filter(
        AgentMemory.company_id == company_id,
        AgentMemory.key == key,
    )
    if kind is not None:
        q = q.filter(AgentMemory.kind == kind)
    if user_id is not None:
        q = q.filter(AgentMemory.user_id == user_id)
    n = q.delete(synchronize_session=False)
    db.commit()
    return n


def list_memories_for_prompt(
    db: Session,
    *,
    company_id: int,
    user_id: int | None = None,
    limit: int = 8,
) -> str | None:
    """Render the N most recent memories as a compact Spanish block."""
    rows = list_memories(db, company_id=company_id, limit=limit * 2)
    if user_id is not None:
        # Preference: include user-specific first, then company-wide.
        user_rows = [r for r in rows if r.user_id == user_id]
        global_rows = [r for r in rows if r.user_id is None]
        rows = (user_rows + global_rows)[:limit]
    else:
        rows = rows[:limit]
    if not rows:
        return None
    lines = ["Memoria (hechos/preferencias/decisiones previas):"]
    for r in rows:
        try:
            val = json.loads(r.value_json)
        except Exception:
            val = r.value_json
        val_str = val if isinstance(val, str) else json.dumps(val, default=str, ensure_ascii=False)
        if len(val_str) > 140:
            val_str = val_str[:140] + "…"
        lines.append(f"- [{r.kind}] {r.key}: {val_str}")
    return "\n".join(lines)
