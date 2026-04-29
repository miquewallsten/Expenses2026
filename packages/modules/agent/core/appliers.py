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
