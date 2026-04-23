"""Tests for ingestion tools (CSV → receipt → applier)."""

from __future__ import annotations

import json
import os
import uuid

import pytest

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_user import User
from packages.modules.agent.core.appliers import get_applier
from packages.modules.agent.core.context import AgentContext
from packages.modules.agent.models import AgentPendingAction, AgentUpload
from packages.modules.agent.tools import registry_all  # noqa: F401 — register
from packages.modules.agent.tools.ingestion import (
    _handle_ingest_accounting_catalog,
    _handle_ingest_org_entities,
    _handle_ingest_user_roster,
)


@pytest.fixture
def admin_ctx(db_session, test_company):
    from packages.core.platform.models_user import User as U
    u = U(full_name="Admin", email=f"admin_{uuid.uuid4().hex[:6]}@t.com",
          role="admin", company_id=test_company.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return AgentContext(
        db=db_session, company_id=test_company.id, user_id=u.id,
        user_email=u.email, user_role=u.role, persona="admin",
    )


def _stage_upload(ctx: AgentContext, tmp_path, filename: str, content: str) -> str:
    file_id = uuid.uuid4().hex
    path = tmp_path / filename
    path.write_text(content, encoding="utf-8")
    ctx.db.add(AgentUpload(
        file_id=file_id, company_id=ctx.company_id, filename=filename,
        content_type="text/csv", size_bytes=len(content),
        storage_path=str(path), uploaded_by=ctx.user_id,
    ))
    ctx.db.commit()
    return file_id


# ── Accounting catalog ────────────────────────────────────────────────────

def test_ingest_accounting_catalog_creates_receipt_then_applier_inserts(admin_ctx, tmp_path):
    csv = (
        "Code,Name,Expense Account,IVA,Requires Project\n"
        "travel,Viajes,6001,creditable,yes\n"
        "meals,Comidas,6002,non_creditable,no\n"
        "supplies,Papelería,6003,creditable,no\n"
    )
    file_id = _stage_upload(admin_ctx, tmp_path, "catalog.csv", csv)

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(admin_ctx, FileIdArg(file_id=file_id))
    assert out.ok is True
    assert out.receipt_id is not None
    assert "3 categorías" in out.summary

    pending = admin_ctx.db.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    assert pending.tool_name == "ingest_accounting_catalog"

    applier = get_applier("ingest_accounting_catalog")
    result = applier(admin_ctx, json.loads(pending.args))
    assert result["created"] == 3

    rows = (
        admin_ctx.db.query(AccountingCategory)
        .filter_by(company_id=admin_ctx.company_id).order_by(AccountingCategory.code).all()
    )
    assert [r.code for r in rows] == ["meals", "supplies", "travel"]
    travel = next(r for r in rows if r.code == "travel")
    assert travel.tax_behavior == "creditable"
    assert travel.requires_project is True
    assert travel.expense_account_code == "6001"


def test_ingest_accounting_catalog_skips_duplicates(admin_ctx, tmp_path):
    admin_ctx.db.add(AccountingCategory(
        company_id=admin_ctx.company_id, code="travel", name="Viajes (existente)",
    ))
    admin_ctx.db.commit()

    csv = "code,name\ntravel,Viajes\nnew_one,Nuevo\n"
    file_id = _stage_upload(admin_ctx, tmp_path, "cat2.csv", csv)

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(admin_ctx, FileIdArg(file_id=file_id))
    assert out.ok is True
    preview = out.data["preview"]
    assert preview["counts"]["proposed"] == 1
    assert preview["counts"]["skipped"] == 1
    assert preview["skipped"][0]["code"] == "travel"


def test_ingest_accounting_catalog_missing_required_columns(admin_ctx, tmp_path):
    csv = "only_one_column\nfoo\nbar\n"
    file_id = _stage_upload(admin_ctx, tmp_path, "bad.csv", csv)

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(admin_ctx, FileIdArg(file_id=file_id))
    assert out.ok is False
    assert out.error == "missing_required_columns"


def test_ingest_file_id_not_found(admin_ctx):
    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(admin_ctx, FileIdArg(file_id="does-not-exist"))
    assert out.ok is False
    assert out.error == "file_not_found"


def test_ingest_file_missing_from_storage(admin_ctx, tmp_path):
    # Record the upload row but point at a non-existent path.
    file_id = uuid.uuid4().hex
    admin_ctx.db.add(AgentUpload(
        file_id=file_id, company_id=admin_ctx.company_id, filename="ghost.csv",
        content_type="text/csv", size_bytes=0,
        storage_path=str(tmp_path / "missing.csv"), uploaded_by=admin_ctx.user_id,
    ))
    admin_ctx.db.commit()

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(admin_ctx, FileIdArg(file_id=file_id))
    assert out.ok is False
    assert out.error == "file_missing"


def test_ingest_cross_company_file_not_accessible(db_session, test_company, tmp_path):
    """An upload owned by company A must not be readable by company B's agent."""
    from packages.core.platform.models import Company
    other = Company(name="Other Inc", slug="other-ing")
    db_session.add(other); db_session.commit(); db_session.refresh(other)

    admin_a = User(full_name="A", email="aa@t.com", role="admin", company_id=test_company.id)
    admin_b = User(full_name="B", email="bb@t.com", role="admin", company_id=other.id)
    db_session.add_all([admin_a, admin_b]); db_session.commit()
    db_session.refresh(admin_a); db_session.refresh(admin_b)

    ctx_a = AgentContext(db=db_session, company_id=test_company.id, user_id=admin_a.id,
                         user_email=admin_a.email, user_role="admin", persona="admin")
    ctx_b = AgentContext(db=db_session, company_id=other.id, user_id=admin_b.id,
                         user_email=admin_b.email, user_role="admin", persona="admin")

    file_id = _stage_upload(ctx_a, tmp_path, "a.csv", "code,name\nfoo,Foo\n")

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_accounting_catalog(ctx_b, FileIdArg(file_id=file_id))
    assert out.ok is False
    assert out.error == "file_not_found"


# ── User roster ───────────────────────────────────────────────────────────

def test_ingest_user_roster_creates_receipt_then_applier_inserts(admin_ctx, tmp_path):
    csv = (
        "Email,Full Name,Role,Department\n"
        f"alice_{uuid.uuid4().hex[:6]}@acme.com,Alice A,employee,Finanzas\n"
        f"bob_{uuid.uuid4().hex[:6]}@acme.com,Bob B,manager,Operaciones\n"
        "bad-email,Should Skip,employee,\n"
    )
    file_id = _stage_upload(admin_ctx, tmp_path, "roster.csv", csv)

    from packages.modules.agent.tools.ingestion import FileIdArg
    out = _handle_ingest_user_roster(admin_ctx, FileIdArg(file_id=file_id))
    assert out.ok is True
    assert out.receipt_id is not None
    preview = out.data["preview"]
    assert preview["counts"]["proposed"] == 2
    assert any(s["reason"] == "invalid_email" for s in preview["skipped"])

    pending = admin_ctx.db.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    applier = get_applier("ingest_user_roster")
    result = applier(admin_ctx, json.loads(pending.args))
    assert result["created"] == 2

    created = (
        admin_ctx.db.query(User)
        .filter(User.company_id == admin_ctx.company_id, User.email.like("%@acme.com"))
        .all()
    )
    assert len(created) == 2
    assert {u.role for u in created} == {"employee", "manager"}


# ── Org entities ──────────────────────────────────────────────────────────

def test_ingest_org_entities_cost_centers(admin_ctx, tmp_path):
    csv = (
        "Code,Name,Status\n"
        "CC-100,Ventas,active\n"
        "CC-200,Marketing,active\n"
        "CC-300,Legacy,inactive\n"
    )
    file_id = _stage_upload(admin_ctx, tmp_path, "cc.csv", csv)

    from packages.modules.agent.tools.ingestion import IngestOrgArgs
    out = _handle_ingest_org_entities(
        admin_ctx, IngestOrgArgs(file_id=file_id, kind="cost_center"),
    )
    assert out.ok is True
    assert out.receipt_id is not None

    pending = admin_ctx.db.query(AgentPendingAction).filter_by(receipt_id=out.receipt_id).one()
    applier = get_applier("ingest_org_entities")
    result = applier(admin_ctx, json.loads(pending.args))
    assert result == {"kind": "cost_center", "created": 3, "total_proposed": 3}

    rows = (
        admin_ctx.db.query(CostCenter)
        .filter_by(company_id=admin_ctx.company_id).order_by(CostCenter.code).all()
    )
    assert [r.code for r in rows] == ["CC-100", "CC-200", "CC-300"]
    assert next(r for r in rows if r.code == "CC-300").status == "inactive"
