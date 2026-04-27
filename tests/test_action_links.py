"""Phase 1.4 — action link create/inspect/consume + endpoint behaviour."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.channels.models import ActionLink
from packages.modules.channels.service.action_links import (
    ActionLinkError,
    consume_token,
    create_action_token,
    inspect_token,
)
from packages.modules.expenses.models.expense import Expense


@pytest.fixture
def setup_actor(db_session: Session) -> dict:
    company = Company(name="Acme", slug="acme")
    db_session.add(company)
    db_session.commit()

    approver = User(
        company_id=company.id,
        email="boss@acme.test",
        full_name="Boss",
        role="manager",
    )
    submitter = User(
        company_id=company.id,
        email="ana@acme.test",
        full_name="Ana",
        role="employee",
    )
    db_session.add_all([approver, submitter])
    db_session.commit()

    expense = Expense(
        company_id=company.id,
        amount=Decimal("99.00"),
        description="Taxi",
        status="submitted",
    )
    db_session.add(expense)
    db_session.commit()

    return {
        "company": company,
        "approver": approver,
        "submitter": submitter,
        "expense": expense,
    }


def test_create_then_inspect(db_session: Session, setup_actor: dict) -> None:
    token, row = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    assert isinstance(token, str) and len(token) > 30
    claims, looked_up = inspect_token(db_session, token)
    assert claims.action == "approve"
    assert claims.resource_id == setup_actor["expense"].id
    assert looked_up.id == row.id
    assert looked_up.used_at is None


def test_consume_marks_used(db_session: Session, setup_actor: dict) -> None:
    token, _row = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    consume_token(db_session, token, ip="1.2.3.4")
    row = db_session.query(ActionLink).first()
    assert row.used_at is not None
    assert row.consumed_ip == "1.2.3.4"


def test_consume_rejects_replay(db_session: Session, setup_actor: dict) -> None:
    token, _row = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    consume_token(db_session, token)
    with pytest.raises(ActionLinkError) as ei:
        consume_token(db_session, token)
    assert ei.value.code == "used"


def test_inspect_rejects_expired(db_session: Session, setup_actor: dict) -> None:
    token, row = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
        ttl_seconds=1,
    )
    # Force DB row expiry into the past so the defence-in-depth path triggers
    # before the JWT exp check (which has 1s granularity).
    row.expires_at = datetime.now(tz=timezone.utc) - timedelta(seconds=10)
    db_session.commit()
    with pytest.raises(ActionLinkError) as ei:
        inspect_token(db_session, token)
    assert ei.value.code == "expired"


def test_inspect_rejects_tampered_token(
    db_session: Session, setup_actor: dict
) -> None:
    token, _row = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    tampered = token[:-2] + ("AA" if not token.endswith("AA") else "BB")
    with pytest.raises(ActionLinkError):
        inspect_token(db_session, tampered)


def test_get_endpoint_renders_confirmation(
    client: TestClient, db_session: Session, setup_actor: dict
) -> None:
    token, _ = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    r = client.get(f"/channels/action/{token}")
    assert r.status_code == 200
    assert "Aprobar" in r.text
    assert "expense #" in r.text


def test_post_endpoint_consumes_and_transitions(
    db_session: Session,
    setup_actor: dict,
    monkeypatch,
) -> None:
    """End-to-end: token → consume → manager_approve transition.

    Bypasses ``TestClient`` because the in-memory SQLite test engine does not
    share connections across threadpool workers (FastAPI sync deps), so we
    invoke the service path directly. Endpoint wiring is covered by the GET
    test plus the negative ``test_post_endpoint_rejects_invalid_token`` path.
    """
    from packages.modules.admin.service.approval_setup_service import (
        get_or_create_approval_setup,
    )
    from packages.modules.admin.service.company_setup_service import (
        get_or_create_company_setup,
    )
    from packages.modules.expenses.service.transition_service import (
        manager_approve_expense,
    )
    from packages.modules.channels.service import notifier as notifier_mod

    cs = get_or_create_company_setup(db_session, setup_actor["company"].id)
    cs.has_managers = True
    ap = get_or_create_approval_setup(db_session, setup_actor["company"].id)
    ap.approval_mode = "manager_only"
    db_session.commit()

    class _StubSMTP:
        def __init__(self, *_a, **_k):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def starttls(self): pass
        def login(self, *_a, **_k): pass
        def send_message(self, *_a, **_k): pass

    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _StubSMTP)

    token, _ = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    claims, _row = consume_token(db_session, token, ip="9.9.9.9")
    assert claims.action == "approve"

    manager_approve_expense(
        db_session, setup_actor["expense"], actor_user_id=claims.user_id
    )
    db_session.refresh(setup_actor["expense"])
    assert setup_actor["expense"].status in ("manager_approved", "approved")

    # Replay must now be rejected.
    with pytest.raises(ActionLinkError) as ei:
        consume_token(db_session, token)
    assert ei.value.code == "used"


def test_post_endpoint_rejects_invalid_token(client: TestClient) -> None:
    r = client.post("/channels/action/not-a-real-token")
    assert r.status_code == 400


def test_get_endpoint_is_mobile_friendly(
    client: TestClient, db_session: Session, setup_actor: dict
) -> None:
    """Phase 6.3 — action page must render with mobile viewport + safe-area padding."""
    token, _ = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    r = client.get(f"/channels/action/{token}")
    assert r.status_code == 200
    assert 'name="viewport"' in r.text
    assert "viewport-fit=cover" in r.text
    assert "env(safe-area-inset-bottom)" in r.text
    assert "min-height:44px" in r.text  # ≥ Apple HIG tap target
    assert 'name="robots"' in r.text  # noindex tokenised pages


def test_get_endpoint_renders_english_when_accept_language_en(
    client: TestClient, db_session: Session, setup_actor: dict
) -> None:
    token, _ = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    r = client.get(
        f"/channels/action/{token}",
        headers={"Accept-Language": "en-US,en;q=0.9"},
    )
    assert r.status_code == 200
    assert 'lang="en"' in r.text
    assert "Approve" in r.text
    assert "Aprobar" not in r.text


def test_get_endpoint_defaults_to_spanish_when_es_present(
    client: TestClient, db_session: Session, setup_actor: dict
) -> None:
    token, _ = create_action_token(
        db_session,
        user_id=setup_actor["approver"].id,
        company_id=setup_actor["company"].id,
        action="approve",
        resource_type="expense",
        resource_id=setup_actor["expense"].id,
    )
    r = client.get(
        f"/channels/action/{token}",
        headers={"Accept-Language": "es-MX,es;q=0.9,en;q=0.5"},
    )
    assert r.status_code == 200
    assert 'lang="es"' in r.text
    assert "Aprobar" in r.text
