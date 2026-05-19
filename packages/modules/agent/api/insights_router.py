"""Agent activity dashboard and LLM cost tracking API.

Provides aggregated metrics on agent turns, token usage, costs, and
error rates for the Super Admin dashboard.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.modules.agent.models import AgentUsage, AgentSession, AgentToolCall

router = APIRouter(prefix="/agent/insights", tags=["agent-insights"], dependencies=[Depends(require_super_admin)])


# ── Company Aggregation ─────────────────────────────────────────────────────

@router.get("/{company_id}")
def company_insights(
    company_id: int,
    db: Session = Depends(get_db),
) -> dict:
    """Aggregated agent metrics for a company: turns, tokens, cost, errors."""
    # Total turns
    total_turns = (
        db.query(sa_func.count(AgentUsage.id))
        .filter(AgentUsage.company_id == company_id)
        .scalar()
    ) or 0

    # Total duration
    total_duration = (
        db.query(sa_func.sum(AgentUsage.duration_ms))
        .filter(AgentUsage.company_id == company_id)
        .scalar()
    ) or 0

    # Error count
    error_count = (
        db.query(sa_func.count(AgentUsage.id))
        .filter(AgentUsage.company_id == company_id, AgentUsage.ok == False)  # noqa: E712
        .scalar()
    ) or 0

    # Per-persona breakdown
    persona_rows = (
        db.query(
            AgentUsage.persona,
            sa_func.count(AgentUsage.id).label("turns"),
            sa_func.sum(AgentUsage.duration_ms).label("total_ms"),
            sa_func.count(AgentUsage.id).filter(AgentUsage.ok == False).label("errors"),  # noqa: E712
        )
        .filter(AgentUsage.company_id == company_id)
        .group_by(AgentUsage.persona)
        .all()
    )

    # Per-model breakdown
    model_rows = (
        db.query(
            AgentUsage.model,
            sa_func.count(AgentUsage.id).label("turns"),
            sa_func.sum(AgentUsage.duration_ms).label("total_ms"),
        )
        .filter(AgentUsage.company_id == company_id)
        .group_by(AgentUsage.model)
        .all()
    )

    # Last 24h activity
    yesterday = datetime.now(tz=timezone.utc) - timedelta(days=1)
    recent_turns = (
        db.query(sa_func.count(AgentUsage.id))
        .filter(
            AgentUsage.company_id == company_id,
            AgentUsage.created_at >= yesterday,
        )
        .scalar()
    ) or 0

    # Tool usage top 10
    tool_rows = (
        db.query(
            AgentToolCall.tool_name,
            sa_func.count(AgentToolCall.id).label("count"),
        )
        .filter(AgentToolCall.company_id == company_id)
        .group_by(AgentToolCall.tool_name)
        .order_by(sa_func.count(AgentToolCall.id).desc())
        .limit(10)
        .all()
    )

    error_rate = (error_count / total_turns * 100) if total_turns > 0 else 0.0

    return {
        "company_id": company_id,
        "total_turns": total_turns,
        "total_duration_ms": total_duration,
        "error_count": error_count,
        "error_rate_pct": round(error_rate, 2),
        "turns_last_24h": recent_turns,
        "by_persona": [
            {
                "persona": r.persona,
                "turns": r.turns,
                "total_ms": r.total_ms or 0,
                "errors": r.errors or 0,
            }
            for r in persona_rows
        ],
        "by_model": [
            {
                "model": r.model,
                "turns": r.turns,
                "total_ms": r.total_ms or 0,
            }
            for r in model_rows
        ],
        "top_tools": [
            {"tool_name": r.tool_name, "count": r.count}
            for r in tool_rows
        ],
    }


# ── Recent Sessions ──────────────────────────────────────────────────────────

@router.get("/{company_id}/sessions")
def company_sessions(
    company_id: int,
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> dict:
    """Recent agent sessions for a company."""
    total = (
        db.query(sa_func.count(AgentSession.id))
        .filter(AgentSession.company_id == company_id)
        .scalar()
    ) or 0

    sessions = (
        db.query(AgentSession)
        .filter(AgentSession.company_id == company_id)
        .order_by(AgentSession.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "sessions": [
            {
                "id": s.id,
                "session_id": s.session_id,
                "persona": s.persona,
                "user_id": s.user_id,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            }
            for s in sessions
        ],
    }


# ── Cost Trend ───────────────────────────────────────────────────────────────

@router.get("/{company_id}/cost-trend")
def cost_trend(
    company_id: int,
    days: int = Query(default=30, ge=1, le=90),
    db: Session = Depends(get_db),
) -> dict:
    """Daily agent activity trend for the last N days."""
    start_date = datetime.now(tz=timezone.utc) - timedelta(days=days)

    rows = (
        db.query(
            sa_func.date_trunc("day", AgentUsage.created_at).label("day"),
            sa_func.count(AgentUsage.id).label("turns"),
            sa_func.sum(AgentUsage.duration_ms).label("total_ms"),
            sa_func.count(AgentUsage.id).filter(AgentUsage.ok == False).label("errors"),  # noqa: E712
        )
        .filter(
            AgentUsage.company_id == company_id,
            AgentUsage.created_at >= start_date,
        )
        .group_by(sa_func.date_trunc("day", AgentUsage.created_at))
        .order_by(sa_func.date_trunc("day", AgentUsage.created_at))
        .all()
    )

    return {
        "company_id": company_id,
        "days": days,
        "trend": [
            {
                "date": r.day.isoformat() if r.day else None,
                "turns": r.turns,
                "total_ms": r.total_ms or 0,
                "errors": r.errors or 0,
            }
            for r in rows
        ],
    }


# ── Platform-wide Summary ────────────────────────────────────────────────────

@router.get("/platform/summary")
def platform_summary(
    db: Session = Depends(get_db),
) -> dict:
    """Platform-wide agent metrics (Super Admin only)."""
    total_turns = db.query(sa_func.count(AgentUsage.id)).scalar() or 0
    total_duration = db.query(sa_func.sum(AgentUsage.duration_ms)).scalar() or 0
    total_errors = db.query(sa_func.count(AgentUsage.id)).filter(AgentUsage.ok == False).scalar() or 0  # noqa: E712
    total_companies = db.query(sa_func.count(AgentUsage.company_id.distinct())).scalar() or 0

    return {
        "total_turns": total_turns,
        "total_duration_ms": total_duration,
        "total_errors": total_errors,
        "total_companies": total_companies,
        "error_rate_pct": round(total_errors / total_turns * 100, 2) if total_turns > 0 else 0.0,
    }
