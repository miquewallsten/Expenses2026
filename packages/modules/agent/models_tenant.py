"""Tenant-scoped agent models for session, memory, and workflow state.

These models enforce tenant isolation via company_id and support per-tenant
agent configurations and state tracking.
"""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class TenantAgentSession(Base):
    """Session state for a tenant-scoped agent conversation.

    Tracks ongoing sessions for each agent instance per company. The unique
    constraint ensures one active session per company+session_id combination.
    """

    __tablename__ = "tenant_agent_sessions"
    __table_args__ = (
        UniqueConstraint("company_id", "session_id", name="uq_tenant_sessions_company_session"),
        Index("idx_tenant_sessions_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    agent_key: Mapped[str] = mapped_column(String(64), nullable=False)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )


class TenantAgentMemory(Base):
    """Persistent memory for a tenant-scoped agent.

    Stores key-value pairs that the agent can recall across sessions.
    Each memory entry has an associated confidence score for retrieval ranking.
    The unique constraint ensures one value per company+agent+key combination.
    """

    __tablename__ = "tenant_agent_memory"
    __table_args__ = (
        UniqueConstraint("company_id", "agent_key", "key", name="uq_tenant_memory_company_agent_key"),
        Index("idx_tenant_memory_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    agent_key: Mapped[str] = mapped_column(String(64), nullable=False)
    key: Mapped[str] = mapped_column(String(255), nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class TenantWorkflowProgress(Base):
    """Workflow state tracking for tenant-scoped workflows.

    Tracks the progress of multi-step workflows (e.g., expense approval,
    onboarding, data import) with current step and context data.
    The unique constraint ensures one progress entry per company+workflow.
    """

    __tablename__ = "tenant_workflow_progress"
    __table_args__ = (
        UniqueConstraint("company_id", "workflow_key", name="uq_tenant_workflow_company_key"),
        Index("idx_tenant_workflow_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    workflow_key: Mapped[str] = mapped_column(String(128), nullable=False)
    current_step: Mapped[str] = mapped_column(String(128), nullable=False)
    total_steps: Mapped[int] = mapped_column(Integer, nullable=False)
    completed_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )