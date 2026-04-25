"""Phase 4.2 — Public Platform API + outbound webhooks."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.expenses.models.expense import Expense
from packages.modules.integrations.models import Integration
from packages.modules.integrations.models_public_api import (
    PlatformApiKey,
    WebhookDelivery,
    WebhookSubscription,
)
from packages.modules.integrations.service.api_keys import (
    generate_api_key,
    has_scope,
    revoke_api_key,
    verify_api_key,
)
from packages.modules.integrations.service.webhooks import (
    canonical_body,
    emit_event,
    sign,
)


@pytest.fixture
def co_with_key(db_session: Session) -> dict:
    co = Company(name="Pub", slug="pub")
    db_session.add(co)
    db_session.commit()
    user = User(
        company_id=co.id, email="admin@pub.test", full_name="Admin", role="admin"
    )
    db_session.add(user)
    db_session.commit()
    row, plaintext = generate_api_key(
        db_session,
        company_id=co.id,
        name="ERP",
        scopes=["expenses:read", "masterdata:read", "payments:write"],
        created_by_user_id=user.id,
    )
    return {"company": co, "user": user, "key": row, "plaintext": plaintext}


# ── API key service ─────────────────────────────────────────────────────────


def test_generate_key_stores_hash_not_plaintext(co_with_key: dict) -> None:
    row = co_with_key["key"]
    plaintext = co_with_key["plaintext"]
    assert plaintext.startswith("foplat_")
    assert row.hashed_secret != plaintext
    assert row.key_prefix == plaintext[:8]


def test_verify_api_key_round_trip(db_session: Session, co_with_key: dict) -> None:
    row = verify_api_key(db_session, co_with_key["plaintext"])
    assert row is not None
    assert row.id == co_with_key["key"].id
    assert row.last_used_at is not None


def test_verify_rejects_unknown_and_revoked(
    db_session: Session, co_with_key: dict
) -> None:
    assert verify_api_key(db_session, "foplat_doesnotexist") is None
    assert verify_api_key(db_session, None) is None
    assert verify_api_key(db_session, "no-prefix-key") is None
    assert revoke_api_key(
        db_session, co_with_key["key"].id, company_id=co_with_key["company"].id
    )
    assert verify_api_key(db_session, co_with_key["plaintext"]) is None


def test_has_scope_wildcards() -> None:
    row = PlatformApiKey(
        company_id=1, key_prefix="x", hashed_secret="x", name="t",
        scopes=["expenses:*", "masterdata:read"],
    )
    assert has_scope(row, "expenses:read")
    assert has_scope(row, "expenses:write")
    assert has_scope(row, "masterdata:read")
    assert not has_scope(row, "payments:write")
    row.scopes = ["*"]
    assert has_scope(row, "anything:goes")


# ── Public API (HTTP) ───────────────────────────────────────────────────────
#
# We avoid TestClient for any test that touches the DB: the SQLite in-memory
# test engine uses fresh connections across FastAPI's threadpool which would
# mask correctness. Auth/scope failure paths (no DB hit before raise) are the
# only routes safe to drive via TestClient. Everything else calls the route
# function directly with the test session.


def _hdr(plaintext: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {plaintext}"}


def test_v1_expenses_requires_bearer(client: TestClient) -> None:
    resp = client.get("/api/v1/expenses")
    assert resp.status_code == 401


def test_v1_expenses_lists_only_company(
    db_session: Session, co_with_key: dict
) -> None:
    from packages.modules.integrations.public_api_router import list_expenses

    co_id = co_with_key["company"].id
    db_session.add_all([
        Expense(company_id=co_id, amount=Decimal("10.00"), description="A", status="approved"),
        Expense(company_id=co_id, amount=Decimal("20.00"), description="B", status="approved"),
        Expense(company_id=999, amount=Decimal("99.00"), description="leak", status="approved"),
    ])
    db_session.commit()
    page = list_expenses(
        status="approved",
        cursor=None,
        limit=50,
        api_key=co_with_key["key"],
        db=db_session,
    )
    assert {item.description for item in page.items} == {"A", "B"}


def test_v1_expenses_scope_required(db_session: Session) -> None:
    from packages.modules.integrations.public_api_router import require_scope

    co = Company(name="X", slug="x-scope")
    db_session.add(co)
    db_session.commit()
    weak_row, _ = generate_api_key(
        db_session, company_id=co.id, name="weak", scopes=["masterdata:read"]
    )
    dep = require_scope("expenses:read")
    with pytest.raises(Exception) as excinfo:
        dep(api_key=weak_row)
    # FastAPI HTTPException 403
    assert getattr(excinfo.value, "status_code", None) == 403


def test_v1_payment_status_idempotent(
    db_session: Session, co_with_key: dict
) -> None:
    from packages.modules.integrations.public_api_router import (
        PaymentStatusBody,
        report_payment_status,
    )

    co_id = co_with_key["company"].id
    expense = Expense(
        company_id=co_id, amount=Decimal("33.00"), description="taxi", status="approved"
    )
    integration = Integration(
        company_id=co_id, kind="erp", vendor="contpaqi", name="Contpaqi"
    )
    db_session.add_all([expense, integration])
    db_session.commit()

    body1 = PaymentStatusBody(
        integration_id=integration.id,
        erp_payment_reference="REF-100",
        erp_payment_date=datetime(2026, 4, 20).date(),
        erp_status="paid",
    )
    r1 = report_payment_status(
        expense_id=expense.id, body=body1, api_key=co_with_key["key"], db=db_session
    )
    body2 = PaymentStatusBody(
        integration_id=integration.id,
        erp_payment_reference="REF-101",
        erp_status="paid",
    )
    r2 = report_payment_status(
        expense_id=expense.id, body=body2, api_key=co_with_key["key"], db=db_session
    )
    assert r1.id == r2.id
    assert r2.erp_payment_reference == "REF-101"


def test_v1_payment_status_cross_company_404(
    db_session: Session, co_with_key: dict
) -> None:
    from fastapi import HTTPException

    from packages.modules.integrations.public_api_router import (
        PaymentStatusBody,
        report_payment_status,
    )

    foreign = Expense(
        company_id=999, amount=Decimal("1.00"), description="x", status="approved"
    )
    integration = Integration(
        company_id=co_with_key["company"].id, kind="erp", vendor="x", name="x",
    )
    db_session.add_all([foreign, integration])
    db_session.commit()

    body = PaymentStatusBody(integration_id=integration.id, erp_status="paid")
    with pytest.raises(HTTPException) as excinfo:
        report_payment_status(
            expense_id=foreign.id,
            body=body,
            api_key=co_with_key["key"],
            db=db_session,
        )
    assert excinfo.value.status_code == 404


# ── Webhooks ────────────────────────────────────────────────────────────────


def test_sign_is_deterministic_and_changes_with_input() -> None:
    body = canonical_body({"a": 1, "b": [2, 3]})
    s1 = sign("secret", "1700000000", "nonce-a", body)
    s2 = sign("secret", "1700000000", "nonce-a", body)
    assert s1 == s2
    assert s1 != sign("other", "1700000000", "nonce-a", body)
    assert s1 != sign("secret", "1700000001", "nonce-a", body)
    assert s1 != sign("secret", "1700000000", "nonce-b", body)


def test_emit_event_creates_delivery_only_for_matching(
    db_session: Session, co_with_key: dict
) -> None:
    co_id = co_with_key["company"].id
    sub_match = WebhookSubscription(
        company_id=co_id,
        event_type="expense.approved",
        target_url="https://example.test/hook",
        secret="s1",
    )
    sub_wildcard = WebhookSubscription(
        company_id=co_id,
        event_type="*",
        target_url="https://example.test/hook2",
        secret="s2",
    )
    sub_other = WebhookSubscription(
        company_id=co_id,
        event_type="poliza.ready",
        target_url="https://example.test/hook3",
        secret="s3",
    )
    sub_disabled = WebhookSubscription(
        company_id=co_id,
        event_type="expense.approved",
        target_url="https://example.test/hook4",
        secret="s4",
        is_enabled=False,
    )
    sub_other_company = WebhookSubscription(
        company_id=999,
        event_type="*",
        target_url="https://example.test/hook5",
        secret="s5",
    )
    db_session.add_all(
        [sub_match, sub_wildcard, sub_other, sub_disabled, sub_other_company]
    )
    db_session.commit()

    deliveries = emit_event(
        db_session,
        company_id=co_id,
        event_type="expense.approved",
        resource_type="expense",
        resource_id=42,
        payload={"id": 42, "amount": "100.00"},
    )
    assert len(deliveries) == 2
    sub_ids = {d.subscription_id for d in deliveries}
    assert sub_ids == {sub_match.id, sub_wildcard.id}
    for d in deliveries:
        assert d.status == "pending"
        assert d.nonce
        assert d.payload["id"] == 42
