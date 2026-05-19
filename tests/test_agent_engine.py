"""Tests for the unified AI agent engine.

We mock ``chat_with_tools`` so we can exercise the engine loop, registry
dispatch, receipt lifecycle and tenant isolation without touching Ollama.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from packages.core.platform.models import Company
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.models_user import User

from packages.modules.agent.core.engine import run_turn
from packages.modules.agent.core.receipts import get_receipt
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.models import (
    AgentPendingAction,
    AgentSession,
    AgentToolCall,
)
from packages.modules.agent.tools import registry_all  # noqa: F401 — register tools
from packages.modules.agent.tools.config_patch import APPLIERS


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_user(db_session, test_company):
    u = User(full_name="Admin", email="admin@test.com", role="admin", company_id=test_company.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def other_company(db_session):
    c = Company(name="Other", slug="other-co")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


# ── Helpers ─────────────────────────────────────────────────────────────────

def _mock_llm_final(text: str):
    """chat_with_tools mock that just returns a final assistant message."""
    return lambda **kwargs: {"ok": True, "model": "mock", "content": text, "error": None}


def _mock_llm_tool_then_final(tool_name: str, args: dict, final_text: str):
    """chat_with_tools mock that invokes ``tool_executor`` once then returns text."""
    def impl(*, system_prompt, user_prompt, tools, tool_executor, **_):
        out = tool_executor(tool_name, args)
        return {"ok": True, "model": "mock", "content": f"{final_text}|tool_result={out}", "error": None}
    return impl


# ── Tests ───────────────────────────────────────────────────────────────────

def test_registry_has_expected_tools():
    names = {t.name for t in REGISTRY.list_for_persona("admin")}
    assert {
        "update_company_setup", "update_expense_policy", "update_accounting_setup",
        "read_company_setup", "read_expense_policy", "read_accounting_setup",
        "list_accounting_categories", "expense_counts_by_status", "list_users",
        "diagnose_config", "diagnose_expense", "trace_workflow",
    }.issubset(names)


def test_registry_only_admin_and_accounting_personas():
    """Employee/manager/super_admin personas removed — only admin & accounting."""
    admin_names = {t.name for t in REGISTRY.list_for_persona("admin")}
    acct_names = {t.name for t in REGISTRY.list_for_persona("accounting")}
    assert "update_company_setup" in admin_names
    assert "list_users" in admin_names
    assert "read_expense_policy" in admin_names
    assert "accounting_health_check" in acct_names
    # Removed personas should return empty
    assert len(list(REGISTRY.list_for_persona("employee"))) == 0
    assert len(list(REGISTRY.list_for_persona("super_admin"))) == 0


def test_run_turn_creates_session_and_persists_turns(db_session, admin_user, test_company):
    with patch(
        "packages.modules.agent.core.engine.chat_with_tools",
        side_effect=_mock_llm_final("¡Hola!"),
    ):
        out = run_turn(
            db=db_session,
            user=admin_user,
            company_id=test_company.id,
            persona="admin",
            user_message="Hola",
        )

    assert out["ok"] is True
    assert out["content"] == "¡Hola!"
    assert out["session_id"]

    row = db_session.query(AgentSession).filter_by(session_id=out["session_id"]).one()
    turns = json.loads(row.turns)
    assert turns == [{"role": "user", "content": "Hola"}, {"role": "assistant", "content": "¡Hola!"}]


def test_run_turn_cross_company_session_rejected(db_session, admin_user, test_company, other_company):
    # First turn creates a session for test_company.
    with patch("packages.modules.agent.core.engine.chat_with_tools", side_effect=_mock_llm_final("ok")):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="hi",
        )
    sid = out["session_id"]

    # Impersonate a user from other_company and try to continue that session.
    intruder = User(full_name="X", email="x@o.com", role="admin", company_id=other_company.id)
    db_session.add(intruder)
    db_session.commit()

    with patch("packages.modules.agent.core.engine.chat_with_tools", side_effect=_mock_llm_final("no")):
        out2 = run_turn(
            db=db_session, user=intruder, company_id=other_company.id,
            persona="admin", user_message="hi", session_id=sid,
        )
    # The cross-company session_id is silently ignored — a fresh session is
    # created in the intruder's own tenant, never appending to the victim's.
    assert out2["ok"] is True
    assert out2["session_id"] != sid
    original = db_session.query(AgentSession).filter_by(session_id=sid).one()
    assert original.company_id == test_company.id
    assert len(json.loads(original.turns)) == 2  # unchanged


def test_read_tool_roundtrip_writes_audit(db_session, admin_user, test_company):
    # Seed a CompanySetup so read_company_setup has data.
    cs = CompanySetup(company_id=test_company.id, display_name="Acme", base_currency="MXN")
    db_session.add(cs)
    db_session.commit()

    with patch(
        "packages.modules.agent.core.engine.chat_with_tools",
        side_effect=_mock_llm_tool_then_final("read_company_setup", {}, "done"),
    ):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="Lee la empresa",
        )

    assert out["ok"]
    assert len(out["tool_calls"]) == 1
    assert out["tool_calls"][0]["tool"] == "read_company_setup"
    assert out["tool_calls"][0]["status"] == "ok"

    audit_rows = db_session.query(AgentToolCall).filter_by(company_id=test_company.id).all()
    assert len(audit_rows) == 1
    assert audit_rows[0].tool_name == "read_company_setup"
    assert audit_rows[0].status == "ok"


def test_destructive_tool_creates_receipt_then_apply_writes(db_session, admin_user, test_company):
    # Ensure a CompanySetup row exists so we can compute a diff.
    cs = CompanySetup(company_id=test_company.id, display_name="Old", base_currency="USD")
    db_session.add(cs)
    db_session.commit()

    new_args = {"display_name": "New", "base_currency": "MXN"}

    with patch(
        "packages.modules.agent.core.engine.chat_with_tools",
        side_effect=_mock_llm_tool_then_final("update_company_setup", new_args, "listo"),
    ):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="Cambia la empresa",
        )

    assert out["ok"]
    assert len(out["pending"]) == 1
    receipt_id = out["pending"][0]["receipt_id"]

    # Before confirm: database unchanged.
    db_session.expire_all()
    cs_before = db_session.query(CompanySetup).filter_by(company_id=test_company.id).one()
    assert cs_before.display_name == "Old"
    assert cs_before.base_currency == "USD"

    row = db_session.query(AgentPendingAction).filter_by(receipt_id=receipt_id).one()
    assert row.status == "pending"

    # Apply via the router's dispatch table (same function the /agent/confirm route uses).
    from packages.modules.agent.core.context import AgentContext
    ctx = AgentContext(
        db=db_session, company_id=test_company.id, user_id=admin_user.id,
        user_email=admin_user.email, user_role=admin_user.role, persona="admin",
    )
    applier = APPLIERS[row.tool_name]
    result = applier(ctx, json.loads(row.args))
    assert result["count"] == 2

    db_session.expire_all()
    cs_after = db_session.query(CompanySetup).filter_by(company_id=test_company.id).one()
    assert cs_after.display_name == "New"
    assert cs_after.base_currency == "MXN"


def test_tool_dispatch_strips_company_id_from_llm_args(db_session, admin_user, test_company, other_company):
    """An LLM-supplied ``company_id`` must be ignored; tenant comes from the context."""
    # Seed CompanySetup for BOTH companies so we can tell which one is read.
    db_session.add(CompanySetup(company_id=test_company.id,  display_name="MINE"))
    db_session.add(CompanySetup(company_id=other_company.id, display_name="OTHER"))
    db_session.commit()

    def _llm(*, tool_executor, **_):
        out = tool_executor("read_company_setup", {"company_id": other_company.id})
        return {"ok": True, "model": "mock", "content": f"r={out}", "error": None}

    with patch("packages.modules.agent.core.engine.chat_with_tools", side_effect=_llm):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="lee",
        )

    assert "MINE" in out["content"]
    assert "OTHER" not in out["content"]


def test_unknown_tool_returns_structured_error_not_crash(db_session, admin_user, test_company):
    def _llm(*, tool_executor, **_):
        out = tool_executor("does_not_exist", {})
        payload = json.loads(out)
        assert payload["ok"] is False
        assert "unknown" in payload["summary"]
        return {"ok": True, "model": "mock", "content": "recovered", "error": None}

    with patch("packages.modules.agent.core.engine.chat_with_tools", side_effect=_llm):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="x",
        )
    assert out["ok"]
    assert out["content"] == "recovered"


def test_persona_enforcement_blocks_admin_tool_for_employee(db_session, test_user, test_company):
    def _llm(*, tool_executor, **_):
        out = tool_executor("update_company_setup", {"display_name": "hack"})
        payload = json.loads(out)
        assert payload["ok"] is False
        assert payload["error"] == "forbidden"
        return {"ok": True, "model": "mock", "content": "blocked", "error": None}

    with patch("packages.modules.agent.core.engine.chat_with_tools", side_effect=_llm):
        out = run_turn(
            db=db_session, user=test_user, company_id=test_company.id,
            persona="employee", user_message="hack",
        )
    assert out["ok"]
    # And no receipt was created.
    assert db_session.query(AgentPendingAction).count() == 0


def test_rbac_assign_user_role_receipt_flow(db_session, admin_user, test_company):
    """End-to-end destructive-tool flow via the central applier registry."""
    from packages.core.platform.models_role import Role
    from packages.core.platform.models_user_role import UserRole
    from packages.modules.agent.core.appliers import get_applier
    from packages.modules.agent.core.context import AgentContext

    role = Role(company_id=test_company.id, key="finance_admin", name="Finance Admin")
    db_session.add(role)
    db_session.commit()
    db_session.refresh(role)

    args = {"user_id": admin_user.id, "role_key": "finance_admin"}
    with patch(
        "packages.modules.agent.core.engine.chat_with_tools",
        side_effect=_mock_llm_tool_then_final("assign_user_role", args, "ok"),
    ):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="asigna rol",
        )

    assert out["ok"]
    assert len(out["pending"]) == 1

    # No UserRole yet.
    assert db_session.query(UserRole).count() == 0

    # Apply through the central registry (what /agent/confirm uses).
    pending = db_session.query(AgentPendingAction).filter_by(
        receipt_id=out["pending"][0]["receipt_id"],
    ).one()
    ctx = AgentContext(
        db=db_session, company_id=test_company.id, user_id=admin_user.id,
        user_email=admin_user.email, user_role=admin_user.role, persona="admin",
    )
    applier = get_applier(pending.tool_name)
    assert applier is not None
    result = applier(ctx, json.loads(pending.args))
    assert result["assigned"] is True

    rows = db_session.query(UserRole).filter_by(user_id=admin_user.id, role_id=role.id).all()
    assert len(rows) == 1


def test_upsert_cost_center_receipt_flow(db_session, admin_user, test_company):
    from packages.core.platform.models_cost_center import CostCenter
    from packages.modules.agent.core.appliers import get_applier
    from packages.modules.agent.core.context import AgentContext

    args = {"code": "CC-100", "name": "Ventas"}
    with patch(
        "packages.modules.agent.core.engine.chat_with_tools",
        side_effect=_mock_llm_tool_then_final("upsert_cost_center", args, "ok"),
    ):
        out = run_turn(
            db=db_session, user=admin_user, company_id=test_company.id,
            persona="admin", user_message="crea CC",
        )

    assert out["ok"]
    assert len(out["pending"]) == 1

    # Nothing persisted yet.
    assert db_session.query(CostCenter).count() == 0

    pending = db_session.query(AgentPendingAction).filter_by(
        receipt_id=out["pending"][0]["receipt_id"],
    ).one()
    ctx = AgentContext(
        db=db_session, company_id=test_company.id, user_id=admin_user.id,
        user_email=admin_user.email, user_role=admin_user.role, persona="admin",
    )
    applier = get_applier(pending.tool_name)
    assert applier is not None
    result = applier(ctx, json.loads(pending.args))
    assert result["created"] is True
    assert result["code"] == "CC-100"
    assert result["name"] == "Ventas"

    row = db_session.query(CostCenter).filter_by(company_id=test_company.id, code="CC-100").one()
    assert row.name == "Ventas"
    assert row.status == "active"

