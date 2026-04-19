"""document_classification_service.py

Determines what kind of document an uploaded file is, and which expense
intake lane it should enter.  Fully deterministic -- no AI calls.
The ``ai_needed`` flag signals that a downstream AI step could improve
confidence when rule-based classification is uncertain.

document_kind values
--------------------
  cfdi_xml            — valid Mexican CFDI XML
  cfdi_pdf            — PDF whose SAT QR or text content identifies it as a
                        CFDI fiscal receipt; the natural companion to cfdi_xml
  receipt_pdf         — PDF receipt/invoice but NOT a CFDI (generic, intl, etc.)
  supporting_document — non-financial attachment (memo, contract, boarding pass…)
  unknown             — insufficient signals

expense_lane values
-------------------
  pair_candidate      — document should be paired with a counterpart (XML↔PDF)
  new_expense         — standalone expense document, no pairing expected
  supporting_evidence — attached to an existing expense for context
  international_receipt — foreign VAT/GST receipt
  unknown             — cannot determine intake lane

QR-code rule
------------
  QR presence ALONE is not sufficient to call something ``pair_candidate``.
  Only a SAT CFDI QR (verificacfdi.facturaelectronica.sat.gob.mx) counts.
  Generic, marketing, or tracking QR codes are ignored.
"""

from __future__ import annotations

import re

from packages.modules.expenses.service.cfdi_qr_service import extract_cfdi_qr_identity

# ---------------------------------------------------------------------------
# Signal sets
# ---------------------------------------------------------------------------

_CFDI_XML_SIGNALS = (
    "<?xml",
    "<cfdi:",
    "TimbreFiscalDigital",
    "<Comprobante",
    "www.sat.gob.mx",
)

# Text-level CFDI signals found in PDF renders of fiscal receipts.
# These are valid secondary evidence when a QR is absent, but alone they
# only yield medium/low confidence — the QR is the definitive signal.
_CFDI_PDF_SIGNALS = (
    "timbre fiscal digital",
    "comprobante fiscal",
    "sat.gob.mx",
    "uuid:",
    "folio fiscal",
    "sello digital",
    "certificado sat",
)

_RECEIPT_SIGNALS = (
    "total",
    "subtotal",
    "tax",
    "iva",
    "amount due",
    "invoice",
    "factura",
    "receipt",
    "importe",
)

_INTERNATIONAL_SIGNALS = (
    "vat",
    "gst",
    "hst",
    "tax invoice",
    "invoice number",
    "bill to",
)

_NON_FINANCIAL_EXTENSIONS = {
    ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx",
    ".txt", ".rtf", ".png", ".jpg", ".jpeg", ".gif", ".bmp",
    ".zip", ".rar", ".7z", ".csv",
}

_SUPPORTING_KEYWORDS = (
    "memo",
    "policy",
    "agreement",
    "contract",
    "report",
    "itinerary",
    "boarding pass",
    "hotel confirmation",
    "approval",
)

_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _lower(value: str | None) -> str:
    return (value or "").lower()


def _has_any(text: str, signals: tuple) -> bool:
    return any(sig in text for sig in signals)


def _ext(filename: str) -> str:
    """Return lowercased file extension including the dot, or empty string."""
    dot = filename.rfind(".")
    return filename[dot:].lower() if dot != -1 else ""


# ---------------------------------------------------------------------------
# classify_document_lane
# ---------------------------------------------------------------------------

