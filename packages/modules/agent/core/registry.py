"""Typed tool registry for the unified Agent.

A ``ToolSpec`` binds four things together:
    * a unique ``name`` (used in the LLM tool-call protocol),
    * a Pydantic input schema (validated before the handler runs),
    * a handler callable that receives ``(AgentContext, validated_args)``,
    * a set of allowed personas and a ``destructive`` flag.

The registry is populated at import time. Tools are grouped into the
``packages.modules.agent.tools.*`` submodules; each submodule registers its
specs on import via ``REGISTRY.register(ToolSpec(...))``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable

from pydantic import BaseModel, ValidationError

from .context import AgentContext, Persona


ToolHandler = Callable[[AgentContext, BaseModel], "ToolResult"]


@dataclass
class ToolResult:
    """What a tool handler returns.

    ``summary`` is always safe to show the admin and to feed back to the LLM.
    ``receipt_id`` is set when a destructive tool produced a pending action
    that still needs human confirmation.
    """
    ok: bool
    summary: str
    data: dict[str, Any] = field(default_factory=dict)
    receipt_id: str | None = None
    error: str | None = None


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    category: str  # config | entity | ingestion | diagnostic | read | infra
    input_schema: type[BaseModel]
    handler: ToolHandler
    personas: frozenset[Persona]
    destructive: bool = False
    requires_confirmation: bool = False
    # Phase 8.4 — fine-grained permission gate evaluated AFTER persona check.
    # When set, dispatch consults ``_role_has_permission`` and audits denials.
    required_permission: str | None = None
    # Phase 9 — module gate: if set, the company must have this module enabled.
    required_module: str | None = None

    def to_ollama_tool(self) -> dict[str, Any]:
        """Emit an OpenAI-compatible tool dict for ``chat_with_tools``."""
        return {
            "type": "function",
            "function": {
                "name":        self.name,
                "description": self.description,
                "parameters":  self.input_schema.model_json_schema(),
            },
        }


class _Registry:
    def __init__(self) -> None:
        self._specs: dict[str, ToolSpec] = {}

    def register(self, spec: ToolSpec) -> None:
        if spec.name in self._specs:
            raise RuntimeError(f"Duplicate tool registration: {spec.name}")
        self._specs[spec.name] = spec

    def get(self, name: str) -> ToolSpec | None:
        return self._specs.get(name)

    def list_for_persona(self, persona: Persona) -> list[ToolSpec]:
        return [s for s in self._specs.values() if persona in s.personas]

    def to_ollama_tools(self, persona: Persona) -> list[dict[str, Any]]:
        return [s.to_ollama_tool() for s in self.list_for_persona(persona)]

    def dispatch(self, name: str, raw_args: dict[str, Any], ctx: AgentContext) -> ToolResult:
        """Validate args against the Pydantic schema, authorize by persona, run.

        Errors are returned as structured ``ToolResult(ok=False, ...)`` so the
        agent loop can feed the message back to the LLM for self-correction.
        """
        spec = self._specs.get(name)
        if spec is None:
            return ToolResult(ok=False, summary=f"unknown tool: {name}", error="unknown_tool")

        # Permission check: if allowed_tools is set, enforce it strictly.
        # When None, fall back to persona-based check (legacy behavior).
        allowed_tools = getattr(ctx, 'allowed_tools', None)
        if allowed_tools is not None:
            if name not in allowed_tools:
                return ToolResult(
                    ok=False,
                    summary=f"Tool '{name}' is not available to this agent",
                    error="permission_denied",
                )
        else:
            # Legacy: use persona-based tool filtering
            if ctx.persona not in spec.personas:
                return ToolResult(
                    ok=False,
                    summary=f"tool {name} is not available for persona {ctx.persona}",
                    error="forbidden",
                )

        # Phase 8.4 — fine-grained permission gate (post-persona).
        if spec.required_permission and not _role_has_permission(
            ctx.user_role, spec.required_permission,
            db=ctx.db, company_id=ctx.company_id,
        ):
            try:
                from packages.core.platform.service_audit import log_event

                log_event(
                    ctx.db,
                    entity_type="agent.tool",
                    entity_id=ctx.user_id,
                    action="tool.denied",
                    actor_user_id=ctx.user_id,
                    detail_text=f"tool={name} permission={spec.required_permission} role={ctx.user_role}",
                    company_id=ctx.company_id,
                )
            except Exception:  # noqa: BLE001 — audit must never block dispatch.
                ctx.db.rollback()
            return ToolResult(
                ok=False,
                summary=f"tool {name} requires permission {spec.required_permission}",
                error="forbidden",
            )

        # Phase 9 — module gate: verify the company has the required add-on enabled.
        if spec.required_module:
            from packages.core.platform.models_company_setup import CompanySetup
            setup = ctx.db.query(CompanySetup).filter(CompanySetup.company_id == ctx.company_id).first()
            flag_map = {
                "archive": "archive_module_enabled",
                "time_allocation": "time_allocation_module_enabled",
                "purchase_requests": "purchase_requests_module_enabled",
                "amex_reconciliation": "amex_reconciliation_module_enabled",
                "subcontractor": "subcontractor_module_enabled",
            }
            flag = flag_map.get(spec.required_module)
            if flag and (not setup or not getattr(setup, flag, False)):
                return ToolResult(
                    ok=False,
                    summary=f"Module '{spec.required_module}' is not enabled for this company",
                    error="module_not_installed",
                )

        # Strip any LLM-supplied company_id; the engine controls tenancy.
        safe_args = {k: v for k, v in raw_args.items() if k != "company_id"}

        try:
            validated = spec.input_schema(**safe_args)
        except ValidationError as exc:
            return ToolResult(
                ok=False,
                summary=f"invalid arguments for {name}",
                error=exc.json(include_url=False, include_context=False),
            )

        try:
            return spec.handler(ctx, validated)
        except Exception as exc:  # noqa: BLE001 — we deliberately surface all tool failures to the LLM
            return ToolResult(ok=False, summary=f"{name} failed: {exc}", error=str(exc))


REGISTRY = _Registry()


# ── Phase 8.4 — fine-grained permission gate ──────────────────────────────────
#
# Layer ON TOP of persona-based access. Personas already keep employees out of
# admin tools; this gate lets us partition admin further (e.g. only "admin"
# role gets `agent.tool.rbac`, but a future "operations" role with the
# admin persona would not). The map is intentionally tiny; expand with
# ``register_role_permissions`` as Phase 2.3's RBAC table grows.
_ROLE_PERMISSIONS: dict[str, set[str]] = {
    # role → granted permission keys
    "admin": {
        "agent.tool.rbac",
        "agent.tool.config",
        "agent.tool.settings",
        "agent.tool.ai_policy",
        "agent.tool.infra",
        "agent.tool.finance_copilot",
        "agent.tool.admin",
    },
    "accounting": {
        "agent.tool.finance_copilot",
    },
}


def register_role_permissions(role: str, perms: set[str]) -> None:
    """Add (or extend) the permission set for *role* — call from migrations or
    a settings boot hook once Phase 2.3's permission table lands."""
    _ROLE_PERMISSIONS.setdefault(role, set()).update(perms)


def _role_has_permission(role: str, permission: str, db=None, company_id: int | None = None) -> bool:
    """Check if a role has a specific permission.

    When db and company_id are provided, uses the DB-backed service_permissions
    which resolves built-in role defaults + custom Role/RolePermission rows.
    Falls back to the hardcoded _ROLE_PERMISSIONS dict otherwise.
    """
    if db is not None and company_id is not None:
        try:
            from packages.core.platform.service_permissions import has_permission as svc_has_permission
            class _FakeUser:
                def __init__(self, role, company_id, is_super_admin=False):
                    self.role = role
                    self.company_id = company_id
                    self.is_super_admin = is_super_admin
            fake = _FakeUser(role=role, company_id=company_id, is_super_admin=(role == "super_admin"))
            try:
                return svc_has_permission(db, fake, permission)
            except ValueError:
                pass  # Unknown key in catalog, fall through to hardcoded
        except ImportError:
            pass
    return permission in _ROLE_PERMISSIONS.get(role or "", set())
