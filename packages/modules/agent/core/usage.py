"""Usage logging helpers — one row per completed agent turn."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import AgentUsage


def log_usage(
    db: Session,
    *,
    company_id: int,
    session_id: str | None,
    user_id: int | None,
    persona: str,
    model: str,
    provider: str,
    tool_count: int,
    iterations: int,
    duration_ms: int,
    ok: bool,
) -> None:
    try:
        db.add(AgentUsage(
            company_id=company_id,
            session_id=session_id,
            user_id=user_id,
            persona=persona,
            model=model[:128],
            provider=provider[:64],
            tool_count=tool_count,
            iterations=iterations,
            duration_ms=duration_ms,
            ok=ok,
        ))
        db.commit()
    except Exception:
        # Never fail a user turn because the usage row failed to insert.
        db.rollback()
