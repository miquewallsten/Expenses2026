"""Central registry of "appliers" — the second phase of each destructive tool.

Destructive tools register both a live handler (phase 1, creates a receipt)
and an applier callable keyed by tool_name here. The HTTP router's
``/agent/confirm`` looks the applier up by tool_name and invokes it with the
stored args.

Each applier is:
    Callable[[AgentContext, dict[str, Any]], dict[str, Any]]
and returns a JSON-serialisable result dict.
"""

from __future__ import annotations

from typing import Any, Callable

from .context import AgentContext


Applier = Callable[[AgentContext, dict[str, Any]], dict[str, Any]]


_APPLIERS: dict[str, Applier] = {}


def register_applier(tool_name: str, fn: Applier) -> None:
    if tool_name in _APPLIERS:
        raise RuntimeError(f"duplicate applier: {tool_name}")
    _APPLIERS[tool_name] = fn


def get_applier(tool_name: str) -> Applier | None:
    return _APPLIERS.get(tool_name)


def all_appliers() -> dict[str, Applier]:
    return dict(_APPLIERS)


# ── Expense operations appliers ───────────────────────────────────────────────
# Imported here to avoid circular deps; registration runs at module load time.
from packages.modules.agent.tools.expense_ops import _apply_approve, _apply_reject  # noqa: E402

register_applier("approve_expense", _apply_approve)
register_applier("reject_expense", _apply_reject)

from packages.modules.agent.tools.work.bulk_ops import apply_bulk_update  # noqa: E402
register_applier("bulk_update_expenses", apply_bulk_update)

# ── User management appliers ──────────────────────────────────────────────────
from packages.modules.agent.tools.admin_tools import _apply_deactivate_user, _apply_reactivate_user  # noqa: E402

register_applier("deactivate_user", _apply_deactivate_user)
register_applier("reactivate_user", _apply_reactivate_user)

# ── RBAC management appliers ──────────────────────────────────────────────────
from packages.modules.agent.tools.admin_tools import (  # noqa: E402
    _apply_create_role,
    _apply_assign_permission_to_role,
    _apply_assign_role_to_user,
    _apply_remove_permission_from_role,
)

register_applier("create_role", _apply_create_role)
register_applier("assign_permission_to_role", _apply_assign_permission_to_role)
register_applier("assign_role_to_user", _apply_assign_role_to_user)
register_applier("remove_permission_from_role", _apply_remove_permission_from_role)

# ── Tenant management appliers ────────────────────────────────────────────────
from packages.modules.agent.tools.platform.tenant_tools import _apply_suspend_tenant  # noqa: E402

register_applier("suspend_tenant", _apply_suspend_tenant)
