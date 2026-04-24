"""Phase 0.5 — Email inbound webhook security tests."""
import hashlib
import hmac
import json

import pytest

from packages.modules.channels.api import email_inbound as ei


@pytest.fixture(autouse=True)
def _set_secrets(monkeypatch):
    monkeypatch.setattr(ei, "_INBOUND_SECRET", "inbound-test-secret")
    monkeypatch.setattr(ei, "_MAILGUN_KEY", "mailgun-test-key")


def test_postmark_without_secret_returns_401(client):
    r = client.post(
        "/channels/email/inbound?provider=postmark",
        json={"From": "a@x.com", "To": "b@y.com", "TextBody": "hi"},
    )
    assert r.status_code == 401


def test_sendgrid_without_secret_returns_401(client):
    r = client.post(
        "/channels/email/inbound?provider=sendgrid",
        data={"from": "a@x.com", "to": "b@y.com", "text": "hi"},
    )
    assert r.status_code == 401


def test_postmark_with_valid_header_secret_returns_200(client):
    r = client.post(
        "/channels/email/inbound?provider=postmark",
        json={"From": "a@x.com", "To": "nobody@unknown.tld", "TextBody": "hi"},
        headers={"x-inbound-secret": "inbound-test-secret"},
    )
    assert r.status_code == 200


def test_postmark_with_valid_query_secret_returns_200(client):
    r = client.post(
        "/channels/email/inbound?provider=postmark&secret=inbound-test-secret",
        json={"From": "a@x.com", "To": "nobody@unknown.tld", "TextBody": "hi"},
    )
    assert r.status_code == 200


def test_mailgun_without_signature_returns_401(client):
    r = client.post(
        "/channels/email/inbound?provider=mailgun",
        data={"sender": "a@x.com", "recipient": "b@y.com", "body-plain": "hi"},
    )
    assert r.status_code == 401


def test_mailgun_with_valid_signature_returns_200(client):
    ts, token = "1700000000", "abc123"
    sig = hmac.new(
        b"mailgun-test-key", f"{ts}{token}".encode(), hashlib.sha256
    ).hexdigest()
    r = client.post(
        "/channels/email/inbound?provider=mailgun",
        data={
            "sender": "a@x.com",
            "recipient": "b@y.com",
            "body-plain": "hi",
            "timestamp": ts,
            "token": token,
            "signature": sig,
        },
    )
    assert r.status_code == 200


def test_mailgun_with_wrong_signature_returns_401(client):
    r = client.post(
        "/channels/email/inbound?provider=mailgun",
        data={
            "sender": "a@x.com",
            "recipient": "b@y.com",
            "body-plain": "hi",
            "timestamp": "1700000000",
            "token": "abc123",
            "signature": "deadbeef",
        },
    )
    assert r.status_code == 401


def test_unregistered_recipient_is_dropped_not_defaulted(client, db_session, test_company):
    from packages.modules.channels.models import ChannelMessage

    # test_company exists with id=1; but no ChannelSettings row exists → dropped.
    r = client.post(
        "/channels/email/inbound?provider=postmark",
        json={
            "From": "sender@x.com",
            "To": "nobody@unregistered.tld",
            "TextBody": "hi",
            "MessageID": "msg-1",
        },
        headers={"x-inbound-secret": "inbound-test-secret"},
    )
    assert r.status_code == 200
    count = db_session.query(ChannelMessage).count()
    assert count == 0, "Unregistered recipient must not default to tenant 1"


def test_missing_shared_secret_in_prod_rejects(monkeypatch, client):
    monkeypatch.setattr(ei, "_INBOUND_SECRET", "")
    from apps.api.config import settings as app_settings
    monkeypatch.setattr(app_settings, "environment", "production")
    r = client.post(
        "/channels/email/inbound?provider=postmark",
        json={"From": "a@x.com", "To": "b@y.com", "TextBody": "hi"},
    )
    assert r.status_code == 401
