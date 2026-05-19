"""Agent Lifecycle Management API Router.

Super Admin endpoints for managing agent templates, deployments, and health.
All endpoints require super_admin role.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from ..models_lifecycle import (
    AgentTemplate,
    AgentHeartbeat,
    AgentWorkflowMapping,
    TenantAgent,
)
from ..service.agent_lifecycle_service import (
    create_template,
    update_template,
    list_templates,
    get_template,
    get_template_by_key,
    deploy_agent_to_tenant,
    list_tenant_agents,
    get_tenant_agent,
    update_tenant_agent,
    remove_agent_from_tenant,
    record_heartbeat,
    get_agent_health,
    get_all_agents_health_summary,
    map_agent_to_workflow,
    get_workflow_agents,
    get_agent_workflows,
    migrate_legacy_agent_definitions,
)

router = APIRouter(prefix="/platform/agents", tags=["agent-lifecycle"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=128)
    category: str = Field(..., pattern=r"^(config_helper|worker|platform)$")
    persona: str = Field(default="admin", max_length=32)
    system_prompt: str = Field(..., min_length=1)
    allowed_tools: list[str] = Field(default_factory=list)
    description: str | None = None
    default_settings: dict[str, Any] | None = None
    workflow_mapping: list[str] | None = None
    is_system: bool = False


class TemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    description: str | None = None
    system_prompt: str | None = None
    allowed_tools: list[str] | None = None
    default_settings: dict[str, Any] | None = None
    workflow_mapping: list[str] | None = None
    is_active: bool | None = None


class TemplateRead(BaseModel):
    id: int
    key: str
    name: str
    description: str | None
    category: str
    persona: str
    system_prompt: str
    allowed_tools: list[str]
    default_settings: dict[str, Any] | None
    workflow_mapping: list[str] | None
    version: int
    is_system: bool
    is_active: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: AgentTemplate) -> "TemplateRead":
        import json
        return cls(
            id=row.id,
            key=row.key,
            name=row.name,
            description=row.description,
            category=row.category,
            persona=row.persona,
            system_prompt=row.system_prompt,
            allowed_tools=json.loads(row.allowed_tools) if isinstance(row.allowed_tools, str) else row.allowed_tools,
            default_settings=row.default_settings,
            workflow_mapping=row.workflow_mapping,
            version=row.version,
            is_system=row.is_system,
            is_active=row.is_active,
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else "",
        )


class TenantDeploy(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: int
    company_id: int
    settings: dict[str, Any] | None = None


class TenantAgentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    settings: dict[str, Any] | None = None
    is_active: bool | None = None


class TenantAgentRead(BaseModel):
    id: int
    template_id: int
    template_key: str | None
    template_name: str | None
    template_category: str | None
    company_id: int
    settings: dict[str, Any] | None
    is_active: bool
    deployed_at: str
    last_heartbeat_at: str | None
    health_status: str
    total_conversations: int
    total_tool_calls: int
    last_activity_at: str | None

    @classmethod
    def from_row(cls, row: TenantAgent) -> "TenantAgentRead":
        return cls(
            id=row.id,
            template_id=row.template_id,
            template_key=row.template.key if row.template else None,
            template_name=row.template.name if row.template else None,
            template_category=row.template.category if row.template else None,
            company_id=row.company_id,
            settings=row.settings,
            is_active=row.is_active,
            deployed_at=row.deployed_at.isoformat() if row.deployed_at else "",
            last_heartbeat_at=row.last_heartbeat_at.isoformat() if row.last_heartbeat_at else None,
            health_status=row.health_status,
            total_conversations=row.total_conversations,
            total_tool_calls=row.total_tool_calls,
            last_activity_at=row.last_activity_at.isoformat() if row.last_activity_at else None,
        )


class HeartbeatCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str = Field(default="healthy", pattern=r"^(healthy|degraded|offline|error)$")
    response_time_ms: int | None = None
    active_sessions: int = Field(default=0, ge=0)
    error_count: int = Field(default=0, ge=0)
    last_error: str | None = None
    dependencies: dict[str, str] | None = None
    uptime_seconds: int = Field(default=0, ge=0)
    metrics: dict[str, Any] | None = None


class WorkflowMappingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    workflow_step: str = Field(..., pattern=r"^[a-z_]+\.[a-z_]+$")
    role: str = Field(default="primary", pattern=r"^(primary|backup|assistant)$")
    config: dict[str, Any] | None = None
    priority: int = Field(default=100, ge=1, le=1000)


# ---------------------------------------------------------------------------
# Template Endpoints (Super Admin)
# ---------------------------------------------------------------------------

@router.post("/templates", response_model=TemplateRead)
def create_agent_template(
    body: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TemplateRead:
    """Create a new agent template.
    
    Templates are blueprints that can be deployed to multiple tenants.
    """
    # Check if key already exists
    existing = get_template_by_key(db, body.key)
    if existing:
        raise HTTPException(status_code=400, detail=f"Template key '{body.key}' already exists")
    
    template = create_template(
        db,
        key=body.key,
        name=body.name,
        category=body.category,
        persona=body.persona,
        system_prompt=body.system_prompt,
        allowed_tools=body.allowed_tools,
        description=body.description,
        default_settings=body.default_settings,
        workflow_mapping=body.workflow_mapping,
        is_system=body.is_system,
    )
    return TemplateRead.from_row(template)


@router.get("/templates", response_model=list[TemplateRead])
def list_agent_templates(
    category: str | None = Query(None, pattern=r"^(config_helper|worker|platform)$"),
    is_active: bool | None = None,
    is_system: bool | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> list[TemplateRead]:
    """List all agent templates with optional filters."""
    templates = list_templates(db, category=category, is_active=is_active, is_system=is_system)
    return [TemplateRead.from_row(t) for t in templates]


@router.get("/templates/{template_id}", response_model=TemplateRead)
def get_agent_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TemplateRead:
    """Get a single agent template by ID."""
    template = get_template(db, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateRead.from_row(template)


@router.patch("/templates/{template_id}", response_model=TemplateRead)
def update_agent_template(
    template_id: int,
    body: TemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TemplateRead:
    """Update an agent template."""
    template = update_template(
        db,
        template_id,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt,
        allowed_tools=body.allowed_tools,
        default_settings=body.default_settings,
        workflow_mapping=body.workflow_mapping,
        is_active=body.is_active,
    )
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return TemplateRead.from_row(template)


# ---------------------------------------------------------------------------
# Deployment Endpoints (Super Admin)
# ---------------------------------------------------------------------------

@router.post("/deploy", response_model=TenantAgentRead)
def deploy_agent(
    body: TenantDeploy,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TenantAgentRead:
    """Deploy an agent template to a tenant (company).
    
    Creates a TenantAgent instance that operates within the tenant's scope.
    """
    try:
        tenant_agent = deploy_agent_to_tenant(
            db,
            template_id=body.template_id,
            company_id=body.company_id,
            settings=body.settings,
            deployed_by=current_user.id,
        )
        return TenantAgentRead.from_row(tenant_agent)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/deployments", response_model=list[TenantAgentRead])
def list_deployments(
    company_id: int | None = None,
    template_id: int | None = None,
    is_active: bool | None = None,
    health_status: str | None = Query(None, pattern=r"^(pending|healthy|degraded|offline)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> list[TenantAgentRead]:
    """List all tenant agent deployments with optional filters."""
    tenant_agents = list_tenant_agents(
        db,
        company_id=company_id,
        template_id=template_id,
        is_active=is_active,
        health_status=health_status,
    )
    return [TenantAgentRead.from_row(ta) for ta in tenant_agents]


@router.get("/deployments/{tenant_agent_id}", response_model=TenantAgentRead)
def get_deployment(
    tenant_agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TenantAgentRead:
    """Get a single tenant agent deployment by ID."""
    tenant_agent = get_tenant_agent(db, tenant_agent_id)
    if not tenant_agent:
        raise HTTPException(status_code=404, detail="Tenant agent not found")
    return TenantAgentRead.from_row(tenant_agent)


@router.patch("/deployments/{tenant_agent_id}", response_model=TenantAgentRead)
def update_deployment(
    tenant_agent_id: int,
    body: TenantAgentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> TenantAgentRead:
    """Update a tenant agent deployment (settings or active status)."""
    tenant_agent = update_tenant_agent(
        db,
        tenant_agent_id,
        settings=body.settings,
        is_active=body.is_active,
    )
    if not tenant_agent:
        raise HTTPException(status_code=404, detail="Tenant agent not found")
    return TenantAgentRead.from_row(tenant_agent)


@router.delete("/deployments/{tenant_agent_id}")
def remove_deployment(
    tenant_agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, str]:
    """Remove (deactivate) a tenant agent deployment."""
    success = remove_agent_from_tenant(db, tenant_agent_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tenant agent not found")
    return {"status": "deactivated"}


# ---------------------------------------------------------------------------
# Health & Monitoring Endpoints
# ---------------------------------------------------------------------------

@router.post("/deployments/{tenant_agent_id}/heartbeat")
def send_heartbeat(
    tenant_agent_id: int,
    body: HeartbeatCreate,
    db: Session = Depends(get_db),
) -> dict[str, str]:
    """Record a heartbeat for a tenant agent.
    
    This endpoint is called by running agents to report their health.
    No auth required - called by agent runtime.
    """
    # Verify tenant agent exists
    tenant_agent = get_tenant_agent(db, tenant_agent_id)
    if not tenant_agent:
        raise HTTPException(status_code=404, detail="Tenant agent not found")
    
    record_heartbeat(
        db,
        tenant_agent_id=tenant_agent_id,
        status=body.status,
        response_time_ms=body.response_time_ms,
        active_sessions=body.active_sessions,
        error_count=body.error_count,
        last_error=body.last_error,
        dependencies=body.dependencies,
        uptime_seconds=body.uptime_seconds,
        metrics=body.metrics,
    )
    return {"status": "ok"}


@router.get("/deployments/{tenant_agent_id}/health")
def get_deployment_health(
    tenant_agent_id: int,
    hours: int = Query(24, ge=1, le=168),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Get health summary for a tenant agent deployment."""
    health = get_agent_health(db, tenant_agent_id, hours=hours)
    return health


