"""Tests for the channels email template renderer."""

from __future__ import annotations

import pytest

from packages.modules.channels.render import (
    list_available_templates,
    render_email,
)


@pytest.fixture
def magic_link_ctx() -> dict:
    return {
        "user": type("U", (), {"full_name": "Ana López"})(),
        "ttl_minutes": 15,
        "link": "https://app.example.com/auth/verify?token=abc123",
        "footer_text": "Acme",
    }


@pytest.fixture
def expense_ctx() -> dict:
    expense = type(
        "E",
        (),
        {
            "amount": "1250.00",
            "currency": "MXN",
            "description": "Comida con cliente",
            "expense_date": "2026-01-15",
            "submitted_at": "2026-01-13",
        },
    )()
    submitter = type("U", (), {"full_name": "Ana López"})()
    approver = type("U", (), {"full_name": "Bruno García"})()
    return {
        "expense": expense,
        "submitter": submitter,
        "approver": approver,
        "link": "https://app.example.com/expense/42",
    }


def test_list_available_templates_returns_all_eight() -> None:
    names = list_available_templates()
    expected = {
        "magic_link",
        "expense_submitted_to_approver",
        "expense_approved_to_submitter",
        "expense_rejected_to_submitter",
        "expense_returned_to_submitter",
        "approval_nudge_48h",
        "daily_digest_approver",
        "payment_sent_to_employee",
    }
    assert set(names) == expected


def test_render_magic_link_es(magic_link_ctx: dict) -> None:
    msg = render_email("magic_link", "es", magic_link_ctx)
    assert msg.subject == "Tu enlace de acceso"
    assert "Hola Ana López" in msg.text
    assert "15 minutos" in msg.text
    assert magic_link_ctx["link"] in msg.text
    assert "Iniciar sesión" in msg.html
    assert magic_link_ctx["link"] in msg.html


def test_render_magic_link_en(magic_link_ctx: dict) -> None:
    msg = render_email("magic_link", "en", magic_link_ctx)
    assert msg.subject == "Your sign-in link"
    assert "Hi Ana López" in msg.text
    assert "Sign in" in msg.html


def test_render_expense_submitted_includes_amount_and_link(expense_ctx: dict) -> None:
    msg = render_email("expense_submitted_to_approver", "es", expense_ctx)
    assert "Bruno García" in msg.text
    assert "1250.00" in msg.html
    assert "MXN" in msg.html
    assert expense_ctx["link"] in msg.html


def test_render_expense_rejected_renders_reason(expense_ctx: dict) -> None:
    ctx = {**expense_ctx, "reason": "Falta CFDI"}
    msg = render_email("expense_rejected_to_submitter", "es", ctx)
    assert "rechazó" in msg.text or "rechazó" in msg.html
    assert "Falta CFDI" in msg.html


def test_render_daily_digest_iterates_items(expense_ctx: dict) -> None:
    items = [
        type(
            "I",
            (),
            {
                "amount": "500",
                "currency": "MXN",
                "description": "Taxi",
                "submitter_name": "Ana",
            },
        )(),
        type(
            "I",
            (),
            {
                "amount": "1200",
                "currency": "MXN",
                "description": "Hotel",
                "submitter_name": "Carlos",
            },
        )(),
    ]
    ctx = {
        "approver": expense_ctx["approver"],
        "items": items,
        "link": "https://app.example.com/inbox",
    }
    msg = render_email("daily_digest_approver", "es", ctx)
    assert "2 gasto" in msg.subject
    assert "Taxi" in msg.html
    assert "Hotel" in msg.html


def test_unknown_locale_falls_back_to_default_es(magic_link_ctx: dict) -> None:
    msg = render_email("magic_link", "fr", magic_link_ctx)
    assert msg.subject == "Tu enlace de acceso"


def test_html_extends_shared_layout(magic_link_ctx: dict) -> None:
    msg = render_email("magic_link", "es", magic_link_ctx)
    # Shared layout markers
    assert "<!DOCTYPE html>" in msg.html
    assert 'class="card"' in msg.html
    assert 'class="btn"' in msg.html