def classify_document_lane(
    filename: str,
    content_text: str | None,
    identity: dict | None = None,
    qr_identity: dict | None = None,
) -> dict:
    """Classify an uploaded document and assign an expense intake lane.

    Parameters
    ----------
    filename:
        Original filename including extension.
    content_text:
        Decoded text content of the file, if available.  May be None for
        binary files that haven't been text-extracted yet.
    identity:
        Optional pre-computed identity dict from ``extract_xml_identity`` or
        ``extract_pdf_identity``.  When present, its fields are used as
        additional signals.
    qr_identity:
        Optional pre-computed CFDI QR identity from ``extract_cfdi_qr_identity``.
        When absent for PDF files, computed internally.  Pass explicitly to
        avoid duplicate extraction when the caller has already done it.

    Returns
    -------
    dict with keys:
        document_kind   : "cfdi_xml" | "cfdi_pdf" | "receipt_pdf"
                          | "supporting_document" | "unknown"
        expense_lane    : "pair_candidate" | "new_expense" | "supporting_evidence"
                          | "international_receipt" | "unknown"
        confidence      : "high" | "medium" | "low"
        reasons         : list[str]
        ai_needed       : bool
    """
    reasons: list[str] = []
    ext = _ext(filename)
    name_lower = _lower(filename)
    text_lower = _lower(content_text)
    has_text = bool(content_text and content_text.strip())

    # Pull convenience values from identity if available
    id_uuid: str | None = (identity or {}).get("uuid")
    id_total: float | None = (identity or {}).get("total")
    id_doc_type: str | None = (identity or {}).get("document_type")

    # ------------------------------------------------------------------
    # 1.  CFDI XML — highest confidence, definitive markers
    # ------------------------------------------------------------------
    is_xml_ext = ext == ".xml" or id_doc_type == "cfdi_xml"
    has_cfdi_xml_content = has_text and _has_any(content_text, _CFDI_XML_SIGNALS)  # type: ignore[arg-type]

    if is_xml_ext:
        reasons.append("File extension is .xml" if ext == ".xml" else "Identity document_type is cfdi_xml")

    if has_cfdi_xml_content:
        reasons.append("Content contains CFDI XML markers")

    if reasons and (is_xml_ext or has_cfdi_xml_content):
        if id_uuid or (has_text and _UUID_RE.search(content_text or "")):
            reasons.append("UUID present in XML content")
            return _result("cfdi_xml", "pair_candidate", "high", reasons, ai_needed=False)
        if id_total is not None:
            reasons.append("Total amount present in XML content")
            return _result("cfdi_xml", "pair_candidate", "high", reasons, ai_needed=False)
        # CFDI markers but no fiscal payload yet
        return _result("cfdi_xml", "pair_candidate", "medium", reasons, ai_needed=False)

    # ------------------------------------------------------------------
    # 2.  PDF path
    # ------------------------------------------------------------------
    if ext == ".pdf" or id_doc_type == "pdf":
        reasons.append("File is a PDF")

        # Compute QR identity if not pre-supplied.
        # Important: we do this ONCE and reuse; never treat non-CFDI QR as
        # a pairing signal.
        if qr_identity is None:
            try:
                qr_identity = extract_cfdi_qr_identity(filename, content_text)
            except Exception:
                qr_identity = None

        # 2a. SAT CFDI QR detected → definitive cfdi_pdf, pair_candidate
        if qr_identity and qr_identity.get("is_cfdi_qr"):
            reasons.append("SAT CFDI QR code detected in PDF")
            qr_uuid = qr_identity.get("uuid")
            if qr_uuid:
                reasons.append(f"QR UUID: {qr_uuid}")
            qr_issuer = qr_identity.get("issuer_rfc")
            if qr_issuer:
                reasons.append(f"QR issuer RFC: {qr_issuer}")
            return _result("cfdi_pdf", "pair_candidate", "high", reasons, ai_needed=False)

        # 2b. CFDI text markers present (QR absent or non-CFDI)
        #     Reduced confidence — text-only evidence is weaker
        if has_text and _has_any(text_lower, _CFDI_PDF_SIGNALS):
            reasons.append("PDF text contains CFDI/SAT markers (no SAT QR detected)")
            if id_uuid or _UUID_RE.search(content_text or ""):
                reasons.append("UUID present in PDF text")
                return _result("cfdi_pdf", "pair_candidate", "medium", reasons, ai_needed=False)
            # CFDI vocabulary but no UUID — might still be a CFDI
            return _result("cfdi_pdf", "pair_candidate", "low", reasons, ai_needed=True)

        # 2c. International receipt signals (non-Mexican VAT systems)
        if has_text and _has_any(text_lower, _INTERNATIONAL_SIGNALS):
            reasons.append("PDF text contains international invoice/VAT markers")
            confidence = "medium" if id_total is not None else "low"
            return _result("receipt_pdf", "international_receipt", confidence, reasons, ai_needed=False)

        # 2d. Generic receipt/invoice signals
        if has_text and _has_any(text_lower, _RECEIPT_SIGNALS):
            reasons.append("PDF text contains generic receipt/invoice markers")
            confidence = "medium" if id_total is not None else "low"
            return _result("receipt_pdf", "new_expense", confidence, reasons, ai_needed=False)

        # 2e. Filename hints without extractable text
        if _has_any(name_lower, ("factura", "invoice", "recibo", "receipt", "ticket")):
            reasons.append("Filename suggests a financial document")
            return _result("receipt_pdf", "new_expense", "low", reasons, ai_needed=True)

        # 2f. PDF but nothing to go on — needs AI
        reasons.append("PDF with no extractable financial signals")
        return _result("unknown", "unknown", "low", reasons, ai_needed=True)

    # ------------------------------------------------------------------
    # 3.  Non-financial file extensions → supporting document
    # ------------------------------------------------------------------
    if ext in _NON_FINANCIAL_EXTENSIONS:
        reasons.append(f"Extension {ext!r} is typically a supporting/non-financial file")
        if has_text and _has_any(text_lower, _SUPPORTING_KEYWORDS):
            reasons.append("Content contains supporting-document keywords")
        return _result("supporting_document", "supporting_evidence", "high", reasons, ai_needed=False)

    # ------------------------------------------------------------------
    # 4.  No extension or unrecognised extension — last-resort text scan
    # ------------------------------------------------------------------
    if has_text:
        if _has_any(content_text, _CFDI_XML_SIGNALS):  # type: ignore[arg-type]
            reasons.append("Content looks like CFDI XML despite unexpected extension")
            return _result("cfdi_xml", "pair_candidate", "medium", reasons, ai_needed=False)

        if _has_any(text_lower, _RECEIPT_SIGNALS):
            reasons.append("Text contains receipt-like signals")
            return _result("receipt_pdf", "new_expense", "low", reasons, ai_needed=True)

    reasons.append("No recognisable document signals found")
    return _result("unknown", "unknown", "low", reasons, ai_needed=True)


# ---------------------------------------------------------------------------
# Internal builder
# ---------------------------------------------------------------------------

def _result(
    document_kind: str,
    expense_lane: str,
    confidence: str,
    reasons: list[str],
    *,
    ai_needed: bool,
) -> dict:
    return {
        "document_kind": document_kind,
        "expense_lane": expense_lane,
        "confidence": confidence,
        "reasons": reasons,
        "ai_needed": ai_needed,
    }
