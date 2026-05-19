"""Agent Lifecycle Management Service.

Handles:
- Template management (CRUD for agent templates)
- Tenant deployment (deploy/update/remove agents from tenants)
- Health monitoring (heartbeats, status tracking)
- Workflow mapping (connect agents to workflow steps)
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ..models_lifecycle import (
    AgentTemplate,
    AgentHeartbeat,
    AgentWorkflowMapping,
    TenantAgent,
)


# ---------------------------------------------------------------------------
# Template Management
# ---------------------------------------------------------------------------

def create_template(
    db: Session,
    *,
    key: str,
    name: str,
    category: str,
    persona: str,
    system_prompt: str,
    allowed_tools: list[str],
    description: str | None = None,
    default_settings: dict | None = None,
    workflow_mapping: list[str] | None = None,
    is_system: bool = False,
) -> AgentTemplate:
    """Create a new agent template (Super Admin only)."""
    template = AgentTemplate(
        key=key,
        name=name,
        description=description,
        category=category,
        persona=persona,
        system_prompt=system_prompt,
        allowed_tools=json.dumps(allowed_tools),
        default_settings=default_settings or {},
        workflow_mapping=workflow_mapping or [],
        is_system=is_system,
        is_active=True,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


def update_template(
    db: Session,
    template_id: int,
    *,
    name: str | None = None,
    description: str | None = None,
    system_prompt: str | None = None,
    allowed_tools: list[str] | None = None,
    default_settings: dict | None = None,
    workflow_mapping: list[str] | None = None,
    is_active: bool | None = None,
) -> AgentTemplate | None:
    """Update an existing agent template."""
    template = db.query(AgentTemplate).filter(AgentTemplate.id == template_id).first()
    if not template:
        return None
    
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    if system_prompt is not None:
        template.system_prompt = system_prompt
    if allowed_tools is not None:
        template.allowed_tools = json.dumps(allowed_tools)
    if default_settings is not None:
        template.default_settings = default_settings
    if workflow_mapping is not None:
        template.workflow_mapping = workflow_mapping
    if is_active is not None:
        template.is_active = is_active
    
    # Increment version on update
    template.version = (template.version or 1) + 1
    template.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(template)
    return template


def list_templates(
    db: Session,
    *,
    category: str | None = None,
    is_active: bool | None = None,
    is_system: bool | None = None,
) -> list[AgentTemplate]:
    """List all agent templates with optional filters."""
    query = db.query(AgentTemplate)
    
    if category is not None:
        query = query.filter(AgentTemplate.category == category)
    if is_active is not None:
        query = query.filter(AgentTemplate.is_active == is_active)
    if is_system is not None:
        query = query.filter(AgentTemplate.is_system == is_system)
    
    return query.order_by(AgentTemplate.category, AgentTemplate.name).all()


def get_template(db: Session, template_id: int) -> AgentTemplate | None:
    """Get a single agent template by ID."""
    return db.query(AgentTemplate).filter(AgentTemplate.id == template_id).first()


def get_template_by_key(db: Session, key: str) -> AgentTemplate | None:
    """Get a single agent template by key."""
    return db.query(AgentTemplate).filter(AgentTemplate.key == key).first()


# ---------------------------------------------------------------------------
# Tenant Deployment
# ---------------------------------------------------------------------------

def deploy_agent_to_tenant(
    db: Session,
    *,
    template_id: int,
    company_id: int,
    settings: dict | None = None,
    deployed_by: int | None = None,
) -> TenantAgent:
    """Deploy an agent template to a tenant (company).
    
    Creates a TenantAgent instance that operates within the tenant's scope.
    """
    # Verify template exists and is active
    template = db.query(AgentTemplate).filter(
        AgentTemplate.id == template_id,
        AgentTemplate.is_active == True,
    ).first()
    if not template:
        raise ValueError(f"Template {template_id} not found or inactive")
    
    # Check if already deployed to this tenant
    existing = db.query(TenantAgent).filter(
        TenantAgent.template_id == template_id,
        TenantAgent.company_id == company_id,
    ).first()
    
    if existing:
        # Update existing deployment
        if settings is not None:
            existing.settings = settings
        existing.is_active = True
        existing.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(existing)
        return existing
    
    # Create new deployment
    tenant_agent = TenantAgent(
        template_id=template_id,
        company_id=company_id,
        settings=settings or {},
        is_active=True,
        deployed_by=deployed_by,
        health_status="pending",
    )
    db.add(tenant_agent)
    db.commit()
    db.refresh(tenant_agent)
    return tenant_agent


def list_tenant_agents(
    db: Session,
    *,
    company_id: int | None = None,
    template_id: int | None = None,
    is_active: bool | None = None,
    health_status: str | None = None,
) -> list[TenantAgent]:
    """List tenant agent deployments with optional filters."""
    query = db.query(TenantAgent)
    
    if company_id is not None:
        query = query.filter(TenantAgent.company_id == company_id)
    if template_id is not None:
        query = query.filter(TenantAgent.template_id == template_id)
    if is_active is not None:
        query = query.filter(TenantAgent.is_active == is_active)
    if health_status is not None:
        query = query.filter(TenantAgent.health_status == health_status)
    
    return query.order_by(TenantAgent.company_id, TenantAgent.id).all()


def get_tenant_agent(db: Session, tenant_agent_id: int) -> TenantAgent | None:
    """Get a single tenant agent by ID."""
    return db.query(TenantAgent).filter(TenantAgent.id == tenant_agent_id).first()


def update_tenant_agent(
    db: Session,
    tenant_agent_id: int,
    *,
    settings: dict | None = None,
    is_active: bool | None = None,
) -> TenantAgent | None:
    """Update a tenant agent's settings or active status."""
    tenant_agent = db.query(TenantAgent).filter(TenantAgent.id == tenant_agent_id).first()
    if not tenant_agent:
        return None
    
    if settings is not None:
        tenant_agent.settings = settings
    if is_active is not None:
        tenant_agent.is_active = is_active
    
    tenant_agent.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(tenant_agent)
    return tenant_agent


