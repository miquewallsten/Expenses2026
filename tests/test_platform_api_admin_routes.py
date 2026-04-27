"""Phase 4.2 admin slice — platform API key + webhook subscription routes."""
from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.integrations.models_public_api import (
    PlatformApiKey,
    WebhookSubscription,
)
from packages.modules.integrations.service.api_keys import generate_api_key


@pytest.fixture
def co(db_session: Session) -> Company:
    c = Company(name="PA42", slug="pa42")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


def _admin(db_session: Session, co: Company) -> User:
    u = User(full_name="A", email="a-pa42@test.com", role="admin", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _emp(db_session: Session, co: Company) -> User:
    u = User(full_name="E", email="e-pa42@test.com", role="employee", company_id=co.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


# ── API keys ────────────────────────────────────────────────────────────────


def test_list_api_keys_admin_only(client, db_session, co):
    emp = _emp(db_session, co)
    r = client.get(
        f"/admin/platform-api/{co.id}/keys", headers={"X-User-Id": str(emp.id)}
    )
    assert r.status_code == 403


def test_create_api_key_returns_plaintext_once(client, db_session, co):
    admin = _admin(db_session, co)
    r = client.post(
        f"/admin/platform-api/{co.id}/keys",
        json={"name": "ERP Bridge", "scopes": ["expenses:read", "masterdata:read"]},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["plaintext"].startswith("foplat_")
    assert body["row"]["name"] == "ERP Bridge"
    assert body["row"]["scopes"] == ["expenses:read", "masterdata:read"]
    assert body["row"]["revoked_at"] is None
    # Listing must NOT leak plaintext.
    rl = client.get(
        f"/admin/platform-api/{co.id}/keys", headers={"X-User-Id": str(admin.id)}
    )
    assert rl.status_code == 200
    items = rl.json()
    assert len(items) == 1
    assert "plaintext" not in items[0]
    assert items[0]["key_prefix"] == body["row"]["key_prefix"]


def test_revoke_api_key(client, db_session, co):
    admin = _admin(db_session, co)
    row, _ = generate_api_key(
        db_session, company_id=co.id, name="x", scopes=["*"], created_by_user_id=admin.id
    )
    r = client.delete(
        f"/admin/platform-api/{co.id}/keys/{row.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200
    db_session.expire_all()
    fresh = db_session.query(PlatformApiKey).get(row.id)
    assert fresh.revoked_at is not None


def test_revoke_api_key_cross_company_404(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="Other", slug="other42")
    db_session.add(other)
    db_session.commit()
    row, _ = generate_api_key(
        db_session, company_id=other.id, name="x", scopes=["*"]
    )
    # Admin in `co` tries to revoke a key in `other` via co-scoped URL.
    r = client.delete(
        f"/admin/platform-api/{co.id}/keys/{row.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404


# ── Webhook subscriptions ──────────────────────────────────────────────────


def test_create_webhook_returns_secret_once(client, db_session, co):
    admin = _admin(db_session, co)
    r = client.post(
        f"/admin/platform-api/{co.id}/webhooks",
        json={
            "event_type": "expense.approved",
            "target_url": "https://example.test/hook",
            "description": "ERP",
        },
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["secret"]
    assert body["row"]["event_type"] == "expense.approved"
    assert body["row"]["is_enabled"] is True
    # Listing masks the secret.
    rl = client.get(
        f"/admin/platform-api/{co.id}/webhooks", headers={"X-User-Id": str(admin.id)}
    )
    assert rl.status_code == 200
    items = rl.json()
    assert "secret" not in items[0]
    assert "…" in items[0]["secret_preview"]


def test_update_webhook_toggles_enabled(client, db_session, co):
    admin = _admin(db_session, co)
    row = WebhookSubscription(
        company_id=co.id, event_type="*", target_url="https://e.test/h",
        secret="s" * 40, is_enabled=True,
    )
    db_session.add(row)
    db_session.commit()
    r = client.patch(
        f"/admin/platform-api/{co.id}/webhooks/{row.id}",
        json={"is_enabled": False, "description": "paused"},
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 200
    assert r.json()["is_enabled"] is False
    assert r.json()["description"] == "paused"


def test_delete_webhook_cross_company_404(client, db_session, co):
    admin = _admin(db_session, co)
    other = Company(name="OtherW", slug="otherw42")
    db_session.add(other)
    db_session.commit()
    row = WebhookSubscription(
        company_id=other.id, event_type="*", target_url="https://o.test/h",
        secret="s" * 40, is_enabled=True,
    )
    db_session.add(row)
    db_session.commit()
    r = client.delete(
        f"/admin/platform-api/{co.id}/webhooks/{row.id}",
        headers={"X-User-Id": str(admin.id)},
    )
    assert r.status_code == 404
