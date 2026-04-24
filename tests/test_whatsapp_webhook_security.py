"""Phase 0.4 — WhatsApp webhook HMAC verification tests."""
import hashlib
import hmac
import json
import os

import pytest

from packages.modules.channels.api import whatsapp_webhook as ww


@pytest.fixture(autouse=True)
def _set_app_secret(monkeypatch):
    monkeypatch.setattr(ww, "_APP_SECRET", "unit-test-secret")


def _sign(body: bytes, secret: bytes = b"unit-test-secret") -> str:
    digest = hmac.new(secret, body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def test_post_without_signature_returns_401(client):
    body = json.dumps({"entry": []})
    r = client.post(
        "/channels/whatsapp/webhook",
        data=body,
        headers={"content-type": "application/json"},
    )
    assert r.status_code == 401


def test_post_with_wrong_signature_returns_401(client):
    body = json.dumps({"entry": []})
    r = client.post(
        "/channels/whatsapp/webhook",
        data=body,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": "sha256=deadbeef" + "0" * 56,
        },
    )
    assert r.status_code == 401


def test_post_with_valid_signature_returns_200(client):
    body = b'{"entry":[]}'
    r = client.post(
        "/channels/whatsapp/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": _sign(body),
        },
    )
    assert r.status_code == 200


def test_post_malformed_signature_header_returns_401(client):
    body = b'{"entry":[]}'
    r = client.post(
        "/channels/whatsapp/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": "notsha256=abc",
        },
    )
    assert r.status_code == 401


def test_missing_secret_in_prod_rejects(monkeypatch, client):
    monkeypatch.setattr(ww, "_APP_SECRET", "")
    from apps.api.config import settings as app_settings
    monkeypatch.setattr(app_settings, "environment", "production")
    body = b'{"entry":[]}'
    r = client.post(
        "/channels/whatsapp/webhook",
        content=body,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": "sha256=" + "0" * 64,
        },
    )
    assert r.status_code == 401


def test_unresolvable_phone_number_id_is_dropped_not_defaulted(client, db_session, test_company):
    """Ensure the old DEFAULT_COMPANY_ID=1 fallback is gone.

    We send a valid-signature payload whose phone_number_id doesn't match
    any ChannelSettings row. The webhook must return 200 to Meta but must
    NOT attribute the message to company 1.
    """
    from packages.modules.channels.models import ChannelMessage

    body_obj = {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "metadata": {"phone_number_id": "999-unknown"},
                            "messages": [
                                {
                                    "id": "wamid.TEST1",
                                    "from": "5215555555555",
                                    "timestamp": "1700000000",
                                    "type": "text",
                                    "text": {"body": "hello"},
                                }
                            ],
                            "contacts": [
                                {
                                    "profile": {"name": "Test"},
                                    "wa_id": "5215555555555",
                                }
                            ],
                        },
                        "field": "messages",
                    }
                ]
            }
        ]
    }
    raw = json.dumps(body_obj).encode("utf-8")
    r = client.post(
        "/channels/whatsapp/webhook",
        content=raw,
        headers={
            "content-type": "application/json",
            "x-hub-signature-256": _sign(raw),
        },
    )
    assert r.status_code == 200
    # Background task should have dropped the message — no ChannelMessage row
    # should exist for any company.
    count = db_session.query(ChannelMessage).count()
    assert count == 0, "Unresolvable phone_number_id must not be attributed to a default tenant"