def remove_agent_from_tenant(db: Session, tenant_agent_id: int) -> bool:
    """Soft-delete (deactivate) a tenant agent deployment."""
    tenant_agent = db.query(TenantAgent).filter(TenantAgent.id == tenant_agent_id).first()
    if not tenant_agent:
        return False
    
    tenant_agent.is_active = False
    tenant_agent.updated_at = datetime.utcnow()
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Health Monitoring
# ---------------------------------------------------------------------------

def record_heartbeat(
    db: Session,
    *,
    tenant_agent_id: int,
    status: str = "healthy",
    response_time_ms: int | None = None,
    active_sessions: int = 0,
    error_count: int = 0,
    last_error: str | None = None,
    dependencies: dict | None = None,
    uptime_seconds: int = 0,
    metrics: dict | None = None,
) -> AgentHeartbeat:
    """Record a heartbeat for a tenant agent.
    
    This should be called periodically (e.g., every 30 seconds) by running agents.
    """
    heartbeat = AgentHeartbeat(
        tenant_agent_id=tenant_agent_id,
        status=status,
        response_time_ms=response_time_ms,
        active_sessions=active_sessions,
        error_count=error_count,
        last_error=last_error,
        dependencies=dependencies or {},
        uptime_seconds=uptime_seconds,
        metrics=metrics or {},
    )
    db.add(heartbeat)
    
    # Update tenant agent's health status
    tenant_agent = db.query(TenantAgent).filter(TenantAgent.id == tenant_agent_id).first()
    if tenant_agent:
        tenant_agent.last_heartbeat_at = datetime.utcnow()
        tenant_agent.health_status = status
        if metrics and "total_conversations" in metrics:
            tenant_agent.total_conversations += metrics["total_conversations"]
        if metrics and "total_tool_calls" in metrics:
            tenant_agent.total_tool_calls += metrics["total_tool_calls"]
    
    db.commit()
    db.refresh(heartbeat)
    return heartbeat


def get_agent_health(
    db: Session,
    tenant_agent_id: int,
    hours: int = 24,
) -> dict:
    """Get health summary for a tenant agent.
    
    Returns:
        - Current status
        - Heartbeats in last N hours
        - Uptime percentage
        - Error rate
        - Average response time
    """
    cutoff = datetime.utcnow() - timedelta(hours=hours)
    
    heartbeats = (
        db.query(AgentHeartbeat)
        .filter(
            AgentHeartbeat.tenant_agent_id == tenant_agent_id,
            AgentHeartbeat.created_at >= cutoff,
        )
        .order_by(AgentHeartbeat.created_at.desc())
        .all()
    )
    
    if not heartbeats:
        return {
            "status": "no_data",
            "heartbeats_count": 0,
            "uptime_percentage": 0.0,
            "error_rate": 0.0,
            "avg_response_time_ms": None,
        }
    
    total = len(heartbeats)
    healthy = sum(1 for h in heartbeats if h.status == "healthy")
    errors = sum(h.error_count for h in heartbeats)
    avg_response_time = (
        sum(h.response_time_ms for h in heartbeats if h.response_time_ms) / 
        sum(1 for h in heartbeats if h.response_time_ms)
        if any(h.response_time_ms for h in heartbeats) else None
    )
    
    return {
        "status": heartbeats[0].status if heartbeats else "no_data",
        "heartbeats_count": total,
        "uptime_percentage": (healthy / total * 100) if total > 0 else 0.0,
        "error_rate": errors / total if total > 0 else 0.0,
        "avg_response_time_ms": avg_response_time,
        "last_heartbeat": heartbeats[0].created_at.isoformat() if heartbeats else None,
    }


