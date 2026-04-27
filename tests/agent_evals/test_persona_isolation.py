"""Phase 8.7 — persona isolation goldens.

Verifies that tools registered under restricted persona sets reject calls
from other personas with a structured ``forbidden`` error, and that
permitted personas pass the persona gate (validation may still fail for
missing args — which is fine, we only care about the gate).
"""

from __future__ import annotations

import pytest

from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.tools import registry_all  # noqa: F401


def _ctx(db_session, *, persona: str, role: str = "admin", company_id: int = 1, user_id: int = 1):
    return AgentContext(
        db=db_session, company_id=company_id, user_id=user_id,
        user_email="t@test.com", user_role=role, persona=persona,  # type: ignore[arg-type]
    )


# ── Employee is blocked from admin/finance tools ────────────────────────────

_ADMIN_TOOLS = [
    "rbac_list_users",
    "list_ai_policies",
    "create_ai_policy",
    "read_storage_config",
    "find_missing_receipts",   # finance-only
    "match_cfdis_batch",       # finance-only
    "run_month_end",           # finance-only
]


@pytest.mark.parametrize("tool_name", _ADMIN_TOOLS)
def test_employee_persona_cannot_call_restricted_tool(db_session, test_company, tool_name):
    spec = REGISTRY.get(tool_name)
    if spec is None:
        pytest.skip(f"tool {tool_name} not registered")
    if "employee" in spec.personas:
        pytest.skip(f"{tool_name} is intentionally open to employees")
    ctx = _ctx(db_session, persona="employee", role="employee",
               company_id=test_company.id)
    res = REGISTRY.dispatch(tool_name, {}, ctx)
    assert res.ok is False
    assert res.error == "forbidden"


# ── Finance copilot tools allow admin + finance_manager only ────────────────

_FINANCE_TOOLS = [
    "find_missing_receipts",
    "match_cfdis_batch",
    "generate_poliza_preview",
    "run_month_end",
]


@pytest.mark.parametrize("tool_name", _FINANCE_TOOLS)
def test_procurement_blocked_from_finance_tools(db_session, test_company, tool_name):
    spec = REGISTRY.get(tool_name)
    if spec is None:
        pytest.skip(f"tool {tool_name} not registered")
    ctx = _ctx(db_session, persona="procurement", role="employee",
               company_id=test_company.id)
    res = REGISTRY.dispatch(tool_name, {}, ctx)
    assert res.ok is False
    assert res.error == "forbidden"


@pytest.mark.parametrize("tool_name", _FINANCE_TOOLS)
def test_finance_manager_passes_persona_gate(db_session, test_company, tool_name):
    spec = REGISTRY.get(tool_name)
    if spec is None:
        pytest.skip(f"tool {tool_name} not registered")
    ctx = _ctx(db_session, persona="finance_manager", role="finance_manager",
               company_id=test_company.id)
    res = REGISTRY.dispatch(tool_name, {}, ctx)
    # Persona gate is the only thing under test — handler may return ok=True
    # (empty results) or ok=False with a non-"forbidden" error (validation,
    # missing data). What we forbid is a "forbidden" error here.
    assert res.error != "forbidden"


# ── Unknown tool is rejected without crashing ───────────────────────────────


def test_unknown_tool_returns_structured_error(db_session, test_company):
    ctx = _ctx(db_session, persona="admin", company_id=test_company.id)
    res = REGISTRY.dispatch("not_a_real_tool_zzz", {}, ctx)
    assert res.ok is False
    assert res.error == "unknown_tool"
