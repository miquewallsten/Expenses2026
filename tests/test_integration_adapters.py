"""Phase 4.3 — Adapters + runner for the Integrations module."""
from __future__ import annotations

import zipfile
from decimal import Decimal
from io import BytesIO

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_cost_center import CostCenter
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense
from packages.modules.integrations.models import Integration, IntegrationSyncRun
from packages.modules.integrations.service.adapters import (
    ContpaqiAdapter,
    GenericCsvJsonAdapter,
    get_adapter,
)
from packages.modules.integrations.service.adapters.protocol import AdapterResult
from packages.modules.integrations.service.runner import run_endpoint


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="A", slug="a-43")
    db_session.add(c)
    db_session.commit()
    return c


@pytest.fixture
def integration(db_session: Session, co: Company) -> Integration:
    i = Integration(
        company_id=co.id, kind="erp", vendor="contpaqi", name="Contpaqi prod",
        is_enabled=True,
    )
    db_session.add(i)
    db_session.commit()
    return i


def _seed_approved_expenses(db: Session, company_id: int, n: int = 3) -> None:
    db.add_all([
        Expense(
            company_id=company_id,
            amount=Decimal("100.00") * (i + 1),
            description=f"Receipt {i}",
            status="approved",
            category_code="600-01-001",
        )
        for i in range(n)
    ])
    db.commit()


def test_registry_resolves_known_vendors() -> None:
    assert isinstance(get_adapter("contpaqi"), ContpaqiAdapter)
    assert isinstance(get_adapter("custom"), GenericCsvJsonAdapter)
    assert get_adapter("unknownvendor") is None


def test_adapter_result_status_logic() -> None:
    assert AdapterResult(items_ok=3, items_failed=0).status == "succeeded"
    assert AdapterResult(items_ok=0, items_failed=2).status == "failed"
    assert AdapterResult(items_ok=2, items_failed=1).status == "partial"


def test_contpaqi_export_polizas_emits_xml(
    db_session: Session, co: Company, integration: Integration
) -> None:
    _seed_approved_expenses(db_session, co.id, n=2)
    result = ContpaqiAdapter().export_polizas(db_session, integration, period="2026-04")
    assert result.items_ok >= 1
    assert "polizas.xml" in result.artifacts
    xml = result.artifacts["polizas.xml"].decode("utf-8")
    assert "<Polizas>" in xml and "<Poliza " in xml