def get_all_agents_health_summary(db: Session) -> dict:
    """Get health summary for ALL tenant agents (platform-wide).
    
    Used by Super Admin dashboard to show overall platform health.
    """
    # Get latest status for each tenant agent
    latest_heartbeats = (
        db.query(
            AgentHeartbeat.tenant_agent_id,
            func.max(AgentHeartbeat.created_at).label("latest_at"),
        )
        .group_by(AgentHeartbeat.tenant_agent_id)
        .subquery()
    )
    
    agents = (
        db.query(TenantAgent)
        .filter(TenantAgent.is_active == True)
        .all()
    )
    
    total = len(agents)
    healthy = sum(1 for a in agents if a.health_status == "healthy")
    degraded = sum(1 for a in agents if a.health_status == "degraded")
    offline = sum(1 for a in agents if a.health_status == "offline")
    pending = sum(1 for a in agents if a.health_status == "pending")
    
    return {
        "total_agents": total,
        "healthy": healthy,
        "degraded": degraded,
        "offline": offline,
        "pending": pending,
        "health_percentage": (healthy / total * 100) if total > 0 else 0.0,
    }


# ---------------------------------------------------------------------------
# Workflow Mapping
# ---------------------------------------------------------------------------

def map_agent_to_workflow(
    db: Session,
    *,
    tenant_agent_id: int,
    workflow_step: str,
    role: str = "primary",
    config: dict | None = None,
    priority: int = 100,
) -> AgentWorkflowMapping:
    """Map a tenant agent to a workflow step.
    
    Workflow steps:
    - expense.intake
    - expense.validation
    - expense.bundling
    - expense.approval
    - expense.accounting
    - notification.email
    - notification.whatsapp
    - user.access_control
    """
    # Check if mapping already exists
    existing = db.query(AgentWorkflowMapping).filter(
        AgentWorkflowMapping.tenant_agent_id == tenant_agent_id,
        AgentWorkflowMapping.workflow_step == workflow_step,
    ).first()
    
    if existing:
        existing.role = role
        existing.config = config or {}
        existing.priority = priority
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        return existing
    
    mapping = AgentWorkflowMapping(
        tenant_agent_id=tenant_agent_id,
        workflow_step=workflow_step,
        role=role,
        config=config or {},
        priority=priority,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping


def get_workflow_agents(
    db: Session,
    company_id: int,
    workflow_step: str,
) -> list[TenantAgent]:
    """Get all agents mapped to a workflow step for a tenant."""
    mappings = (
        db.query(AgentWorkflowMapping)
        .join(TenantAgent)
        .filter(
            TenantAgent.company_id == company_id,
            TenantAgent.is_active == True,
            AgentWorkflowMapping.workflow_step == workflow_step,
            AgentWorkflowMapping.is_active == True,
        )
        .order_by(AgentWorkflowMapping.priority)
        .all()
    )
    
    return [m.tenant_agent for m in mappings]


def get_agent_workflows(
    db: Session,
    tenant_agent_id: int,
) -> list[AgentWorkflowMapping]:
    """Get all workflow steps a tenant agent is mapped to."""
    return (
        db.query(AgentWorkflowMapping)
        .filter(
            AgentWorkflowMapping.tenant_agent_id == tenant_agent_id,
            AgentWorkflowMapping.is_active == True,
        )
        .order_by(AgentWorkflowMapping.priority)
        .all()
    )


# ---------------------------------------------------------------------------
# Migration from Legacy Agent Definitions
# ---------------------------------------------------------------------------

def migrate_legacy_agent_definitions(db: Session) -> dict:
    """Migrate existing agent_definitions to the new agent_templates table.
    
    This is a one-time migration script.
    """
    from ..models_definitions import AgentDefinition
    
    legacy_agents = db.query(AgentDefinition).all()
    
    migrated = []
    errors = []
    
    for legacy in legacy_agents:
        try:
            # Determine category based on key
            category = "config_helper"
            if legacy.key in ["accountant-work", "expense-validator", "expense-bundler", "notification-agent"]:
                category = "worker"
            elif legacy.key == "super-admin":
                category = "platform"
            
            # Map persona
            persona = legacy.persona or "admin"
            
            # Create template
            template = AgentTemplate(
                key=legacy.key,
                name=legacy.name,
                description=legacy.description,
                category=category,
                persona=persona,
                system_prompt=legacy.system_prompt,
                allowed_tools=legacy.allowed_tools,
                default_settings={},
                workflow_mapping=[],
                is_system=legacy.is_system,
                is_active=legacy.is_active,
                version=1,
            )
            db.add(template)
            migrated.append(legacy.key)
            
        except Exception as e:
            errors.append({"key": legacy.key, "error": str(e)})
    
    if migrated:
        db.commit()
    
    return {
        "migrated": migrated,
        "errors": errors,
        "total_legacy": len(legacy_agents),
        "total_migrated": len(migrated),
    }