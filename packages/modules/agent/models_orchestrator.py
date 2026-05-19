"""SQLAlchemy models for the Agent Orchestrator persistent state.

Replaces the in-memory dicts on the ORCHESTRATOR singleton with
PostgreSQL-backed tables that survive restarts.

Tables:
    orchestrator_sessions    — active orchestrator sessions
    orchestrator_metrics      — per-team performance metrics (upsert)
    orchestrator_requests     — request history (capped, with TTL cleanup)
"""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class OrchestratorSession(Base):
    """Active orchestrator session state — replaces in-memory active_sessions dict."""
    __tablename__ = "orchestrator_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    data: Mapped[str] = mapped_column(Text, nullable=False)  # JSON-encoded session data
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class OrchestratorTeamMetrics(Base):
    """Per-team performance counters — replaces in-memory performance_metrics dict."""
    __tablename__ = "orchestrator_team_metrics"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    team_name: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    total_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    successful_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_requests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    average_response_time: Mapped[float] = mapped_column(default=0.0)
    tool_usage: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: {"tool": count}
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class OrchestratorRequestLog(Base):
    """Request history — replaces in-memory request_history list. Capped at N rows."""
    __tablename__ = "orchestrator_request_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True, index=True)
    company_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    team: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="processing")
    user_message_preview: Mapped[str | None] = mapped_column(String(200), nullable=True)
    started_at: Mapped[float] = mapped_column(nullable=False)
    finished_at: Mapped[float | None] = mapped_column(nullable=True)
    result_ok: Mapped[bool | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