def test_contpaqi_sync_users_returns_company_users(
    db_session: Session, co: Company, integration: Integration
) -> None:
    db_session.add_all([
        User(company_id=co.id, email="u1@a.test", full_name="U1", role="admin"),
        User(company_id=co.id, email="u2@a.test", full_name="U2", role="employee"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = ContpaqiAdapter().sync_users(db_session, integration)
    assert result.items_ok == 2
    emails = {u["email"] for u in result.payload["users"]}
    assert emails == {"u1@a.test", "u2@a.test"}


def test_contpaqi_sync_cost_centers_filters_active(
    db_session: Session, co: Company, integration: Integration
) -> None:
    db_session.add_all([
        CostCenter(company_id=co.id, code="CC1", name="One", status="active"),
        CostCenter(company_id=co.id, code="CC2", name="Two", status="archived"),
    ])
    db_session.commit()
    result = ContpaqiAdapter().sync_cost_centers(db_session, integration)
    assert result.items_ok == 1
    assert result.payload["cost_centers"][0]["code"] == "CC1"


def test_generic_adapter_produces_zip_with_csv_and_json(
    db_session: Session, co: Company
) -> None:
    integration = Integration(
        company_id=co.id, kind="erp", vendor="custom", name="Bespoke"
    )
    db_session.add(integration)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=3)

    result = GenericCsvJsonAdapter().export_polizas(
        db_session, integration, period="2026-04"
    )
    assert result.items_ok == 3
    blob = result.artifacts["export.zip"]
    with zipfile.ZipFile(BytesIO(blob)) as zf:
        names = set(zf.namelist())
        assert names == {"expenses.csv", "expenses.json"}
        csv_text = zf.read("expenses.csv").decode("utf-8")
        assert "id,amount,description" in csv_text


def test_runner_records_succeeded_run(
    db_session: Session, co: Company, integration: Integration
) -> None:
    _seed_approved_expenses(db_session, co.id, n=1)
    run, result = run_endpoint(
        db_session, integration=integration, endpoint="export_polizas", period="2026-04"
    )
    assert run.status == "succeeded"
    assert run.items_ok == 1
    assert run.items_failed == 0
    assert run.finished_at is not None


def test_runner_unknown_vendor_records_failed_run(
    db_session: Session, co: Company
) -> None:
    integration = Integration(
        company_id=co.id, kind="erp", vendor="unknownvendor", name="Mystery"
    )
    db_session.add(integration)
    db_session.commit()
    run, _ = run_endpoint(
        db_session, integration=integration, endpoint="export_polizas"
    )
    assert run.status == "failed"
    assert "no adapter" in (run.error_summary or "")


def test_runner_post_endpoint_creates_run_row(
    db_session: Session, co: Company, integration: Integration
) -> None:
    from packages.modules.integrations.router import RunRequest, trigger_run

    user = User(company_id=co.id, email="trig@a.test", full_name="T", role="admin")
    db_session.add(user)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=1)

    body = RunRequest(endpoint="export_polizas", period="2026-04")
    out = trigger_run(
        integration_id=integration.id, body=body, current_user=user, db=db_session
    )
    assert out.status == "succeeded"
    assert out.integration_id == integration.id

    rows = (
        db_session.query(IntegrationSyncRun)
        .filter(IntegrationSyncRun.integration_id == integration.id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].triggered_by_user_id == user.id


def test_runner_post_endpoint_blocks_disabled_integration(
    db_session: Session, co: Company
) -> None:
    from fastapi import HTTPException

    from packages.modules.integrations.router import RunRequest, trigger_run

    integration = Integration(
        company_id=co.id, kind="erp", vendor="contpaqi", name="Off",
        is_enabled=False,
    )
    user = User(company_id=co.id, email="t2@a.test", full_name="T", role="admin")
    db_session.add_all([integration, user])
    db_session.commit()

    body = RunRequest(endpoint="export_polizas")
    with pytest.raises(HTTPException) as excinfo:
        trigger_run(
            integration_id=integration.id, body=body, current_user=user, db=db_session
        )
    assert excinfo.value.status_code == 409


def test_runner_post_endpoint_cross_company_404(
    db_session: Session, co: Company, integration: Integration
) -> None:
    from fastapi import HTTPException

    from packages.modules.integrations.router import RunRequest, trigger_run

    other_co = Company(name="B", slug="b-43")
    db_session.add(other_co)
    db_session.commit()
    other_user = User(
        company_id=other_co.id, email="o@b.test", full_name="O", role="admin"
    )
    db_session.add(other_user)
    db_session.commit()

    body = RunRequest(endpoint="export_polizas")
    with pytest.raises(HTTPException) as excinfo:
        trigger_run(
            integration_id=integration.id,
            body=body,
            current_user=other_user,
            db=db_session,
        )
    assert excinfo.value.status_code == 404


# ---------------------------------------------------------------------------
# Phase 7.1 — Aspel (COI) adapter
# ---------------------------------------------------------------------------

from packages.modules.integrations.service.adapters import AspelAdapter  # noqa: E402


def test_registry_resolves_aspel() -> None:
    assert isinstance(get_adapter("aspel"), AspelAdapter)


def test_aspel_export_polizas_emits_csv(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="aspel", name="Aspel COI",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = AspelAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "polizas_aspel.csv" in result.artifacts
    csv_text = result.artifacts["polizas_aspel.csv"].decode("utf-8")
    lines = csv_text.splitlines()
    assert lines[0].startswith("Tipo,Numero,Fecha,Concepto,Cuenta,Debe,Haber")
    # at least 1 movement line per expense
    assert len(lines) >= 1 + result.items_ok


def test_aspel_export_polizas_empty_when_no_expenses(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="aspel", name="Aspel",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    result = AspelAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok == 0
    assert result.items_failed == 0
    assert "polizas_aspel.csv" not in result.artifacts


def test_aspel_sync_users_scopes_to_company(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="aspel", name="Aspel",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        User(company_id=co.id, email="a@a.test", full_name="A", role="admin"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = AspelAdapter().sync_users(db_session, integ)
    assert result.items_ok == 1
    assert result.payload["users"][0]["email"] == "a@a.test"


def test_aspel_sync_cost_centers_filters_active(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="aspel", name="Aspel",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        CostCenter(company_id=co.id, code="C1", name="One", status="active"),
        CostCenter(company_id=co.id, code="C2", name="Two", status="archived"),
    ])
    db_session.commit()
    result = AspelAdapter().sync_cost_centers(db_session, integ)
    assert result.items_ok == 1
    assert result.payload["cost_centers"][0]["code"] == "C1"
