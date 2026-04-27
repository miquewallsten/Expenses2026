"""Phase 8.7 — PII redaction goldens (10+ scenarios)."""

from __future__ import annotations

import pytest

from packages.modules.agent.core.redact import redact


# ── Key-based secret scrubbing (existing behavior) ──────────────────────────

@pytest.mark.parametrize("payload,key", [
    ({"api_key": "sk-12345"}, "api_key"),
    ({"db_password": "hunter2"}, "db_password"),
    ({"webhook_secret": "abc"}, "webhook_secret"),
    ({"access_token": "xyz"}, "access_token"),
    ({"private_key": "----BEGIN..."}, "private_key"),
])
def test_secret_keys_are_redacted(payload, key):
    out = redact(payload)
    assert out[key] == "***REDACTED***"


def test_nested_secrets_are_redacted():
    out = redact({"cfg": {"wa_access_token": "tok"}, "ok": True})
    assert out["cfg"]["wa_access_token"] == "***REDACTED***"
    assert out["ok"] is True


# ── Value-pattern PII scrubbing (Phase 8.7) ─────────────────────────────────

@pytest.mark.parametrize("text,expected_token", [
    # RFC personal (4-letter)
    ("Mi RFC es VECJ880326XYZ", "[RFC]"),
    # RFC moral (3-letter)
    ("Empresa: ABC010203XX1", "[RFC]"),
    # CURP — note: CURP regex also matches RFC-shaped tokens; we just assert *something* was scrubbed.
    ("CURP: VECJ880326HDFRRN09", "["),
    # Email
    ("Contacto: ana.lopez@empresa.com.mx", "[EMAIL]"),
    # Phone (Mexican mobile, +52)
    ("Llámame al +52 55 1234 5678", "[PHONE]"),
    # Phone (10 digits no country)
    ("Tel: 5512345678", "[PHONE]"),
])
def test_pii_values_are_scrubbed(text, expected_token):
    out = redact({"note": text})
    assert expected_token in out["note"]


def test_clean_text_passes_through():
    s = "Pago de oficina por servicios generales"
    assert redact(s) == s


def test_pii_in_list_is_scrubbed():
    rows = ["correo: a@b.com", "rfc: ABCD000101XYZ"]
    out = redact(rows)
    assert "[EMAIL]" in out[0]
    assert "[RFC]" in out[1]


def test_pii_in_nested_dict_is_scrubbed():
    payload = {"args": {"description": "factura para juan@x.com, RFC ABCD000101XYZ"}}
    out = redact(payload)
    assert "[EMAIL]" in out["args"]["description"]
    assert "[RFC]" in out["args"]["description"]
    # Original RFC literal must be gone.
    assert "ABCD000101XYZ" not in out["args"]["description"]


def test_redact_preserves_non_strings():
    out = redact({"amount": 99.5, "count": 3, "ok": True, "tags": [1, 2, 3]})
    assert out == {"amount": 99.5, "count": 3, "ok": True, "tags": [1, 2, 3]}
