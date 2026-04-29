import pytest
from packages.core.platform.models import Company
from packages.core.platform.models_user import User


class TestReadinessRouter:
    def test_get_readiness_requires_auth(self, client):
        r = client.get("/admin/readiness/1")
        assert r.status_code == 401

    def test_get_readiness_returns_report(self, client, db_session):
        company = Company(name="Test", slug="test-rdy")
        db_session.add(company)
        db_session.commit()

        user = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=company.id,
        )
        db_session.add(user)
        db_session.commit()

        r = client.get(
            f"/admin/readiness/{company.id}",
            headers={"X-User-Id": str(user.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert "ok" in data
        assert "modules" in data
        assert "blockers" in data
        assert data["company_id"] == company.id

    def test_get_blockers(self, client, db_session):
        company = Company(name="Test", slug="test-rdy2")
        db_session.add(company)
        db_session.commit()

        user = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=company.id,
        )
        db_session.add(user)
        db_session.commit()

        r = client.get(
            f"/admin/readiness/{company.id}/blockers",
            headers={"X-User-Id": str(user.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert "blockers" in data

    def test_get_module_readiness(self, client, db_session):
        company = Company(name="Test", slug="test-rdy3")
        db_session.add(company)
        db_session.commit()

        user = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=company.id,
        )
        db_session.add(user)
        db_session.commit()

        r = client.get(
            f"/admin/readiness/{company.id}/module/expenses",
            headers={"X-User-Id": str(user.id)},
        )
        assert r.status_code == 200
        data = r.json()
        assert "module" in data
        assert data["module"] == "expenses"

    def test_cross_company_isolation(self, client, db_session):
        c1 = Company(name="C1", slug="c1-rdy")
        c2 = Company(name="C2", slug="c2-rdy")
        db_session.add_all([c1, c2])
        db_session.commit()

        user = User(
            full_name="Admin",
            email="admin@test.com",
            role="admin",
            company_id=c1.id,
        )
        db_session.add(user)
        db_session.commit()

        r = client.get(
            f"/admin/readiness/{c2.id}",
            headers={"X-User-Id": str(user.id)},
        )
        assert r.status_code == 403
