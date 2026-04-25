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


# ---------------------------------------------------------------------------
# Phase 7.2 — SAP / SAP Business One adapter
# ---------------------------------------------------------------------------

import json as _json  # noqa: E402

from packages.modules.integrations.service.adapters import SapAdapter  # noqa: E402


def test_registry_resolves_sap() -> None:
    assert isinstance(get_adapter("sap"), SapAdapter)


def test_sap_export_polizas_emits_journal_entries_json(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="sap", name="SAP B1",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = SapAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "JournalEntries.json" in result.artifacts
    payload = _json.loads(result.artifacts["JournalEntries.json"].decode("utf-8"))
    assert "JournalEntries" in payload
    assert len(payload["JournalEntries"]) == result.items_ok
    first = payload["JournalEntries"][0]
    assert "Memo" in first
    assert "JournalEntryLines" in first
    assert isinstance(first["JournalEntryLines"], list)


def test_sap_export_polizas_empty_when_no_expenses(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="sap", name="SAP",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    result = SapAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok == 0
    assert "JournalEntries.json" not in result.artifacts


def test_sap_sync_users_uses_sap_field_names(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="sap", name="SAP",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        User(company_id=co.id, email="a@a.test", full_name="A One", role="admin"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = SapAdapter().sync_users(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["users"][0]
    assert set(rec.keys()) == {"EmployeeID", "Email", "Name", "Role"}
    assert rec["Email"] == "a@a.test"


def test_sap_sync_cost_centers_uses_sap_field_names(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="sap", name="SAP",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        CostCenter(company_id=co.id, code="CC1", name="One", status="active"),
        CostCenter(company_id=co.id, code="CC2", name="Two", status="archived"),
    ])
    db_session.commit()
    result = SapAdapter().sync_cost_centers(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["cost_centers"][0]
    assert rec == {"CostingCode": "CC1", "CostingCodeName": "One"}


# ---------------------------------------------------------------------------
# Phase 7.3 — NetSuite adapter
# ---------------------------------------------------------------------------

from packages.modules.integrations.service.adapters import NetSuiteAdapter  # noqa: E402


def test_registry_resolves_netsuite() -> None:
    assert isinstance(get_adapter("netsuite"), NetSuiteAdapter)


def test_netsuite_export_polizas_emits_journal_entry_json(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="netsuite", name="NetSuite",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = NetSuiteAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "journalentry.json" in result.artifacts
    payload = _json.loads(result.artifacts["journalentry.json"].decode("utf-8"))
    assert "journalEntries" in payload
    assert len(payload["journalEntries"]) == result.items_ok
    first = payload["journalEntries"][0]
    assert first["externalId"].startswith("expense-")
    assert "tranDate" in first
    assert "line" in first and "items" in first["line"]


def test_netsuite_export_polizas_empty_when_no_expenses(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="netsuite", name="NS",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    result = NetSuiteAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok == 0
    assert "journalentry.json" not in result.artifacts


def test_netsuite_sync_users_uses_netsuite_field_names(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="netsuite", name="NS",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        User(company_id=co.id, email="a@a.test", full_name="A One", role="admin"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = NetSuiteAdapter().sync_users(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["employees"][0]
    assert set(rec.keys()) == {"externalId", "email", "entityName", "role"}
    assert rec["externalId"].startswith("user-")


def test_netsuite_sync_cost_centers_uses_department_shape(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="netsuite", name="NS",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        CostCenter(company_id=co.id, code="CC1", name="One", status="active"),
        CostCenter(company_id=co.id, code="CC2", name="Two", status="archived"),
    ])
    db_session.commit()
    result = NetSuiteAdapter().sync_cost_centers(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["departments"][0]
    assert set(rec.keys()) == {"externalId", "name", "subsidiaryRef"}
    assert rec["name"] == "One"


# ---------------------------------------------------------------------------
# Phase 7.4 — Oracle / JD Edwards adapter
# ---------------------------------------------------------------------------

from packages.modules.integrations.service.adapters import OracleJDEAdapter  # noqa: E402


def test_registry_resolves_oracle() -> None:
    assert isinstance(get_adapter("oracle"), OracleJDEAdapter)


def test_oracle_export_polizas_emits_f0911z1_csv(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="oracle", name="JD Edwards",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = OracleJDEAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "F0911Z1.csv" in result.artifacts
    csv_text = result.artifacts["F0911Z1.csv"].decode("utf-8")
    lines = csv_text.splitlines()
    assert lines[0].startswith("EDUS,EDBT,EDTN,EDLN,EDOC,EDCT,EDDJ,EXR,ANI,AA")
    # Each expense produces ≥1 movement row
    assert len(lines) >= 1 + result.items_ok


def test_oracle_export_polizas_empty_when_no_expenses(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="oracle", name="JDE",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    result = OracleJDEAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok == 0
    assert "F0911Z1.csv" not in result.artifacts


def test_oracle_sync_users_uses_jde_field_names(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="oracle", name="JDE",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        User(company_id=co.id, email="a@a.test", full_name="A One", role="admin"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = OracleJDEAdapter().sync_users(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["address_book"][0]
    assert set(rec.keys()) == {"AN8", "MLNM", "EMAL", "ROLE"}
    assert rec["EMAL"] == "a@a.test"


def test_oracle_sync_cost_centers_uses_business_unit_shape(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="oracle", name="JDE",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        CostCenter(company_id=co.id, code="MCU01", name="One", status="active"),
        CostCenter(company_id=co.id, code="MCU02", name="Two", status="archived"),
    ])
    db_session.commit()
    result = OracleJDEAdapter().sync_cost_centers(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["business_units"][0]
    assert rec == {"MCU": "MCU01", "DL01": "One"}


# ---------------------------------------------------------------------------
# Phase 7.5 — QuickBooks Online + Xero adapters
# ---------------------------------------------------------------------------

import json as _json  # noqa: E402

from packages.modules.integrations.service.adapters import (  # noqa: E402
    QuickBooksAdapter,
    XeroAdapter,
)


def test_registry_resolves_quickbooks_and_xero() -> None:
    assert isinstance(get_adapter("quickbooks"), QuickBooksAdapter)
    assert isinstance(get_adapter("xero"), XeroAdapter)


def test_quickbooks_export_emits_journal_entries_json(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="quickbooks", name="QBO",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = QuickBooksAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "journal_entries.json" in result.artifacts
    payload = _json.loads(result.artifacts["journal_entries.json"].decode("utf-8"))
    assert "JournalEntries" in payload
    entry = payload["JournalEntries"][0]
    assert entry["DocNumber"].startswith("expense-")
    assert isinstance(entry["Line"], list) and len(entry["Line"]) >= 1
    line = entry["Line"][0]
    assert line["DetailType"] == "JournalEntryLineDetail"
    assert line["JournalEntryLineDetail"]["PostingType"] in {"Debit", "Credit"}


def test_quickbooks_sync_users_uses_qbo_shape(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="quickbooks", name="QBO",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        User(company_id=co.id, email="a@a.test", full_name="A One", role="admin"),
        User(company_id=999, email="leak@x.test", full_name="X", role="admin"),
    ])
    db_session.commit()
    result = QuickBooksAdapter().sync_users(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["Employees"][0]
    assert rec["PrimaryEmailAddr"] == {"Address": "a@a.test"}
    assert set(rec.keys()) == {"Id", "DisplayName", "PrimaryEmailAddr", "Role"}


def test_xero_export_emits_manual_journals_with_signed_amounts(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="xero", name="Xero",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.commit()
    _seed_approved_expenses(db_session, co.id, n=2)
    result = XeroAdapter().export_polizas(db_session, integ, period="2026-04")
    assert result.items_ok >= 1
    assert "manual_journals.json" in result.artifacts
    payload = _json.loads(result.artifacts["manual_journals.json"].decode("utf-8"))
    assert "ManualJournals" in payload
    journal = payload["ManualJournals"][0]
    assert journal["Status"] == "DRAFT"
    assert isinstance(journal["JournalLines"], list)
    # Sum of LineAmounts should equal zero (debit positive, credit negative)
    total = sum(line["LineAmount"] for line in journal["JournalLines"])
    assert abs(total) < 0.01


def test_xero_sync_cost_centers_uses_tracking_categories(
    db_session: Session, co: Company
) -> None:
    integ = Integration(
        company_id=co.id, kind="erp", vendor="xero", name="Xero",
        is_enabled=True,
    )
    db_session.add(integ)
    db_session.add_all([
        CostCenter(company_id=co.id, code="CC01", name="Sales", status="active"),
        CostCenter(company_id=co.id, code="CC02", name="Old", status="archived"),
    ])
    db_session.commit()
    result = XeroAdapter().sync_cost_centers(db_session, integ)
    assert result.items_ok == 1
    rec = result.payload["TrackingCategories"][0]
    assert rec["Name"] == "Sales"
    assert rec["Option"] == "CC01"
