"""Tool-call audit log helpers."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ..models import AgentToolCall
from .context import AgentContext
from .redact import redact


def record(
    ctx: AgentContext,
    *,
    tool_name: str,
    args: dict[str, Any],
    status: str,
    summary: str | None = None,
    error: str | None = None,
    duration_ms: int | None = None,
) -> None:
    row = AgentToolCall(
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        persona=ctx.persona,
        tool_name=tool_name,
        args_redacted=json.dumps(redact(args), default=str)[:8000],
        result_summary=(summary or "")[:2000],
        status=status,
        error=(error or None) and error[:4000],
        duration_ms=duration_ms,
        user_id=ctx.user_id,
    )
    ctx.db.add(row)
    # Best-effort: audit write must never break the agent loop.
    try:
        ctx.db.commit()
    except Exception:  # noqa: BLE001
        ctx.db.rollback()


def list_for_company(db: Session, company_id: int, *, limit: int = 100) -> list[AgentToolCall]:
    return (
        db.query(AgentToolCall)
        .filter(AgentToolCall.company_id == company_id)
        .order_by(AgentToolCall.created_at.desc())
        .limit(limit)
        .all()
    )
