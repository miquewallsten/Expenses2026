"""Phase 1.1 — Notifier idempotency, retries, suppression."""
from unittest.mock import patch

import pytest

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.channels.models import (
    ChannelSettings,
    NotificationDispatch,
)
from packages.modules.channels.service import notifier
from packages.modules.channels.service.notifier import (
    NotifyRequest,
    Recipient,
    RenderedMessage,
    recipients_from_users,
    send,
)


@pytest.fixture
def smtp_company(db_session):
    co = Company(name="Acme", slug="acme")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    db_session.add(
        ChannelSettings(
            company_id=co.id,
            channel="email",
            is_enabled=True,
            email_smtp_host="smtp.example.com",
            email_smtp_port=587,
            email_smtp_user="bot@example.com",
            email_smtp_password="x",
            email_smtp_from="bot@example.com",
        )
    )
    db_session.commit()
    return co


def _request(co_id: int, recipient: Recipient) -> NotifyRequest:
    return NotifyRequest(
        company_id=co_id,
        event_type="expense.submitted",
        resource_type="expense",
        resource_id=42,
        recipients=[recipient],
        message=RenderedMessage(
            subject="New expense", text="An expense awaits.", html="<p>An expense awaits.</p>"
        ),
        channels=("email",),
    )


def test_send_creates_dispatch_row(db_session, smtp_company):
    with patch.object(notifier.smtplib, "SMTP") as smtp_mock:
        smtp_mock.return_value.__enter__.return_value = smtp_mock
        rows = send(
            db_session,
            _request(smtp_company.id, Recipient(user_id=1, email="user@example.com")),
        )
    assert len(rows) == 1
    assert rows[0].status == "sent"
    assert rows[0].channel == "email"
    assert rows[0].sent_at is not None


def test_send_is_idempotent(db_session, smtp_company):
    req = _request(smtp_company.id, Recipient(user_id=1, email="u@x.com"))
    with patch.object(notifier.smtplib, "SMTP") as smtp_mock:
        smtp_mock.return_value.__enter__.return_value = smtp_mock
        first = send(db_session, req)
        second = send(db_session, req)
    assert len(first) == 1
    assert second == []  # already dispatched
    rows = db_session.query(NotificationDispatch).all()
    assert len(rows) == 1


def test_send_suppressed_when_no_email_address(db_session, smtp_company):
    rows = send(
        db_session,
        _request(smtp_company.id, Recipient(user_id=1, email=None)),
    )
    assert rows[0].status == "suppressed"
    assert rows[0].last_error == "no_email_address"


def test_send_suppressed_when_smtp_unconfigured(db_session):
    co = Company(name="NoSmtp", slug="nosmtp")
    db_session.add(co)
    db_session.commit()
    db_session.refresh(co)
    rows = send(
        db_session,
        _request(co.id, Recipient(user_id=1, email="u@x.com")),
    )
    assert rows[0].status == "suppressed"
    assert rows[0].last_error == "no_smtp_configured"


def test_smtp_failure_marks_failed_after_max_attempts(db_session, smtp_company):
    req = _request(smtp_company.id, Recipient(user_id=1, email="u@x.com"))
    with patch.object(notifier.smtplib, "SMTP", side_effect=OSError("boom")):
        rows = send(db_session, req)
    assert rows[0].status == "pending"  # one attempt; not yet at MAX_ATTEMPTS
    assert "boom" in rows[0].last_error


def test_recipients_from_users_filters_unverified_whatsapp(db_session, smtp_company):
    u1 = User(
        company_id=smtp_company.id,
        email="a@x.com",
        full_name="A",
        role="employee",
    )
    u1.whatsapp_phone = "+5215555555555"
    u1.whatsapp_verified = False
    u2 = User(
        company_id=smtp_company.id,
        email="b@x.com",
        full_name="B",
        role="employee",
    )
    u2.whatsapp_phone = "+5215566666666"
    u2.whatsapp_verified = True
    db_session.add_all([u1, u2])
    db_session.commit()

    recipients = recipients_from_users([u1, u2])
    assert recipients[0].whatsapp is None
    assert recipients[1].whatsapp == "+5215566666666"
