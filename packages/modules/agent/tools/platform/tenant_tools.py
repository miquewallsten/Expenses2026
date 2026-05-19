"""Platform tenant management tools for Super Admin.

These tools operate on PlatformTenant, which is NOT company-scoped.
The super_admin persona has platform-level access.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_platform import PlatformTenant

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec


# ── create_tenant ──────────────────────────────────────────────────────────────

class CreateTenantArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(..., min_length=1, max_length=255)
    plan: str = Field(default="starter", max_length=32)


def _handle_create_tenant(ctx: AgentContext, args: CreateTenantArgs) -> ToolResult:
    # Check if slug already exists
    existing = (
        ctx.db.query(PlatformTenant)
        .filter(PlatformTenant.slug == args.slug)
        .one_or_none()
    )
    if existing:
        return ToolResult(
            ok=False,
            summary=f"Tenant with slug '{args.slug}' already exists",
            error="duplicate_slug",
        )

    tenant = PlatformTenant(
        slug=args.slug,
        name=args.name,
        plan=args.plan,
        is_active=True,
    )
    ctx.db.add(tenant)
    ctx.db.commit()
    ctx.db.refresh(tenant)

    return ToolResult(
        ok=True,
        summary=f"Created tenant '{args.name}' ({args.slug}) on plan '{args.plan}'",
        data={
            "id": tenant.id,
            "slug": tenant.slug,
            "name": tenant.name,
            "plan": tenant.plan,
            "is_active": tenant.is_active,
        },
    )


REGISTRY.register(ToolSpec(
    name="create_tenant",
    description="Crea un nuevo tenant en la plataforma.",
    category="infra",
    input_schema=CreateTenantArgs,
    handler=_handle_create_tenant,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.infra",
))


# ── list_tenants ──────────────────────────────────────────────────────────────

class ListTenantsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_inactive: bool = Field(default=False)


def _handle_list_tenants(ctx: AgentContext, args: ListTenantsArgs) -> ToolResult:
    query = ctx.db.query(PlatformTenant)

    if not args.include_inactive:
        query = query.filter(PlatformTenant.is_active == True)  # noqa: E712

    tenants = query.order_by(PlatformTenant.created_at.desc()).all()

    return ToolResult(
        ok=True,
        summary=f"Found {len(tenants)} tenant(s)",
        data={
            "tenants": [
                {
                    "id": t.id,
                    "slug": t.slug,
                    "name": t.name,
                    "plan": t.plan,
                    "is_active": t.is_active,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in tenants
            ]
        },
    )


REGISTRY.register(ToolSpec(
    name="list_tenants",
    description="Lista todos los tenants de la plataforma.",
    category="read",
    input_schema=ListTenantsArgs,
    handler=_handle_list_tenants,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.infra",
))


# ── update_tenant ────────────────────────────────────────────────────────────

class UpdateTenantArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=64)
    name: str | None = Field(default=None, max_length=255)
    plan: str | None = Field(default=None, max_length=32)


def _handle_update_tenant(ctx: AgentContext, args: UpdateTenantArgs) -> ToolResult:
    tenant = (
        ctx.db.query(PlatformTenant)
        .filter(PlatformTenant.slug == args.slug)
        .one_or_none()
    )
    if not tenant:
        return ToolResult(
            ok=False,
            summary=f"Tenant '{args.slug}' not found",
            error="not_found",
        )

    changes: dict[str, Any] = {}
    if args.name is not None and args.name != tenant.name:
        tenant.name = args.name
        changes["name"] = args.name
    if args.plan is not None and args.plan != tenant.plan:
        tenant.plan = args.plan
        changes["plan"] = args.plan

    if not changes:
        return ToolResult(
            ok=False,
            summary="No changes provided",
            error="empty_patch",
        )

    ctx.db.commit()

    return ToolResult(
        ok=True,
        summary=f"Updated tenant '{args.slug}': {', '.join(changes.keys())}",
        data={"slug": tenant.slug, "changes": changes},
    )


REGISTRY.register(ToolSpec(
    name="update_tenant",
    description="Actualiza el nombre o plan de un tenant.",
    category="infra",
    input_schema=UpdateTenantArgs,
    handler=_handle_update_tenant,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.infra",
))


# ── suspend_tenant ────────────────────────────────────────────────────────────

class SuspendTenantArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str = Field(..., min_length=1, max_length=64)
    reason: str | None = Field(default=None, max_length=500)


def _handle_suspend_tenant(ctx: AgentContext, args: SuspendTenantArgs) -> ToolResult:
    tenant = (
        ctx.db.query(PlatformTenant)
        .filter(PlatformTenant.slug == args.slug)
        .one_or_none()
    )
    if not tenant:
        return ToolResult(
            ok=False,
            summary=f"Tenant '{args.slug}' not found",
            error="not_found",
        )

    if not tenant.is_active:
        return ToolResult(
            ok=False,
            summary=f"Tenant '{args.slug}' is already suspended",
            error="already_suspended",
        )

    from ...core.receipts import create_receipt
    preview = {
        "action": "suspend",
        "slug": tenant.slug,
        "name": tenant.name,
        "plan": tenant.plan,
        "reason": args.reason,
    }
    receipt = create_receipt(
        db=ctx.db,
        company_id=ctx.company_id,
        session_id=ctx.session_id,
        tool_name="suspend_tenant",
        args={"slug": args.slug, "reason": args.reason},
        preview=preview,
    )
    summary = f"Suspender tenant '{args.slug}'"
    if args.reason:
        summary += f" (reason: {args.reason})"

    return ToolResult(
        ok=True,
        summary=f"{summary} — requiere confirmación",
        data={"preview": preview},
        receipt_id=receipt.receipt_id,
    )


def _apply_suspend_tenant(ctx: AgentContext, args: dict) -> dict:
    tenant = (
        ctx.db.query(PlatformTenant)
        .filter(PlatformTenant.slug == args["slug"])
        .one_or_none()
    )
    if not tenant:
        raise ValueError(f"Tenant {args['slug']} not found")
    if not tenant.is_active:
        raise ValueError(f"Tenant {args['slug']} is already suspended")
    tenant.is_active = False
    ctx.db.commit()
    return {"slug": tenant.slug, "name": tenant.name, "is_active": False}


REGISTRY.register(ToolSpec(
    name="suspend_tenant",
    description="Suspende un tenant (lo marca como inactivo).",
    category="infra",
    input_schema=SuspendTenantArgs,
    handler=_handle_suspend_tenant,
    personas=frozenset({"admin"}),
    required_permission="agent.tool.infra",
    destructive=True,
    requires_confirmation=True,
))