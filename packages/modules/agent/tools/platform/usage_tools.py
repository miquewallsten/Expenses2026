"""Platform usage monitoring tools for Super Admin.

These tools operate on PlatformUsageLog, which is NOT company-scoped.
The super_admin persona has platform-level access.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from io import StringIO
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_platform import PlatformTenant, PlatformUsageLog

from ...core.context import AgentContext
from ...core.registry import REGISTRY, ToolResult, ToolSpec


# ── get_platform_usage_stats ───────────────────────────────────────────────────

class GetPlatformUsageStatsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: str | None = Field(default=None, description="Start date in ISO format (YYYY-MM-DD)")
    end_date: str | None = Field(default=None, description="End date in ISO format (YYYY-MM-DD)")


def _handle_get_platform_usage_stats(ctx: AgentContext, args: GetPlatformUsageStatsArgs) -> ToolResult:
    """Get aggregated platform-wide usage statistics."""
    query = ctx.db.query(PlatformUsageLog)

    # Apply date filters if provided
    if args.start_date:
        try:
            start_dt = datetime.fromisoformat(args.start_date)
            query = query.filter(PlatformUsageLog.created_at >= start_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid start_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    if args.end_date:
        try:
            end_dt = datetime.fromisoformat(args.end_date)
            query = query.filter(PlatformUsageLog.created_at <= end_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid end_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    logs = query.all()

    if not logs:
        return ToolResult(
            ok=True,
            summary="No usage data found for the specified period",
            data={
                "total_requests": 0,
                "successful_requests": 0,
                "failed_requests": 0,
                "success_rate": 0.0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_cost": "0.00",
                "period": {
                    "start": args.start_date,
                    "end": args.end_date,
                },
            },
        )

    total_requests = len(logs)
    successful_requests = sum(1 for log in logs if log.ok)
    failed_requests = total_requests - successful_requests
    success_rate = (successful_requests / total_requests * 100) if total_requests > 0 else 0.0

    total_input_tokens = sum(log.input_tokens for log in logs)
    total_output_tokens = sum(log.output_tokens for log in logs)

    total_cost = sum(
        (log.cost_input or Decimal("0")) + (log.cost_output or Decimal("0"))
        for log in logs
    )

    return ToolResult(
        ok=True,
        summary=f"Platform usage: {total_requests} requests, {success_rate:.1f}% success rate, ${float(total_cost):.2f} total cost",
        data={
            "total_requests": total_requests,
            "successful_requests": successful_requests,
            "failed_requests": failed_requests,
            "success_rate": round(success_rate, 2),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_cost": str(total_cost),
            "period": {
                "start": args.start_date,
                "end": args.end_date,
            },
        },
    )


REGISTRY.register(ToolSpec(
    name="get_platform_usage_stats",
    description="Obtiene estadísticas de uso agregadas de toda la plataforma.",
    category="read",
    input_schema=GetPlatformUsageStatsArgs,
    handler=_handle_get_platform_usage_stats,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))


# ── get_tenant_usage_breakdown ──────────────────────────────────────────────────

class GetTenantUsageBreakdownArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: str | None = Field(default=None, description="Start date in ISO format (YYYY-MM-DD)")
    end_date: str | None = Field(default=None, description="End date in ISO format (YYYY-MM-DD)")


def _handle_get_tenant_usage_breakdown(ctx: AgentContext, args: GetTenantUsageBreakdownArgs) -> ToolResult:
    """Get per-tenant usage breakdown."""
    query = ctx.db.query(PlatformUsageLog)

    # Apply date filters if provided
    if args.start_date:
        try:
            start_dt = datetime.fromisoformat(args.start_date)
            query = query.filter(PlatformUsageLog.created_at >= start_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid start_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    if args.end_date:
        try:
            end_dt = datetime.fromisoformat(args.end_date)
            query = query.filter(PlatformUsageLog.created_at <= end_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid end_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    logs = query.all()

    # Get all tenants for name lookup
    tenants = {t.id: t for t in ctx.db.query(PlatformTenant).all()}

    # Aggregate by tenant
    tenant_data: dict[int, dict[str, Any]] = {}
    for log in logs:
        if log.tenant_id not in tenant_data:
            tenant = tenants.get(log.tenant_id)
            tenant_data[log.tenant_id] = {
                "tenant_id": log.tenant_id,
                "tenant_slug": tenant.slug if tenant else "unknown",
                "tenant_name": tenant.name if tenant else "Unknown",
                "request_count": 0,
                "total_input_tokens": 0,
                "total_output_tokens": 0,
                "total_cost": Decimal("0"),
            }
        tenant_data[log.tenant_id]["request_count"] += 1
        tenant_data[log.tenant_id]["total_input_tokens"] += log.input_tokens
        tenant_data[log.tenant_id]["total_output_tokens"] += log.output_tokens
        tenant_data[log.tenant_id]["total_cost"] += (log.cost_input or Decimal("0")) + (log.cost_output or Decimal("0"))

    # Sort by request count descending
    tenants_list = sorted(tenant_data.values(), key=lambda x: x["request_count"], reverse=True)

    # Convert Decimal to string for JSON serialization
    for t in tenants_list:
        t["total_cost"] = str(t["total_cost"])

    return ToolResult(
        ok=True,
        summary=f"Found {len(tenants_list)} tenant(s) with usage data",
        data={
            "tenants": tenants_list,
            "period": {
                "start": args.start_date,
                "end": args.end_date,
            },
        },
    )


REGISTRY.register(ToolSpec(
    name="get_tenant_usage_breakdown",
    description="Obtiene el desglose de uso por tenant.",
    category="read",
    input_schema=GetTenantUsageBreakdownArgs,
    handler=_handle_get_tenant_usage_breakdown,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))


# ── export_usage_csv ───────────────────────────────────────────────────────────

class ExportUsageCsvArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start_date: str | None = Field(default=None, description="Start date in ISO format (YYYY-MM-DD)")
    end_date: str | None = Field(default=None, description="End date in ISO format (YYYY-MM-DD)")
    tenant_slug: str | None = Field(default=None, description="Filter by tenant slug")


def _handle_export_usage_csv(ctx: AgentContext, args: ExportUsageCsvArgs) -> ToolResult:
    """Export usage data as CSV."""
    query = ctx.db.query(PlatformUsageLog)

    # Apply date filters if provided
    if args.start_date:
        try:
            start_dt = datetime.fromisoformat(args.start_date)
            query = query.filter(PlatformUsageLog.created_at >= start_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid start_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    if args.end_date:
        try:
            end_dt = datetime.fromisoformat(args.end_date)
            query = query.filter(PlatformUsageLog.created_at <= end_dt)
        except ValueError:
            return ToolResult(
                ok=False,
                summary="Invalid end_date format. Use YYYY-MM-DD.",
                error="invalid_date",
            )

    # Apply tenant filter if provided
    if args.tenant_slug:
        tenant = ctx.db.query(PlatformTenant).filter(PlatformTenant.slug == args.tenant_slug).first()
        if not tenant:
            return ToolResult(
                ok=False,
                summary=f"Tenant '{args.tenant_slug}' not found",
                error="tenant_not_found",
            )
        query = query.filter(PlatformUsageLog.tenant_id == tenant.id)

    logs = query.order_by(PlatformUsageLog.created_at.desc()).all()

    # Get all tenants for name lookup
    tenants = {t.id: t for t in ctx.db.query(PlatformTenant).all()}

    # Generate CSV
    output = StringIO()
    output.write("timestamp,tenant_id,tenant_slug,agent_key,provider_id,input_tokens,output_tokens,cost_input,cost_output,total_cost\n")

    for log in logs:
        tenant = tenants.get(log.tenant_id)
        tenant_slug = tenant.slug if tenant else "unknown"
        total_cost = float((log.cost_input or Decimal("0")) + (log.cost_output or Decimal("0")))
        output.write(f"{log.created_at.isoformat()},{log.tenant_id},{tenant_slug},{log.agent_key},{log.provider_id or ''},{log.input_tokens},{log.output_tokens},{float(log.cost_input or 0):.6f},{float(log.cost_output or 0):.6f},{total_cost:.6f}\n")

    csv_data = output.getvalue()

    return ToolResult(
        ok=True,
        summary=f"Exported {len(logs)} usage records to CSV",
        data={
            "csv_data": csv_data,
            "record_count": len(logs),
            "period": {
                "start": args.start_date,
                "end": args.end_date,
            },
        },
    )


REGISTRY.register(ToolSpec(
    name="export_usage_csv",
    description="Exporta datos de uso en formato CSV.",
    category="read",
    input_schema=ExportUsageCsvArgs,
    handler=_handle_export_usage_csv,
    personas=frozenset({"super_admin"}),
    required_permission="agent.tool.infra",
))