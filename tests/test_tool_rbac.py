"""Phase 8.4 — fine-grained permission gate on tool dispatch."""
from __future__ import annotations

import pytest
from pydantic import BaseModel

from packages.core.platform.models_audit import AuditLog
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import (
    REGISTRY,
    ToolResult,
    ToolSpec,
    register_role_permissions,
)


class _NoArgs(BaseModel):
    pass


def _ok_handler(ctx: AgentContext, args: _NoArgs) -> ToolResult:
    return ToolResult(ok=True, summary="ran", data={})


@pytest.fixture
def perm_gated_tool():
    name = "test.gated_tool"
    spec = ToolSpec(
        name=name,
        description="test tool gated by required_permission",
        category="diagnostic",
        input_schema=_NoArgs,
        handler=_ok_handler,
        personas=frozenset({"admin", "finance_manager"}),
        required_permission="agent.tool.test_gate",
    )
    REGISTRY.register(spec)
    yield name
    # Reach into registry internals to clean up — keeps the test isolated.
    REGISTRY._specs.pop(name, None)  # type: ignore[attr-defined]


def _ctx(db_session, test_company, *, persona, role, user_id=42):
    return AgentContext(
        db=db_session,
        company_id=test_company.id,
        user_id=user_id,
        user_email="x@example.com",
        user_role=role,
        persona=persona,
    )


def test_persona_block_takes_precedence_over_permission(
    db_session, test_company, perm_gated_tool
):
    ctx = _ctx(db_session, test_company, persona="employee", role="employee")
    res = REGISTRY.dispatch(perm_gated_tool, {}, ctx)
    assert res.ok is False
    assert res.error == "forbidden"
    assert "persona" in res.summary


def test_permission_denied_after_persona_passes(
    db_session, test_company, perm_gated_tool
):
    # admin persona but role has no agent.tool.test_gate permission.
    ctx = _ctx(db_session, test_company, persona="admin", role="employee")
    res = REGISTRY.dispatch(perm_gated_tool, {}, ctx)
    assert res.ok is False
    assert res.error == "forbidden"
    assert "permission" in res.summary

    # An audit row was written.
    rows = (
        db_session.query(AuditLog)
        .filter(AuditLog.action == "tool.denied")
        .all()
    )
    assert any("test.gated_tool" in (r.detail_text or "") for r in rows)


def test_permission_granted_runs_handler(
    db_session, test_company, perm_gated_tool
):
    register_role_permissions("admin", {"agent.tool.test_gate"})
    ctx = _ctx(db_session, test_company, persona="admin", role="admin")
    res = REGISTRY.dispatch(perm_gated_tool, {}, ctx)
    assert res.ok is True
    assert res.summary == "ran"


def test_no_required_permission_does_not_audit(
    db_session, test_company
):
    name = "test.open_tool"
    REGISTRY.register(ToolSpec(
        name=name, description="open", category="diagnostic",
        input_schema=_NoArgs, handler=_ok_handler,
        personas=frozenset({"employee"}),
    ))
    try:
        ctx = _ctx(db_session, test_company, persona="employee", role="employee")
        res = REGISTRY.dispatch(name, {}, ctx)
        assert res.ok is True
        denials = (
            db_session.query(AuditLog)
            .filter(AuditLog.action == "tool.denied")
            .filter(AuditLog.detail_text.like(f"%{name}%"))
            .count()
        )
        assert denials == 0
    finally:
        REGISTRY._specs.pop(name, None)  # type: ignore[attr-defined]
