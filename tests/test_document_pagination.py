"""Test pagination in document and report endpoints."""

import pytest


@pytest.fixture
def admin_user(db_session, test_company):
    """Create an admin user for pagination tests."""
    from packages.core.platform.models_user import User

    user = User(
        full_name="Test Admin",
        email="admin@test.com",
        role="admin",
        company_id=test_company.id,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_documents_pagination(client, admin_user):
    """Test that documents endpoint returns paginated results."""
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 20},
        headers={"X-User-Id": str(admin_user.id)},
    )

    # Should return paginated structure even with empty data
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data


def test_documents_pagination_with_data(client, admin_user, db_session):
    """Test documents pagination with actual data."""
    from packages.modules.expenses.models.document import ExpenseDocument

    # Create 25 documents
    for i in range(25):
        doc = ExpenseDocument(
            company_id=admin_user.company_id,
            filename=f"test_{i}.xml",
            content_text="<xml>test</xml>",
            document_type="cfdi_xml",
        )
        db_session.add(doc)
    db_session.commit()

    # Request first page with limit 10
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 10},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25
    assert data["page"] == 1
    assert data["pages"] == 3

    # Request second page
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 2, "limit": 10},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["page"] == 2

    # Request last page
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 3, "limit": 10},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 5
    assert data["page"] == 3


def test_documents_pagination_limit_cap(client, admin_user, db_session):
    """Test that limit > 100 is rejected by validation."""
    from packages.modules.expenses.models.document import ExpenseDocument

    # Create 150 documents
    for i in range(150):
        doc = ExpenseDocument(
            company_id=admin_user.company_id,
            filename=f"test_{i}.xml",
            content_text="<xml>test</xml>",
            document_type="cfdi_xml",
        )
        db_session.add(doc)
    db_session.commit()

    # Request with limit 200 (should be rejected with 422)
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 200},
        headers={"X-User-Id": str(admin_user.id)},
    )

    # FastAPI Query validation rejects limit > 100
    assert response.status_code == 422

    # But limit=100 (max allowed) should work
    response = client.get(
        "/expenses/documents",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 100},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 100
    assert data["total"] == 150


def test_reports_pagination(client, admin_user):
    """Test that reports endpoint returns paginated results."""
    response = client.get(
        "/expenses/reports",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 20},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data


def test_reports_pagination_with_data(client, admin_user, db_session):
    """Test reports pagination with actual data."""
    from packages.modules.expenses.models.report import ExpenseReport

    # Create 30 reports
    for i in range(30):
        report = ExpenseReport(
            company_id=admin_user.company_id,
            title=f"Report {i}",
            status="draft",
        )
        db_session.add(report)
    db_session.commit()

    response = client.get(
        "/expenses/reports",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 15},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 15
    assert data["total"] == 30
    assert data["pages"] == 2


def test_polizas_pagination(client, admin_user):
    """Test that polizas endpoint returns paginated results."""
    response = client.get(
        "/expenses/polizas",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 20},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert "page" in data
    assert "pages" in data


def test_polizas_pagination_with_data(client, admin_user, db_session):
    """Test polizas pagination with actual data."""
    from packages.modules.expenses.models.report import ExpenseReport
    from packages.modules.expenses.models.poliza import Poliza

    # Create reports and polizas
    for i in range(25):
        report = ExpenseReport(
            company_id=admin_user.company_id,
            title=f"Report {i}",
            status="approved",
        )
        db_session.add(report)
        db_session.flush()

        poliza = Poliza(
            company_id=admin_user.company_id,
            report_id=report.id,
            content_text=f"Poliza content {i}",
            status="draft",
        )
        db_session.add(poliza)
    db_session.commit()

    response = client.get(
        "/expenses/polizas",
        params={"company_id": admin_user.company_id, "page": 1, "limit": 10},
        headers={"X-User-Id": str(admin_user.id)},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 10
    assert data["total"] == 25
    assert data["pages"] == 3