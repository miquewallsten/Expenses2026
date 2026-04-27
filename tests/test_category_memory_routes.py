"""Phase 8.3 admin endpoints — category memory list/suggest/delete."""
from __future__ import annotations

import json

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.ai.models_categorization_feedback import CategorizationFeedback
from packages.modules.ai.service.embedding_service import embed_text


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="P83", slug="p83")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _admin(db_session: Session, co: Company) -> User:
    u = User(full_name="A", email="a-cm@test.com", role="admin", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _emp(db_session: Session, co: Company) -> User:
    u = User(full_name="E", email="e-cm@test.com", role="employee", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _seed(db, co_id: int, *, text: str, cat: str) -> CategorizationFeedback:
    row = CategorizationFeedback(
        company_id=co_id,
        corrected_category=cat,
        description_text=text,
        description_embedding=json.dumps(embed_text(text)),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def test_list_feedback_returns_items_and_aggregates(client, db_session, co):
    admin = _admin(db_session, co)
    _seed(db_session, co.id, text="Uber to airport", cat="transport")
    _seed(db_session, co.id, text="Lunch with client", cat="meals")
    _seed(db_session, co.id, text="Taxi from hotel", cat="transport")

    r = client.get(
        f"/admin/category-memory/{co.id}", headers={"X-User-Id": str(admin.id)}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    by = {row["category"]: row["count"] for row in body["by_category"]}
    assert by == {"transport": 2, "meals": 1}


def test_list_feedback_forbidden_for_non_admin(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.get(
        f"/admin/category-memory/{co.id}", headers={"X-User-Id": str(emp.id)}
    )
    assert r.status_code == 403


def test_suggest_category_returns_suggestion_when_neighbour_present(
    client, db_session, co
):
    admin = _admin(db_session, co)
    _seed(db_session, co.id, text="Uber to airport", cat="transport")
    _seed(db_session, co.id, text="Taxi to office", cat="transport")

    r = client.post(
        f"/admin/category-memory/{co.id}/suggest",
        headers={"X-User-Id": str(admin.id)},
        json={"description": "Uber to airport"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["suggestion"] is not None
    assert body["suggestion"]["category"] == "transport"


def test_delete_feedback_removes_row(client, db_session, co):
    admin = _admin(db_session, co)
    row = _seed(db_session, co.id, text="x", cat="meals")

    r = client.delete(
        f"/admin/category-memory/{co.id}/{row.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200
    assert r.json()["deleted_id"] == row.id
    assert (
        db_session.query(CategorizationFeedback)
        .filter(CategorizationFeedback.id == row.id)
        .one_or_none()
        is None
    )


def test_delete_feedback_404_other_company(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="P83other", slug="p83other")
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    row = _seed(db_session, other.id, text="y", cat="meals")

    r = client.delete(
        f"/admin/category-memory/{co.id}/{row.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404
