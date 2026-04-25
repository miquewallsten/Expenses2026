"""Phase 1.7 — preference helper + notifier suppression."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from packages.core.platform.models import Company
from packages.core.platform.models_user import User
from packages.modules.channels.models import (
    ChannelSettings,
    NotificationDispatch,
)
from packages.modules.channels.service import notifier as notifier_mod
from packages.modules.channels.service.notifier import (
    NotifyRequest,
    Recipient,
    RenderedMessage,
    send,
)
from packages.modules.channels.service.preferences import (
    is_channel_enabled,
    upsert_preference,
)


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


@pytest.fixture(autouse=True)
def _smtp(monkeypatch):
    monkeypatch.setattr(notifier_mod.smtplib, "SMTP", _StubSMTP)


@pytest.fixture
def setup(db_session: Session) -> dict:
    company = Company(name="Acme", slug="acme")
    db_session.add(company)
    db_session.commit()
    user = User(
        company_id=company.id,
        email="ana@acme.test",
        full_name="Ana",
        role="manager",
    )
    db_session.add(user)
    db_session.add(
        ChannelSettings(
            company_id=company.id,
            channel="email",
            email_smtp_host="smtp.test",
            email_smtp_port=587,
            email_smtp_user="bot",
            email_smtp_password="pw",
            email_smtp_from="bot@acme.test",
        )
    )
    db_session.commit()
    return {"company": company, "user": user}


def test_default_preference_is_enabled(db_session: Session, setup: dict) -> None:
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.submitted", "email"
    ) is True
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.submitted", "whatsapp"
    ) is True


def test_specific_event_disables_email(db_session: Session, setup: dict) -> None:
    upsert_preference(
        db_session,
        user_id=setup["user"].id,
        event_type="expense.submitted",
        email_enabled=False,
    )
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.submitted", "email"
    ) is False
    # Other events unaffected.
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.approved", "email"
    ) is True


def test_wildcard_disables_all_email(db_session: Session, setup: dict) -> None:
    upsert_preference(
        db_session,
        user_id=setup["user"].id,
        event_type="*",
        email_enabled=False,
    )
    for evt in ("expense.submitted", "expense.approved", "anything.else"):
        assert is_channel_enabled(db_session, setup["user"].id, evt, "email") is False


def test_specific_overrides_wildcard(db_session: Session, setup: dict) -> None:
    upsert_preference(
        db_session,
        user_id=setup["user"].id,
        event_type="*",
        email_enabled=False,
    )
    upsert_preference(
        db_session,
        user_id=setup["user"].id,
        event_type="expense.approved",
        email_enabled=True,
    )
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.approved", "email"
    ) is True
    assert is_channel_enabled(
        db_session, setup["user"].id, "expense.submitted", "email"
    ) is False


def test_notifier_skips_when_user_opts_out(
    db_session: Session, setup: dict
) -> None:
    upsert_preference(
        db_session,
        user_id=setup["user"].id,
        event_type="expense.submitted",
        email_enabled=False,
    )
    rows = send(
        db_session,
        NotifyRequest(
            company_id=setup["company"].id,
            event_type="expense.submitted",
            resource_type="expense",
            resource_id=42,
            recipients=[
                Recipient(
                    user_id=setup["user"].id, email=setup["user"].email
                )
            ],
            message=RenderedMessage(
                subject="Hi", text="body", html="<p>body</p>"
            ),
            channels=("email",),
        ),
    )
    assert rows == []
    assert db_session.query(NotificationDispatch).count() == 0


def test_notifier_dispatches_when_enabled(
    db_session: Session, setup: dict
) -> None:
    rows = send(
        db_session,
        NotifyRequest(
            company_id=setup["company"].id,
            event_type="expense.submitted",
            resource_type="expense",
            resource_id=99,
            recipients=[
                Recipient(
                    user_id=setup["user"].id, email=setup["user"].email
                )
            ],
            message=RenderedMessage(
                subject="Hi", text="body", html="<p>body</p>"
            ),
            channels=("email",),
        ),
    )
    assert len(rows) == 1
    assert db_session.query(NotificationDispatch).count() == 1
