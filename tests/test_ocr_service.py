"""Tests for the Phase 8.2 OCR pipeline."""
from __future__ import annotations

from packages.modules.ai.service.ocr_service import extract_fields, extract_text


def test_extract_text_text_plain_decodes_utf8():
    assert extract_text("hola mundo".encode("utf-8"), "text/plain") == "hola mundo"


def test_extract_text_xml_decodes_utf8():
    payload = b"<cfdi:Comprobante Total='123.45'/>"
    out = extract_text(payload, "application/xml")
    assert "Comprobante" in out
    assert "Total='123.45'" in out


def test_extract_text_unknown_mime_returns_empty():
    assert extract_text(b"\x00\x01\x02", "application/octet-stream") == ""


def test_extract_text_empty_bytes_returns_empty():
    assert extract_text(b"", "image/png") == ""


def test_extract_text_image_without_tesseract_returns_empty(monkeypatch):
    """When pytesseract is unavailable, OCR routing must short-circuit safely."""
    import packages.modules.ai.service.ocr_service as ocr

    monkeypatch.setattr(ocr, "_PYTESSERACT_OK", False)
    # 1x1 transparent PNG
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
        b"\x00\x00\x01\x01\x01\x00\x1b\xb6\xee\x56\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    assert extract_text(png, "image/png") == ""


def test_extract_fields_rfc_total_date_merchant():
    text = """LA SUPER COMIDA SA DE CV
RFC: ABC123456XYZ
Subtotal: 100.00
IVA: 16.00
Total $116.00
Fecha: 2026-03-15
"""
    fields = extract_fields(text)
    assert fields.get("rfc") == "ABC123456XYZ"
    assert fields.get("total") == "116.00"
    assert fields.get("date") == "2026-03-15"
    assert fields.get("merchant") == "LA SUPER COMIDA SA DE CV"


def test_extract_fields_handles_european_decimal():
    text = "Importe Total: $1.234,56\nFecha: 15/03/2026"
    fields = extract_fields(text)
    assert fields.get("total") == "1234.56"
    assert fields.get("date") == "15/03/2026"


def test_extract_fields_empty_text_returns_empty_dict():
    assert extract_fields("") == {}
    assert extract_fields("   ") == {}
