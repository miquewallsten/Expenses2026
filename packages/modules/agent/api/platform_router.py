"""Platform management router for Super Admin.

Endpoints (all require super_admin):
    POST   /api/platform/tenants              — create tenant
    GET    /api/platform/tenants              — list tenants
    PATCH  /api/platform/tenants/{slug}       — update tenant
    DELETE /api/platform/tenants/{slug}       — suspend tenant (soft delete)

    POST   /api/platform/providers           — create provider
    GET    /api/platform/providers            — list providers
    PATCH  /api/platform/providers/{name}     — update provider

    GET    /api/platform/definitions          — list agent definitions
    GET    /api/platform/usage                — usage analytics
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.core.platform.models_user import User
from packages.core.platform.models_platform import (
    PlatformTenant,
    PlatformLLMProvider,
    PlatformAgentDefinition,
    PlatformUsageLog,
)


router = APIRouter(prefix="/platform", tags=["platform"])


# ── Schemas ────────────────────────────────────────────────────────────────────


class TenantCreate(BaseModel):
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=255)
    plan: str = Field(default="starter", max_length=32)


class TenantRead(BaseModel):
    id: int
    slug: str
    name: str
    plan: str
    is_active: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_row(cls, row: PlatformTenant) -> "TenantRead":
        return cls(
            id=row.id,
            slug=row.slug,
            name=row.name,
            plan=row.plan,
            is_active=row.is_active,
            created_at=row.created_at.isoformat() if row.created_at else "",
            updated_at=row.updated_at.isoformat() if row.updated_at else "",
        )


class TenantUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    plan: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None


class ProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    provider_type: str = Field(..., min_length=1, max_length=32)
    model_name: str = Field(..., min_length=1, max_length=128)
    base_url: str | None = Field(default=None, max_length=255)
    cost_per_1k_input: float | None = None
    cost_per_1k_output: float | None = None


class ProviderRead(BaseModel):
    id: int
    name: str
    provider_type: str
    model_name: str
    base_url: str | None
    cost_per_1k_tokens_input: float
    cost_per_1k_tokens_output: float
    is_active: bool
    created_at: str

    @classmethod
    def from_row(cls, row: PlatformLLMProvider) -> "ProviderRead":
        return cls(
            id=row.id,
            name=row.name,
            provider_type=row.provider_type,
            model_name=row.model_name,
            base_url=row.base_url,
            cost_per_1k_tokens_input=float(row.cost_per_1k_tokens_input),
            cost_per_1k_tokens_output=float(row.cost_per_1k_tokens_output),
            is_active=row.is_active,
            created_at=row.created_at.isoformat() if row.created_at else "",
        )


class ProviderUpdate(BaseModel):
    is_active: bool | None = None
    model_name: str | None = Field(default=None, max_length=128)
    base_url: str | None = None


class AgentDefinitionRead(BaseModel):
    id: int
    key: str
    name: str
    description: str | None
    system_prompt: str
    allowed_tools: list[str]
    default_provider_id: int | None
    is_active: bool
    created_at: str

    @classmethod
    def from_row(cls, row: PlatformAgentDefinition) -> "AgentDefinitionRead":
        import json
        tools = []
        if row.allowed_tools:
            try:
                tools = json.loads(row.allowed_tools) if isinstance(row.allowed_tools, str) else row.allowed_tools
            except (json.JSONDecodeError, TypeError):
                tools = []
        return cls(
            id=row.id,
            key=row.key,
            name=row.name,
            description=row.description,
            system_prompt=row.system_prompt,
            allowed_tools=tools,
            default_provider_id=row.default_provider_id,
            is_active=row.is_active,
            created_at=row.created_at.isoformat() if row.created_at else "",
        )


class UsageStats(BaseModel):
    total_requests: int
    total_input_tokens: int
    total_output_tokens: int
    total_cost: float
    by_tenant: list[dict[str, Any]]
    by_provider: list[dict[str, Any]]
    by_agent: list[dict[str, Any]]


# ── Tenant Routes ──────────────────────────────────────────────────────────────


@router.post("/tenants", response_model=TenantRead, dependencies=[Depends(require_super_admin)])
def create_tenant(
    payload: TenantCreate,
    db: Session = Depends(get_db),
) -> TenantRead:
    """Create a new tenant (company) on the platform."""
    existing = db.query(PlatformTenant).filter(PlatformTenant.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Tenant with slug '{payload.slug}' already exists")

    tenant = PlatformTenant(
        slug=payload.slug,
        name=payload.name,
        plan=payload.plan,
        is_active=True,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)
    return TenantRead.from_row(tenant)


@router.get("/tenants", response_model=list[TenantRead], dependencies=[Depends(require_super_admin)])
def list_tenants(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
) -> list[TenantRead]:
    """List all tenants on the platform."""
    query = db.query(PlatformTenant)
    if not include_inactive:
        query = query.filter(PlatformTenant.is_active == True)  # noqa: E712
    tenants = query.order_by(PlatformTenant.created_at.desc()).all()
    return [TenantRead.from_row(t) for t in tenants]


@router.patch("/tenants/{slug}", response_model=TenantRead, dependencies=[Depends(require_super_admin)])
def update_tenant(
    slug: str,
    payload: TenantUpdate,
    db: Session = Depends(get_db),
) -> TenantRead:
    """Update tenant name, plan, or status."""
    tenant = db.query(PlatformTenant).filter(PlatformTenant.slug == slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found")

    changes = False
    if payload.name is not None and payload.name != tenant.name:
        tenant.name = payload.name
        changes = True
    if payload.plan is not None and payload.plan != tenant.plan:
        tenant.plan = payload.plan
        changes = True
    if payload.is_active is not None and payload.is_active != tenant.is_active:
        tenant.is_active = payload.is_active
        changes = True

    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    db.commit()
    db.refresh(tenant)
    return TenantRead.from_row(tenant)


@router.delete("/tenants/{slug}", dependencies=[Depends(require_super_admin)])
def suspend_tenant(
    slug: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Suspend a tenant (soft delete via is_active flag)."""
    tenant = db.query(PlatformTenant).filter(PlatformTenant.slug == slug).first()
    if not tenant:
        raise HTTPException(status_code=404, detail=f"Tenant '{slug}' not found")

    if not tenant.is_active:
        raise HTTPException(status_code=400, detail=f"Tenant '{slug}' is already suspended")

    tenant.is_active = False
    db.commit()
    return {"ok": True, "slug": slug, "is_active": False}


