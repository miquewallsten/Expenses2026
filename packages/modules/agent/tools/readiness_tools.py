"""Readiness tools — let the agent check whether a tenant is ready to use
enabled modules and explain what's missing.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.service.tenant_validator import VALIDATOR

from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ModuleKeyArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    module_key: str = Field(..., min_length=1, max_length=50)


# ── check_tenant_readiness ──────────────────────────────────────────────────

def _check_tenant_readiness(ctx: AgentContext, _: Empty) -> ToolResult:
    report = VALIDATOR.validate_company(ctx.db, ctx.company_id)

    if report.ok:
        return ToolResult(
            ok=True,
            summary="La empresa está lista para operar. Todos los módulos habilitados tienen su configuración completa.",
            data={"ok": True, "modules_ready": [m.module for m in report.modules if m.ok]},
        )

    lines: list[str] = []
    for g in report.blockers:
        step = f" (paso: {g.wizard_step})" if g.wizard_step else ""
        lines.append(f"- {g.message}{step}")

    summary = (
        f"Faltan {len(report.blockers)} configuraciones para que la empresa pueda operar:\n"
        + "\n".join(lines)
    )

    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "ok": False,
            "blockers": [
                {
                    "module": g.module,
                    "kind": g.kind,
                    "message": g.message,
                    "wizard_step": g.wizard_step,
                }
                for g in report.blockers
            ],
        },
    )


REGISTRY.register(ToolSpec(
    name="check_tenant_readiness",
    description="Verifica si la empresa tiene toda la configuración necesaria para los módulos habilitados. Devuelve una lista de lo que falta si no está lista.",
    category="diagnostic",
    input_schema=Empty,
    handler=_check_tenant_readiness,
    personas=frozenset({"admin"}),
))


# ── explain_module_requirements ─────────────────────────────────────────────

def _explain_module_requirements(ctx: AgentContext, args: ModuleKeyArgs) -> ToolResult:
    mod = VALIDATOR.validate_module(ctx.db, ctx.company_id, args.module_key)

    if not mod.enabled:
        return ToolResult(
            ok=True,
            summary=f"El módulo '{args.module_key}' no está habilitado.",
            data={"enabled": False},
        )

    if mod.ok:
        return ToolResult(
            ok=True,
            summary=f"El módulo '{args.module_key}' está configurado correctamente.",
            data={"enabled": True, "ok": True, "gaps": []},
        )

    lines = [f"El módulo '{args.module_key}' necesita:"]
    for g in mod.gaps:
        step = f" (paso del asistente: {g.wizard_step})" if g.wizard_step else ""
        lines.append(f"  - {g.message}{step}")

    return ToolResult(
        ok=True,
        summary="\n".join(lines),
        data={
            "enabled": True,
            "ok": False,
            "gaps": [
                {"kind": g.kind, "target": g.target, "message": g.message, "wizard_step": g.wizard_step}
                for g in mod.gaps
            ],
        },
    )


REGISTRY.register(ToolSpec(
    name="explain_module_requirements",
    description="Explica qué configuración falta para un módulo específico (por ejemplo, 'expenses').",
    category="diagnostic",
    input_schema=ModuleKeyArgs,
    handler=_explain_module_requirements,
    personas=frozenset({"admin"}),
))


# ── suggest_next_configuration_step ─────────────────────────────────────────

def _suggest_next_configuration_step(ctx: AgentContext, _: Empty) -> ToolResult:
    report = VALIDATOR.validate_company(ctx.db, ctx.company_id)

    if report.ok:
        return ToolResult(
            ok=True,
            summary="La empresa está completamente configurada. No hay pasos pendientes.",
            data={"ok": True, "suggestion": None},
        )

    # Pick the highest-priority blocker.
    # Priority: company setup > legal entities > chart of accounts > approval policy > users
    priority_order = ["company", "legal_entities", "chart_of_accounts", "approval_policy", "users"]
    best = None
    for g in report.blockers:
        step = g.wizard_step or g.module
        if best is None:
            best = g
            continue
        try:
            if priority_order.index(step) < priority_order.index(best.wizard_step or best.module):
                best = g
        except ValueError:
            pass

    if best is None:
        best = report.blockers[0]

    step_name = best.wizard_step or best.module
    summary = (
        f"Siguiente paso recomendado: configura '{step_name}'.\n"
        f"Razón: {best.message}"
    )

    return ToolResult(
        ok=True,
        summary=summary,
        data={
            "ok": False,
            "suggestion": {
                "wizard_step": best.wizard_step,
                "module": best.module,
                "message": best.message,
            },
        },
    )


REGISTRY.register(ToolSpec(
    name="suggest_next_configuration_step",
    description="Sugiere el siguiente paso de configuración más importante para la empresa.",
    category="diagnostic",
    input_schema=Empty,
    handler=_suggest_next_configuration_step,
    personas=frozenset({"admin"}),
))
