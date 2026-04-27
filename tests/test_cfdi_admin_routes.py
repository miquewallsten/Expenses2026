"""Phase 4.8 admin endpoints — list cancelled CFDIs + manual recheck."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="P48api", slug="p48api")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _admin(db_session: Session, co: Company) -> User:
    u = User(full_name="A", email="a-cfdi@test.com", role="admin", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _emp(db_session: Session, co: Company) -> User:
    u = User(full_name="E", email="e-cfdi@test.com", role="employee", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _make(db, co_id, *, uuid=None, status=None, last=None, mismatch=False) -> Expense:
    e = Expense(
        company_id=co_id,
        amount=Decimal("100.00"),
        description="X",
        status="approved",
        expense_date=date(2026, 4, 1),
        cfdi_uuid=uuid,
        cfdi_status=status,
        cfdi_last_checked_at=last,
        cfdi_amount_mismatch=mismatch,
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e


def test_cancelled_listing_only_returns_cancelado_for_my_company(
    client, db_session, co
):
    admin = _admin(db_session, co)
    other = Company(name="P48other", slug="p48other")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)

    _make(db_session, co.id, uuid="UUID-A", status="Vigente", last=datetime.utcnow())
    cancelled = _make(
        db_session, co.id, uuid="UUID-B", status="Cancelado", last=datetime.utcnow()
    )
    _make(db_session, other.id, uuid="UUID-C", status="Cancelado", last=datetime.utcnow())

    r = client.get(
        "/expenses/cfdi/cancelled", headers={"X-User-Id": str(admin.id)}
    )
    assert r.status_code == 200
    rows = r.json()
    assert [row["id"] for row in rows] == [cancelled.id]
    assert rows[0]["cfdi_status"] == "Cancelado"
    assert rows[0]["cfdi_uuid"] == "UUID-B"


def test_cancelled_listing_forbidden_for_non_admin(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.get(
        "/expenses/cfdi/cancelled", headers={"X-User-Id": str(emp.id)}
    )
    assert r.status_code == 403


def test_recheck_route_invokes_service_and_returns_status(client, db_session, co):
    admin = _admin(db_session, co)
    e = _make(db_session, co.id, uuid="UUID-R", status="Vigente")

    fake = {
        "sat_status": "Cancelado",
        "is_valid": False,
        "estado": "Cancelado",
        "code": "S",
        "message": "ok",
    }
    with patch(
        "packages.modules.expenses.service.cfdi_lifecycle_service.check_cfdi_with_sat",
        return_value=fake,
    ):
        r = client.post(
            f"/expenses/cfdi/recheck/{e.id}", headers={"X-User-Id": str(admin.id)}
        )
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["cfdi_status"] == "Cancelado"
    assert body["changed"] is True
    assert body["cancelled"] is True


def test_recheck_route_404_for_other_company(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="P48oC", slug="p48oc")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    e = _make(db_session, other.id, uuid="UUID-X", status="Vigente")

    r = client.post(
        f"/expenses/cfdi/recheck/{e.id}", headers={"X-User-Id": str(admin.id)}
    )
    assert r.status_code == 404
