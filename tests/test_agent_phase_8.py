"""Tests for agent memory + insights + creative tools + search."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.api.db import Base
from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.core.platform.models_workflow_stage import WorkflowStage
from packages.core.platform.models_workflow_transition import WorkflowTransition
from packages.core.platform.models_cost_center import CostCenter
from packages.modules.expenses.models.expense import Expense

from packages.modules.agent.core import memory as memory_api
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.core.registry import REGISTRY
from packages.modules.agent.core.appliers import get_applier
from packages.modules.agent.insights import run_scanners
from packages.modules.agent.models import AgentMemory, AgentPendingAction
from packages.modules.agent.tools import registry_all  # noqa: F401


@pytest.fixture()
def db_session():
    # Import conftest triggers all model imports already; here we just spin
    # up our own isolated in-memory engine.
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    s = Session()
    company = Company(id=1, name="Acme", slug="acme")
    s.add(company)
    s.add(User(id=1, email="admin@acme.com", full_name="Admin", company_id=1, role="admin"))
    s.commit()
    yield s
    s.close()


@pytest.fixture()
def ctx(db_session):
    user = db_session.query(User).filter(User.id == 1).one()
    return AgentContext(
        db=db_session,
        company_id=1,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        persona="admin",
        session_id="test-session",
    )


# ── memory ──────────────────────────────────────────────────────────────────

def test_memory_roundtrip(db_session):
    memory_api.remember(db_session, company_id=1, key="policy", value={"note": "OK"})
    assert memory_api.recall(db_session, company_id=1, key="policy") == {"note": "OK"}
    rows = memory_api.list_memories(db_session, company_id=1)
    assert len(rows) == 1 and rows[0].kind == "fact"
    memory_api.forget(db_session, company_id=1, key="policy")
    assert memory_api.recall(db_session, company_id=1, key="policy") is None


def test_memory_upsert_updates_existing(db_session):
    memory_api.remember(db_session, company_id=1, key="k", value="v1")
    memory_api.remember(db_session, company_id=1, key="k", value="v2")
    assert db_session.query(AgentMemory).count() == 1
    assert memory_api.recall(db_session, company_id=1, key="k") == "v2"


def test_memory_tools_via_registry(ctx):
    out = REGISTRY.dispatch("remember", {"key": "greeting", "value": "hola"}, ctx)
    assert out.ok
    out2 = REGISTRY.dispatch("recall", {"key": "greeting"}, ctx)
    assert out2.ok and out2.data["value"] == "hola"


# ── creative tools ──────────────────────────────────────────────────────────

def test_create_approval_chain_proposes_and_applies(ctx, db_session):
    out = REGISTRY.dispatch(
        "create_approval_chain",
        {
            "module_key": "expenses",
            "stages": [
                {"stage_key": "draft", "stage_name": "Draft", "is_terminal": False},
                {"stage_key": "approved", "stage_name": "Approved", "is_terminal": True},
            ],
        },
        ctx,
    )
    assert out.receipt_id, out.summary

    receipt = db_session.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    import json
    args = json.loads(receipt.args)
    applier = get_applier("create_approval_chain")
    assert applier is not None
    result = applier(ctx, args)
    assert result["stages_created"] == 2
    assert result["transitions_created"] == 1
    # Re-apply is idempotent.
    result2 = applier(ctx, args)
    assert result2["stages_created"] == 0


def test_create_cost_centers_bulk(ctx, db_session):
    out = REGISTRY.dispatch(
        "create_cost_center_hierarchy",
        {"nodes": [{"code": "MX-MKT", "name": "Marketing MX"}, {"code": "MX-OPS", "name": "Ops MX"}]},
        ctx,
    )
    assert out.receipt_id
    receipt = db_session.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    import json
    applier = get_applier("create_cost_center_hierarchy")
    result = applier(ctx, json.loads(receipt.args))
    assert result["created"] == 2
    assert db_session.query(CostCenter).count() == 2


def test_clone_workflow_copies_stages(ctx, db_session):
    db_session.add_all([
        WorkflowStage(company_id=1, module_key="src", stage_key="a", stage_name="A", stage_order=0),
        WorkflowStage(company_id=1, module_key="src", stage_key="b", stage_name="B", stage_order=1),
        WorkflowTransition(company_id=1, module_key="src", from_stage_key="a", to_stage_key="b",
                           action_key="go", required_permission_key=""),
    ])
    db_session.commit()
    out = REGISTRY.dispatch(
        "clone_workflow",
        {"source_module": "src", "target_module": "dst"},
        ctx,
    )
    assert out.receipt_id
    import json
    receipt = db_session.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    get_applier("clone_workflow")(ctx, json.loads(receipt.args))
    cloned = (
        db_session.query(WorkflowStage)
        .filter_by(company_id=1, module_key="dst")
        .count()
    )
    assert cloned == 2


# ── search tools ────────────────────────────────────────────────────────────

def test_search_expenses_by_status(ctx, db_session):
    db_session.add_all([
        Expense(company_id=1, amount=Decimal("100"), description="Uber", status="submitted"),
        Expense(company_id=1, amount=Decimal("50"),  description="Lunch", status="approved"),
    ])
    db_session.commit()
    out = REGISTRY.dispatch("search_expenses", {"status": "submitted"}, ctx)
    assert out.ok
    assert len(out.data["items"]) == 1
    assert out.data["items"][0]["description"] == "Uber"


def test_search_users_by_role(ctx, db_session):
    db_session.add(User(id=2, email="bob@acme.com", full_name="Bob", company_id=1, role="employee"))
    db_session.commit()
    out = REGISTRY.dispatch("search_users", {"role": "employee"}, ctx)
    assert out.ok and len(out.data["items"]) == 1


# ── knowledge_tools ─────────────────────────────────────────────────────────

def test_how_to_returns_link(ctx):
    out = REGISTRY.dispatch("how_to", {"question": "cómo configuro el archivo"}, ctx)
    assert out.ok
    assert out.data.get("answer") is not None


# ── insights ────────────────────────────────────────────────────────────────

def test_scanner_stale_drafts(db_session):
    old = datetime.utcnow() - timedelta(days=45)
    e = Expense(company_id=1, amount=Decimal("10"), description="old", status="draft")
    db_session.add(e)
    db_session.commit()
    # Backdate the row.
    db_session.query(Expense).filter(Expense.id == e.id).update({"created_at": old})
    db_session.commit()
    rows = run_scanners(db_session, 1, persist=False)
    kinds = {r.kind for r in rows}
    assert "stale_drafts" in kinds


def test_scanner_missing_approvers(db_session):
    db_session.add(WorkflowStage(
        company_id=1, module_key="orphan_mod", stage_key="x",
        stage_name="X", stage_order=0,
    ))
    db_session.commit()
    rows = run_scanners(db_session, 1, persist=True)
    kinds = {r.kind for r in rows}
    assert "missing_approvers" in kinds
    # Persisted rows visible.
    from packages.modules.agent.models import AgentInsight
    open_rows = db_session.query(AgentInsight).filter_by(company_id=1, status="open").all()
    assert any(r.kind == "missing_approvers" for r in open_rows)
