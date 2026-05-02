"""Platform LLM provider management tools for Super Admin.

These tools operate on PlatformLLMProvider, which is NOT company-scoped.
The super_admin persona has platform-level access.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_platform import PlatformLLMProvider

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec


# ── create_provider ───────────────────────────────────────────────────────────

class CreateProviderArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=64)
    provider_type: str = Field(..., min_length=1, max_length=32)
    model_name: str = Field(..., min_length=1, max_length=128)
    base_url: str | None = Field(default=None, max_length=255)
    cost_per_1k_input: float | None = Field(default=None)
    cost_per_1k_output: float | None = Field(default=None)


def _handle_create_provider(ctx: AgentContext, args: CreateProviderArgs) -> ToolResult:
    # Check if name already exists
    existing = (
        ctx.db.query(PlatformLLMProvider)
        .filter(PlatformLLMProvider.name == args.name)
        .one_or_none()
    )
    if existing:
        return ToolResult(
            ok=False,
            summary=f"Provider '{args.name}' already exists",
            error="duplicate_name",
        )

    provider = PlatformLLMProvider(
        name=args.name,
        provider_type=args.provider_type,
        model_name=args.model_name,
        base_url=args.base_url,
        cost_per_1k_tokens_input=Decimal(str(args.cost_per_1k_input)) if args.cost_per_1k_input else Decimal("0"),
        cost_per_1k_tokens_output=Decimal(str(args.cost_per_1k_output)) if args.cost_per_1k_output else Decimal("0"),
        is_active=True,
    )
    ctx.db.add(provider)
    ctx.db.commit()
    ctx.db.refresh(provider)

    return ToolResult(
        ok=True,
        summary=f"Created provider '{args.name}' ({args.provider_type}/{args.model_name})",
        data={
            "id": provider.id,
            "name": provider.name,
            "provider_type": provider.provider_type,
            "model_name": provider.model_name,
            "is_active": provider.is_active,
        },
    )


REGISTRY.register(ToolSpec(
    name="create_provider",
    description="Crea un nuevo proveedor LLM en la plataforma.",
    category="infra",
    input_schema=CreateProviderArgs,
    handler=_handle_create_provider,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))


# ── list_providers ─────────────────────────────────────────────────────────────

class ListProvidersArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    include_inactive: bool = Field(default=False)


def _handle_list_providers(ctx: AgentContext, args: ListProvidersArgs) -> ToolResult:
    query = ctx.db.query(PlatformLLMProvider)

    if not args.include_inactive:
        query = query.filter(PlatformLLMProvider.is_active == True)  # noqa: E712

    providers = query.order_by(PlatformLLMProvider.created_at.desc()).all()

    return ToolResult(
        ok=True,
        summary=f"Found {len(providers)} provider(s)",
        data={
            "providers": [
                {
                    "id": p.id,
                    "name": p.name,
                    "provider_type": p.provider_type,
                    "model_name": p.model_name,
                    "base_url": p.base_url,
                    "cost_per_1k_tokens_input": float(p.cost_per_1k_tokens_input),
                    "cost_per_1k_tokens_output": float(p.cost_per_1k_tokens_output),
                    "is_active": p.is_active,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in providers
            ]
        },
    )


REGISTRY.register(ToolSpec(
    name="list_providers",
    description="Lista todos los proveedores LLM de la plataforma.",
    category="read",
    input_schema=ListProvidersArgs,
    handler=_handle_list_providers,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))


# ── update_provider ────────────────────────────────────────────────────────────

class UpdateProviderArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=1, max_length=64)
    is_active: bool | None = None


def _handle_update_provider(ctx: AgentContext, args: UpdateProviderArgs) -> ToolResult:
    provider = (
        ctx.db.query(PlatformLLMProvider)
        .filter(PlatformLLMProvider.name == args.name)
        .one_or_none()
    )
    if not provider:
        return ToolResult(
            ok=False,
            summary=f"Provider '{args.name}' not found",
            error="not_found",
        )

    changes: dict[str, Any] = {}
    if args.is_active is not None and args.is_active != provider.is_active:
        provider.is_active = args.is_active
        changes["is_active"] = args.is_active

    if not changes:
        return ToolResult(
            ok=False,
            summary="No changes provided",
            error="empty_patch",
        )

    ctx.db.commit()

    return ToolResult(
        ok=True,
        summary=f"Updated provider '{args.name}': {', '.join(changes.keys())}",
        data={"name": provider.name, "changes": changes},
    )


REGISTRY.register(ToolSpec(
    name="update_provider",
    description="Actualiza el estado de un proveedor LLM.",
    category="infra",
    input_schema=UpdateProviderArgs,
    handler=_handle_update_provider,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))