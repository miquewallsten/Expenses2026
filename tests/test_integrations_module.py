"""Phase 4.1 — Integrations module schema + listing endpoints."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.integrations.models import (
    ExpensePaymentStatus,
    Integration,
    IntegrationEndpoint,
    IntegrationSyncRun,
)


@pytest.fixture
def two_companies(db_session: Session) -> dict:
    co_a = Company(name="Co A", slug="co-a")
    co_b = Company(name="Co B", slug="co-b")
    db_session.add_all([co_a, co_b])
    db_session.commit()
    user_a = User(
        company_id=co_a.id, email="a@a.test", full_name="A", role="admin"
    )
    user_b = User(
        company_id=co_b.id, email="b@b.test", full_name="B", role="admin"
    )
    db_session.add_all([user_a, user_b])
    db_session.commit()
    return {"co_a": co_a, "co_b": co_b, "user_a": user_a, "user_b": user_b}


def test_integration_create_minimal(db_session: Session, two_companies: dict) -> None:
    integration = Integration(
        company_id=two_companies["co_a"].id,
        kind="erp",
        vendor="contpaqi",
        name="Contpaqi — Producción",
    )
    db_session.add(integration)
    db_session.commit()
    assert integration.id is not None
    assert integration.is_enabled is False
    assert integration.created_at is not None


def test_endpoint_unique_per_integration(
    db_session: Session, two_companies: dict
) -> None:
    integration = Integration(
        company_id=two_companies["co_a"].id,
        kind="erp",
        vendor="contpaqi",
        name="Contpaqi",
    )
    db_session.add(integration)
    db_session.commit()

    db_session.add(
        IntegrationEndpoint(
            integration_id=integration.id, endpoint="export_polizas"
        )
    )
    db_session.commit()
    db_session.add(
        IntegrationEndpoint(
            integration_id=integration.id, endpoint="export_polizas"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_sync_run_records(db_session: Session, two_companies: dict) -> None:
    integration = Integration(
        company_id=two_companies["co_a"].id,
        kind="erp",
        vendor="contpaqi",
        name="Contpaqi",
    )
    db_session.add(integration)
    db_session.commit()

    run = IntegrationSyncRun(
        integration_id=integration.id,
        endpoint="export_polizas",
        direction="outbound",
        status="succeeded",
        finished_at=datetime.utcnow(),
        items_ok=12,
        items_failed=0,
    )
    db_session.add(run)
    db_session.commit()
    assert run.id is not None
    assert run.items_ok == 12


def test_payment_status_unique_per_pair(
    db_session: Session, two_companies: dict
) -> None:
    integration = Integration(
        company_id=two_companies["co_a"].id,
        kind="erp",
        vendor="contpaqi",
        name="Contpaqi",
    )
    db_session.add(integration)
    db_session.commit()

    db_session.add(
        ExpensePaymentStatus(
            expense_id=999,
            integration_id=integration.id,
            erp_payment_reference="REF-001",
            erp_status="paid",
        )
    )
    db_session.commit()
    db_session.add(
        ExpensePaymentStatus(
            expense_id=999,
            integration_id=integration.id,
            erp_payment_reference="REF-002",
            erp_status="paid",
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_list_integrations_isolates_by_company(
    db_session: Session, client: TestClient, two_companies: dict
) -> None:
    db_session.add_all([
        Integration(
            company_id=two_companies["co_a"].id,
            kind="erp", vendor="contpaqi", name="A-Contpaqi",
        ),
        Integration(
            company_id=two_companies["co_b"].id,
            kind="erp", vendor="aspel", name="B-Aspel",
        ),
    ])
    db_session.commit()

    resp_a = client.get(
        "/integrations", headers={"X-User-Id": str(two_companies["user_a"].id)}
    )
    assert resp_a.status_code == 200
    rows_a = resp_a.json()
    assert len(rows_a) == 1
    assert rows_a[0]["name"] == "A-Contpaqi"

    resp_b = client.get(
        "/integrations", headers={"X-User-Id": str(two_companies["user_b"].id)}
    )
    assert resp_b.status_code == 200
    rows_b = resp_b.json()
    assert len(rows_b) == 1
    assert rows_b[0]["name"] == "B-Aspel"


def test_get_integration_cross_company_returns_404(
    db_session: Session, client: TestClient, two_companies: dict
) -> None:
    integration = Integration(
        company_id=two_companies["co_a"].id,
        kind="erp", vendor="contpaqi", name="A-only",
    )
    db_session.add(integration)
    db_session.commit()

    resp = client.get(
        f"/integrations/{integration.id}",
        headers={"X-User-Id": str(two_companies["user_b"].id)},
    )
    assert resp.status_code == 404
