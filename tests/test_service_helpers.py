"""Phase 2.8 — coverage lift for tiny pure-function services.

Targets three previously-0%-coverage helper modules.
"""

from __future__ import annotations

import pytest

from packages.modules.expenses.service.category_normalizer import normalize_category
from packages.modules.expenses.service.mapping_parser import parse_account_mapping
from packages.modules.expenses.service.sat_heuristic_service import run_sat_validation


# ── normalize_category ────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("transport", "travel"),
        ("Lodging", "travel"),
        (" MEALS ", "meals"),
        ("travel", "travel"),
        ("office", "office"),
        ("", ""),
    ],
)
def test_normalize_category_maps_known_and_passes_through_unknown(
    raw: str, expected: str
) -> None:
    assert normalize_category(raw) == expected


def test_normalize_category_handles_none() -> None:
    assert normalize_category(None) is None


# ── parse_account_mapping ─────────────────────────────────────────────────────


def test_parse_account_mapping_basic() -> None:
    text = """
travel -> 6010
meals  ->  6020
office -> 6030
"""
    assert parse_account_mapping(text) == {
        "travel": "6010",
        "meals": "6020",
        "office": "6030",
    }


def test_parse_account_mapping_skips_malformed_lines() -> None:
    text = """
travel -> 6010
no_arrow_here
empty_value ->
-> empty_key
meals -> 6020
"""
    parsed = parse_account_mapping(text)
    assert parsed == {"travel": "6010", "meals": "6020"}


def test_parse_account_mapping_lowercases_keys() -> None:
    assert parse_account_mapping("TRAVEL -> 6010") == {"travel": "6010"}


def test_parse_account_mapping_empty_string() -> None:
    assert parse_account_mapping("") == {}


# ── run_sat_validation ────────────────────────────────────────────────────────


def test_sat_heuristic_detects_cancelled() -> None:
    out = run_sat_validation("This invoice was Cancelled by issuer")
    assert out["sat_status"] == "cancelled"
    assert out["is_valid"] is False


@pytest.mark.parametrize("token", ["uuid", "xml", "factura", "FACTURA", "UUID"])
def test_sat_heuristic_recognises_invoice_tokens(token: str) -> None:
    out = run_sat_validation(f"some text containing {token} in it")
    assert out["sat_status"] == "valid"
    assert out["is_valid"] is True


def test_sat_heuristic_unknown_when_no_signals() -> None:
    out = run_sat_validation("just a plain receipt with no markers")
    assert out["sat_status"] == "unknown"
    assert out["is_valid"] is False