# ── Provider Routes ────────────────────────────────────────────────────────────


@router.post("/providers", response_model=ProviderRead, dependencies=[Depends(require_super_admin)])
def create_provider(
    payload: ProviderCreate,
    db: Session = Depends(get_db),
) -> ProviderRead:
    """Create a new LLM provider configuration."""
    existing = db.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Provider '{payload.name}' already exists")

    provider = PlatformLLMProvider(
        name=payload.name,
        provider_type=payload.provider_type,
        model_name=payload.model_name,
        base_url=payload.base_url,
        cost_per_1k_tokens_input=Decimal(str(payload.cost_per_1k_input)) if payload.cost_per_1k_input else Decimal("0"),
        cost_per_1k_tokens_output=Decimal(str(payload.cost_per_1k_output)) if payload.cost_per_1k_output else Decimal("0"),
        is_active=True,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return ProviderRead.from_row(provider)


@router.get("/providers", response_model=list[ProviderRead], dependencies=[Depends(require_super_admin)])
def list_providers(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
) -> list[ProviderRead]:
    """List all LLM provider configurations."""
    query = db.query(PlatformLLMProvider)
    if not include_inactive:
        query = query.filter(PlatformLLMProvider.is_active == True)  # noqa: E712
    providers = query.order_by(PlatformLLMProvider.created_at.desc()).all()
    return [ProviderRead.from_row(p) for p in providers]


@router.patch("/providers/{name}", response_model=ProviderRead, dependencies=[Depends(require_super_admin)])
def update_provider(
    name: str,
    payload: ProviderUpdate,
    db: Session = Depends(get_db),
) -> ProviderRead:
    """Update an LLM provider configuration."""
    provider = db.query(PlatformLLMProvider).filter(PlatformLLMProvider.name == name).first()
    if not provider:
        raise HTTPException(status_code=404, detail=f"Provider '{name}' not found")

    changes = False
    if payload.is_active is not None and payload.is_active != provider.is_active:
        provider.is_active = payload.is_active
        changes = True
    if payload.model_name is not None and payload.model_name != provider.model_name:
        provider.model_name = payload.model_name
        changes = True
    if payload.base_url is not None and payload.base_url != provider.base_url:
        provider.base_url = payload.base_url
        changes = True

    if not changes:
        raise HTTPException(status_code=400, detail="No changes provided")

    db.commit()
    db.refresh(provider)
    return ProviderRead.from_row(provider)


# ── Agent Definition Routes ────────────────────────────────────────────────────


@router.get("/definitions", response_model=list[AgentDefinitionRead], dependencies=[Depends(require_super_admin)])
def list_agent_definitions(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
) -> list[AgentDefinitionRead]:
    """List all agent definitions."""
    query = db.query(PlatformAgentDefinition)
    if not include_inactive:
        query = query.filter(PlatformAgentDefinition.is_active == True)  # noqa: E712
    definitions = query.order_by(PlatformAgentDefinition.created_at.desc()).all()
    return [AgentDefinitionRead.from_row(d) for d in definitions]


# ── Usage Analytics ────────────────────────────────────────────────────────────


@router.get("/usage", response_model=UsageStats, dependencies=[Depends(require_super_admin)])
def get_usage_stats(
    days: int = 30,
    db: Session = Depends(get_db),
) -> UsageStats:
    """Get usage analytics for the platform."""
    # Get total aggregates
    total_result = db.query(
        func.count(PlatformUsageLog.id).label("total_requests"),
        func.sum(PlatformUsageLog.input_tokens).label("total_input_tokens"),
        func.sum(PlatformUsageLog.output_tokens).label("total_output_tokens"),
        func.sum(PlatformUsageLog.cost_input + PlatformUsageLog.cost_output).label("total_cost"),
    ).first()

    total_requests = total_result.total_requests or 0
    total_input_tokens = total_result.total_input_tokens or 0
    total_output_tokens = total_result.total_output_tokens or 0
    total_cost = float(total_result.total_cost or 0)

    # By tenant
    by_tenant = db.query(
        PlatformUsageLog.tenant_id,
        PlatformTenant.name,
        func.count(PlatformUsageLog.id).label("requests"),
        func.sum(PlatformUsageLog.input_tokens + PlatformUsageLog.output_tokens).label("tokens"),
    ).join(PlatformTenant).group_by(PlatformUsageLog.tenant_id, PlatformTenant.name).all()

    tenant_stats = [
        {"tenant_id": t.tenant_id, "tenant_name": t.name, "requests": t.requests, "tokens": t.tokens or 0}
        for t in by_tenant
    ]

    # By provider
    by_provider = db.query(
        PlatformUsageLog.provider_id,
        PlatformLLMProvider.name,
        func.count(PlatformUsageLog.id).label("requests"),
        func.sum(PlatformUsageLog.input_tokens + PlatformUsageLog.output_tokens).label("tokens"),
    ).join(
        PlatformLLMProvider,
        PlatformUsageLog.provider_id == PlatformLLMProvider.id,
        isouter=True,
    ).group_by(PlatformUsageLog.provider_id, PlatformLLMProvider.name).all()

    provider_stats = [
        {"provider_id": p.provider_id, "provider_name": p.name, "requests": p.requests, "tokens": p.tokens or 0}
        for p in by_provider
    ]

    # By agent
    by_agent = db.query(
        PlatformUsageLog.agent_key,
        func.count(PlatformUsageLog.id).label("requests"),
        func.sum(PlatformUsageLog.input_tokens + PlatformUsageLog.output_tokens).label("tokens"),
    ).group_by(PlatformUsageLog.agent_key).all()

    agent_stats = [
        {"agent_key": a.agent_key, "requests": a.requests, "tokens": a.tokens or 0}
        for a in by_agent
    ]

    return UsageStats(
        total_requests=total_requests,
        total_input_tokens=total_input_tokens,
        total_output_tokens=total_output_tokens,
        total_cost=total_cost,
        by_tenant=tenant_stats,
        by_provider=provider_stats,
        by_agent=agent_stats,
    )