@router.get("/health-summary")
def get_platform_health_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Get health summary for ALL tenant agents (platform-wide).
    
    Dashboard data for Super Admin Agent Command Center.
    """
    return get_all_agents_health_summary(db)


# ---------------------------------------------------------------------------
# Workflow Mapping Endpoints
# ---------------------------------------------------------------------------

@router.post("/deployments/{tenant_agent_id}/workflows")
def map_agent_workflow(
    tenant_agent_id: int,
    body: WorkflowMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Map a tenant agent to a workflow step."""
    # Verify tenant agent exists
    tenant_agent = get_tenant_agent(db, tenant_agent_id)
    if not tenant_agent:
        raise HTTPException(status_code=404, detail="Tenant agent not found")
    
    mapping = map_agent_to_workflow(
        db,
        tenant_agent_id=tenant_agent_id,
        workflow_step=body.workflow_step,
        role=body.role,
        config=body.config,
        priority=body.priority,
    )
    return mapping.to_dict()


@router.get("/deployments/{tenant_agent_id}/workflows")
def list_agent_workflows(
    tenant_agent_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> list[dict[str, Any]]:
    """Get all workflow steps a tenant agent is mapped to."""
    workflows = get_agent_workflows(db, tenant_agent_id)
    return [w.to_dict() for w in workflows]


@router.get("/workflows/{workflow_step}/tenants/{company_id}/agents")
def get_workflow_agents_endpoint(
    workflow_step: str,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> list[dict[str, Any]]:
    """Get all agents mapped to a workflow step for a tenant."""
    agents = get_workflow_agents(db, company_id, workflow_step)
    return [TenantAgentRead.from_row(a).model_dump() for a in agents]


# ---------------------------------------------------------------------------
# Migration Endpoint
# ---------------------------------------------------------------------------

@router.post("/migrate-legacy")
def migrate_legacy_definitions(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Migrate legacy agent_definitions to the new agent_templates table.
    
    One-time migration script.
    """
    result = migrate_legacy_agent_definitions(db)
    return result


# ---------------------------------------------------------------------------
# Dashboard Endpoint
# ---------------------------------------------------------------------------

@router.get("/dashboard")
def get_agent_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin),
) -> dict[str, Any]:
    """Get complete Agent Command Center dashboard data.
    
    Returns:
    - Platform health summary
    - All templates
    - All deployments
    - Deployment counts by category
    """
    # Platform health
    health_summary = get_all_agents_health_summary(db)
    
    # Templates
    templates = list_templates(db)
    templates_by_category = {}
    for t in templates:
        if t.category not in templates_by_category:
            templates_by_category[t.category] = []
        templates_by_category[t.category].append(TemplateRead.from_row(t))
    
    # Deployments by tenant
    tenant_agents = list_tenant_agents(db)
    deployments_by_tenant = {}
    for ta in tenant_agents:
        if ta.company_id not in deployments_by_tenant:
            deployments_by_tenant[ta.company_id] = []
        deployments_by_tenant[ta.company_id].append(TenantAgentRead.from_row(ta))
    
    # Active deployments by category
    active_by_category = {"config_helper": 0, "worker": 0, "platform": 0}
    for ta in tenant_agents:
        if ta.is_active and ta.template:
            cat = ta.template.category
            if cat in active_by_category:
                active_by_category[cat] += 1
    
    return {
        "platform_health": health_summary,
        "templates": {
            "total": len(templates),
            "by_category": templates_by_category,
        },
        "deployments": {
            "total": len(tenant_agents),
            "active": len([ta for ta in tenant_agents if ta.is_active]),
            "by_tenant": {str(k): v for k, v in deployments_by_tenant.items()},
            "by_category": active_by_category,
        },
    }