"""Phase 2.1 — Idempotency cache (unit + helper-level tests, no HTTP).

The HTTP integration is exercised indirectly via the ``_run`` wrapper used
by review_actions_router; we avoid TestClient here because SQLite in-memory
uses fresh connections across the threadpool, which would mask the real
behaviour we want to assert.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_idempotency import IdempotencyRecord
from packages.core.platform.models_user import User
from packages.core.platform.service_idempotency import (
    idempotency_lookup,
    idempotency_store,
)
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def actor(db_session: Session) -> User:
    company = Company(name="Acme", slug="acme-idem")
    db_session.add(company)
    db_session.commit()
    user = User(
        company_id=company.id,
        email="emp@acme.test",
        full_name="Emp",
        role="employee",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_lookup_returns_none_without_key(db_session: Session, actor: User) -> None:
    assert idempotency_lookup(db_session, actor.id, "POST /x", None) is None
    assert idempotency_lookup(db_session, actor.id, "POST /x", "") is None


def test_lookup_returns_none_when_no_record(
    db_session: Session, actor: User
) -> None:
    assert idempotency_lookup(db_session, actor.id, "POST /x", "abc") is None


def test_store_then_lookup_round_trip(db_session: Session, actor: User) -> None:
    payload = {"id": 7, "status": "approved", "amount": "12.50"}
    idempotency_store(db_session, actor.id, "POST /x", "key-1", payload)
    cached = idempotency_lookup(db_session, actor.id, "POST /x", "key-1")
    assert cached == payload


def test_store_skips_when_no_key(db_session: Session, actor: User) -> None:
    idempotency_store(db_session, actor.id, "POST /x", None, {"foo": 1})
    assert db_session.query(IdempotencyRecord).count() == 0


def test_keys_isolated_per_user(db_session: Session, actor: User) -> None:
    other = User(
        company_id=actor.company_id,
        email="other@a.test",
        full_name="Other",
        role="employee",
    )
    db_session.add(other)
    db_session.commit()
    idempotency_store(db_session, actor.id, "POST /x", "shared", {"who": "actor"})
    idempotency_store(db_session, other.id, "POST /x", "shared", {"who": "other"})
    a = idempotency_lookup(db_session, actor.id, "POST /x", "shared")
    b = idempotency_lookup(db_session, other.id, "POST /x", "shared")
    assert a == {"who": "actor"}
    assert b == {"who": "other"}


def test_keys_isolated_per_route(db_session: Session, actor: User) -> None:
    idempotency_store(db_session, actor.id, "POST /a", "k", {"v": "a"})
    idempotency_store(db_session, actor.id, "POST /b", "k", {"v": "b"})
    assert idempotency_lookup(db_session, actor.id, "POST /a", "k") == {"v": "a"}
    assert idempotency_lookup(db_session, actor.id, "POST /b", "k") == {"v": "b"}


def test_store_handles_decimal_via_default_str(
    db_session: Session, actor: User
) -> None:
    """Decimal payloads must serialise (Pydantic dumps return Decimals)."""
    payload = {"amount": Decimal("12.50")}
    idempotency_store(db_session, actor.id, "POST /x", "dec", payload)
    cached = idempotency_lookup(db_session, actor.id, "POST /x", "dec")
    assert cached == {"amount": "12.50"}


def test_run_helper_short_circuits_on_replay(
    db_session: Session, actor: User
) -> None:
    """The _run wrapper must NOT re-fire the transition on cache hit."""
    from packages.modules.expenses.api.review_actions_router import _run

    expense = Expense(
        company_id=actor.company_id,
        description="X",
        amount=Decimal("10.00"),
        status="draft",
    )
    db_session.add(expense)
    db_session.commit()
    db_session.refresh(expense)

    calls = {"n": 0}

    def fake_transition(db, exp, *, actor_user_id):
        calls["n"] += 1
        return exp

    route = "POST /test/route"
    first = _run(
        fake_transition,
        db_session,
        expense,
        actor_user_id=actor.id,
        route=route,
        idempotency_key="k1",
    )
    second = _run(
        fake_transition,
        db_session,
        expense,
        actor_user_id=actor.id,
        route=route,
        idempotency_key="k1",
    )
    assert calls["n"] == 1, "Cached replay must not re-fire the transition"
    assert first == second
