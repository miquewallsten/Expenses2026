"""Agent Lifecycle Management Models.

Implements the Agent Command Center architecture:
- Agent templates (created by Super Admin, master definitions)
- Tenant agents (deployed instances per company)
- Agent heartbeats (real-time health monitoring)
- Agent workflow mappings (which business processes each agent powers)
"""

from datetime import datetime
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    JSON,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import JSONB
from apps.api.db import Base


class AgentTemplate(Base):
    """Master agent definition created by Super Admin.
    
    Templates are the "blueprint" for agents. They define:
    - What the agent does (system_prompt, category)
    - What tools it can use (tools, allowed_tools)
    - What workflow steps it powers (workflow_mapping)
    - Default behavior settings (default_settings)
    
    Templates are deployed to tenants as TenantAgent instances.
    """
    __tablename__ = "agent_templates"
    __table_args__ = (
        Index("ix_agent_templates_category", "category"),
        Index("ix_agent_templates_is_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Unique identifier for this template
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    
    # Human-readable name and description
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Category: 'config_helper' | 'worker' | 'platform'
    # config_helper: Helps tenant admins configure settings
    # worker: Performs automated tasks in the workflow
    # platform: Super Admin platform management agents
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="worker")
    
    # Persona determines permission scope
    persona: Mapped[str] = mapped_column(String(32), nullable=False, default="admin")
    
    # The core of the agent - its instructions
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Tools available to this agent
    # JSON array of tool names from the tool registry
    allowed_tools: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    
    # Default behavior settings (JSON)
    # e.g., {"require_confirmation_for_destructive": true, "confidence_threshold": 0.85}
    default_settings: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    # Workflow mapping: Which business processes does this agent power?
    # JSON array of workflow step identifiers
    # e.g., ["expense.validation", "expense.bundling", "notification.email"]
    workflow_mapping: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    # Version control
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    
    # Template lifecycle
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    
    # Audit timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    
    # Relationships
    tenant_instances: Mapped[list["TenantAgent"]] = relationship(
        "TenantAgent", back_populates="template", cascade="all, delete-orphan"
    )
    
    def to_dict(self) -> dict:
        """Serialize template for API responses."""
        import json
        return {
            "id": self.id,
            "key": self.key,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "persona": self.persona,
            "system_prompt": self.system_prompt,
            "allowed_tools": json.loads(self.allowed_tools) if isinstance(self.allowed_tools, str) else self.allowed_tools,
            "default_settings": self.default_settings,
            "workflow_mapping": self.workflow_mapping,
            "version": self.version,
            "is_system": self.is_system,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class TenantAgent(Base):
    """Deployed agent instance for a specific tenant.
    
    Each tenant has their own set of agents deployed from templates.
    Tenants never see the agent management - it's controlled by Super Admin.
    
    The agent operates within the tenant's scope (company_id) and uses
    the tenant's specific configuration (settings).
    """
    __tablename__ = "tenant_agents"
    __table_args__ = (
        Index("ix_tenant_agents_company_id", "company_id"),
        Index("ix_tenant_agents_template_id", "template_id"),
        Index("ix_tenant_agents_is_active", "is_active"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Which template this instance is deployed from
    template_id: Mapped[int] = mapped_column(
        Integer, 
        ForeignKey("agent_templates.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Tenant (company) this agent serves
    company_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("companies.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Instance-specific configuration (overrides template defaults)
    # JSON with keys like: memory_scope, custom_instructions, feature_flags
    settings: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    # Deployment state
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    deployed_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    deployed_by: Mapped[int | None] = mapped_column(Integer, nullable=True)  # user_id
    
    # Runtime status (updated by heartbeats)
    last_heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    health_status: Mapped[str] = mapped_column(
        String(16), 
        nullable=False, 
        default="pending"  # pending | healthy | degraded | offline
    )
    
    # Statistics
    total_conversations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_tool_calls: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_activity_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    
    # Audit timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    
    # Relationships
    template: Mapped["AgentTemplate"] = relationship("AgentTemplate", back_populates="tenant_instances")
    heartbeats: Mapped[list["AgentHeartbeat"]] = relationship(
        "AgentHeartbeat", back_populates="tenant_agent", cascade="all, delete-orphan"
    )
    
    def to_dict(self) -> dict:
        """Serialize tenant agent for API responses."""
        import json
        return {
            "id": self.id,
            "template_id": self.template_id,
            "template_key": self.template.key if self.template else None,
            "template_name": self.template.name if self.template else None,
            "company_id": self.company_id,
            "settings": self.settings,
            "is_active": self.is_active,
            "deployed_at": self.deployed_at.isoformat() if self.deployed_at else None,
            "last_heartbeat_at": self.last_heartbeat_at.isoformat() if self.last_heartbeat_at else None,
            "health_status": self.health_status,
            "total_conversations": self.total_conversations,
            "total_tool_calls": self.total_tool_calls,
            "last_activity_at": self.last_activity_at.isoformat() if self.last_activity_at else None,
        }


class AgentHeartbeat(Base):
    """Real-time health monitoring for tenant agents.
    
    Heartbeats are sent by agents periodically to confirm:
    - Agent is still running
    - Agent can reach required dependencies
    - Agent is processing requests successfully
    
    Heartbeats are used to calculate:
    - Uptime percentage
    - Health trends
    - Incident detection
    """
    __tablename__ = "agent_heartbeats"
    __table_args__ = (
        Index("ix_agent_heartbeats_tenant_agent_id", "tenant_agent_id"),
        Index("ix_agent_heartbeats_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Which tenant agent sent this heartbeat
    tenant_agent_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tenant_agents.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Health status at time of heartbeat
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="healthy"  # healthy | degraded | offline | error
    )
    
    # Response time in milliseconds
    response_time_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    
    # Current load (concurrent sessions)
    active_sessions: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Errors in the last interval
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    
    # Dependency health checks (JSON)
    # e.g., {"database": "ok", "llm_provider": "ok", "sat_service": "degraded"}
    dependencies: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    # Uptime at this heartbeat (cumulative seconds since deployment)
    uptime_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Metrics for this interval (JSON)
    # e.g., {"sessions": 5, "tool_calls": 23, "avg_latency_ms": 234}
    metrics: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    
    # Relationships
    tenant_agent: Mapped["TenantAgent"] = relationship("TenantAgent", back_populates="heartbeats")
    
    def to_dict(self) -> dict:
        """Serialize heartbeat for API responses."""
        return {
            "id": self.id,
            "tenant_agent_id": self.tenant_agent_id,
            "status": self.status,
            "response_time_ms": self.response_time_ms,
            "active_sessions": self.active_sessions,
            "error_count": self.error_count,
            "last_error": self.last_error,
            "dependencies": self.dependencies,
            "uptime_seconds": self.uptime_seconds,
            "metrics": self.metrics,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class AgentWorkflowMapping(Base):
    """Maps agents to workflow steps they participate in.
    
    This enables the Super Admin to see:
    - Which workflow steps are automated by agents
    - Which agents are critical paths
    - Bottlenecks where agent capacity matters
    
    Workflow steps for Mexican Financial Ops:
    - expense.intake: User submits expense
    - expense.validation: Agent validates expense (CFDI, SAT, policies)
    - expense.bundling: Agent bundles expenses into reports
    - expense.approval: Manager approval (human)
    - expense.accounting: Agent posts to accounting
    - notification.email: Agent sends email notifications
    - notification.whatsapp: Agent sends WhatsApp notifications
    - user.access_control: Agent monitors user permissions
    """
    __tablename__ = "agent_workflow_mappings"
    __table_args__ = (
        Index("ix_agent_workflow_mappings_tenant_agent_id", "tenant_agent_id"),
        Index("ix_agent_workflow_mappings_workflow_step", "workflow_step"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # Which tenant agent
    tenant_agent_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("tenant_agents.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # Workflow step identifier (dot notation)
    # e.g., "expense.validation", "notification.email"
    workflow_step: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # Role in this workflow step
    # primary: Main agent for this step
    # backup: Fallback agent
    # assistant: Helper agent (requires human confirmation)
    role: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="primary"
    )
    
    # Configuration for this workflow step (JSON)
    # e.g., {"batch_size": 50, "timeout_seconds": 300, "retry_count": 3}
    config: Mapped[str | None] = mapped_column(JSON, nullable=True)
    
    # Priority (lower = higher priority)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default="now()")
    
    def to_dict(self) -> dict:
        """Serialize workflow mapping for API responses."""
        return {
            "id": self.id,
            "tenant_agent_id": self.tenant_agent_id,
            "workflow_step": self.workflow_step,
            "role": self.role,
            "config": self.config,
            "priority": self.priority,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }