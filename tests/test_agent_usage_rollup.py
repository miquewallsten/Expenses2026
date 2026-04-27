"""Phase 8.6 — agent usage rollup endpoint."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from packages.core.platform.models_user import User
from packages.modules.agent.models import AgentToolCall, AgentUsage


def _admin(db_session, test_company):
    u = User(
        full_name="Usage Admin", email="usage-admin@test.com",
        role="admin", company_id=test_company.id, is_active=True,
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _seed(db_session, company_id, *, n_ok=4, n_err=1, durations=None, tool_names=None):
    durations = durations or [100, 200, 300, 400, 500]
    for i, d in enumerate(durations):
        db_session.add(AgentUsage(
            company_id=company_id,
            session_id=f"s{i}",
            persona="admin",
            model="llama3.1:8b",
            provider="ollama",
            tool_count=2,
            iterations=1,
            duration_ms=d,
            ok=(i < n_ok),
        ))
    for name in (tool_names or ["finance_copilot.find_missing_receipts",
                                 "finance_copilot.find_missing_receipts",
                                 "rbac.list_users"]):
        db_session.add(AgentToolCall(
            company_id=company_id, persona="admin",
            tool_name=name, status="ok", duration_ms=50,
        ))
    db_session.commit()


def test_rollup_basic_aggregations(client, db_session, test_company):
    admin = _admin(db_session, test_company)
    _seed(db_session, test_company.id)
    res = client.get(
        f"/agent/usage/{test_company.id}/rollup",
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["company_id"] == test_company.id
    assert body["total_calls"] == 5
    assert body["total_tool_calls"] == 10
    assert body["ok_rate"] == pytest.approx(0.8)
    assert body["p50_latency_ms"] >= 200
    assert body["p95_latency_ms"] >= 400
    assert any(m["model"] == "llama3.1:8b" for m in body["by_model"])
    assert any(p["persona"] == "admin" for p in body["by_persona"])
    top = body["tool_breakdown"][0]
    assert top["tool_name"] == "finance_copilot.find_missing_receipts"
    assert top["count"] == 2


def test_rollup_empty_company_returns_zeros(client, db_session, test_company):
    admin = _admin(db_session, test_company)
    res = client.get(
        f"/agent/usage/{test_company.id}/rollup",
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["total_calls"] == 0
    assert body["ok_rate"] == 0.0
    assert body["p50_latency_ms"] == 0
    assert body["tool_breakdown"] == []


def test_rollup_window_excludes_old_rows(client, db_session, test_company):
    admin = _admin(db_session, test_company)
    _seed(db_session, test_company.id, durations=[100, 200])
    # Push existing rows back 60 days.
    db_session.query(AgentUsage).filter(
        AgentUsage.company_id == test_company.id
    ).update({"created_at": datetime.utcnow() - timedelta(days=60)})
    db_session.query(AgentToolCall).filter(
        AgentToolCall.company_id == test_company.id
    ).update({"created_at": datetime.utcnow() - timedelta(days=60)})
    db_session.commit()
    res = client.get(
        f"/agent/usage/{test_company.id}/rollup?days=30",
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.json()["total_calls"] == 0


def test_rollup_forbidden_for_employee(client, test_user, test_company):
    res = client.get(
        f"/agent/usage/{test_company.id}/rollup",
        headers={"X-User-Id": str(test_user.id)},
    )
    assert res.status_code == 403


def test_rollup_cross_company_blocked(client, db_session, test_company):
    from packages.core.platform.models import Company
    other = Company(name="Other", slug="other-rollup")
    db_session.add(other)
    db_session.commit()
    admin = _admin(db_session, test_company)
    res = client.get(
        f"/agent/usage/{other.id}/rollup",
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.status_code == 403
