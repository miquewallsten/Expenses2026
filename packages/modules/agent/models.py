"""SQLAlchemy models for the unified AI Agent.

Four tables:
    agent_sessions        — one per persona conversation, turns stored as JSON
    agent_tool_calls      — immutable audit row per tool invocation
    agent_pending_actions — receipts awaiting admin confirmation (TTL 30 min)
    agent_uploads         — uploaded files (Excel/CSV/PDF samples) referenced by tools
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class AgentSession(Base):
    """Multi-turn conversation history for the unified Agent.

    ``persona`` is one of: admin | employee | procurement. Same underlying
    engine, different tool allow-lists.
    ``turns`` is a JSON-encoded list of role/content dicts, capped by the router.
    """

    __tablename__ = "agent_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, unique=True)
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    turns: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_refs: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON: attached file_ids
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class AgentToolCall(Base):
    """Immutable audit row for every tool invocation made by the agent."""

    __tablename__ = "agent_tool_calls"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    args_redacted: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)  # ok|error|pending_confirmation
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )


class AgentPendingAction(Base):
    """A two-phase write receipt.

    The agent proposes a destructive change, a row is created with status
    ``pending``; the admin reviews the preview and calls ``/agent/confirm`` or
    ``/agent/reject``. Rows expire after 30 minutes.
    """

    __tablename__ = "agent_pending_actions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    receipt_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    tool_name: Mapped[str] = mapped_column(String(100), nullable=False)
    args: Mapped[str] = mapped_column(Text, nullable=False)     # JSON, the eventual apply payload
    preview: Mapped[str] = mapped_column(Text, nullable=False)  # JSON, human-readable diff/summary
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    # pending | confirmed | rejected | expired | failed
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    confirmed_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON, post-apply result
    error: Mapped[str | None] = mapped_column(Text, nullable=True)


class AgentUpload(Base):
    """File uploaded by the admin for an ingestion tool to parse."""

    __tablename__ = "agent_uploads"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    file_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False)
    uploaded_by: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_by_receipt_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class AgentMemory(Base):
    """Persistent per-company (optionally per-user) memory the agent can recall
    across sessions. Free-form key/value with a kind tag.

    ``kind``: fact | preference | decision
    ``value_json``: JSON-serialised payload (string, object, list, number).
    """

    __tablename__ = "agent_memory"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="fact")
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentInsight(Base):
    """A proactive finding produced by an insight scanner.

    ``kind``: stale_cfdi | over_budget_project | orphan_approval |
              duplicate_expense | policy_drift | missing_approver | other.
    ``severity``: info | warn | critical.
    ``status``: open | acknowledged | resolved | dismissed.
    """

    __tablename__ = "agent_insights"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    data_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open", index=True)
    suggested_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class AgentUsage(Base):
    """One row per agent turn — used for cost/latency dashboards and model routing hints."""

    __tablename__ = "agent_usage"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    session_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, default="ollama")
    tool_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), index=True
    )
