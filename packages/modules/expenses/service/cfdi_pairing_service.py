"""cfdi_pairing_service.py

Pairs CFDI XML documents with their companion PDFs using deterministic rules.

Sources of truth (in priority order):
  1. CFDI QR code embedded in the PDF (via cfdi_qr_service) — UUID-level certainty.
  2. Direct field comparison — issuer RFC, receiver RFC, total.

No AI.  Never raises — returns None / is_match=False on any failure.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.cfdi_qr_service import extract_cfdi_qr_identity
from packages.modules.expenses.service.document_identity_service import extract_xml_identity

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

_TOTAL_TOLERANCE = 0.02   # floating-point slop for total comparison (2 cents)


def _norm(value: str | None) -> str:
    return (value or "").strip().upper()


def _totals_match(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return False
    return abs(a - b) <= _TOTAL_TOLERANCE


# ---------------------------------------------------------------------------
# match_pdf_to_xml_by_cfdi_identity
# ---------------------------------------------------------------------------

def match_pdf_to_xml_by_cfdi_identity(
    xml_identity: dict,
    pdf_qr_identity: dict | None,
) -> dict:
    """Compare a parsed XML identity against a PDF's CFDI QR identity.

    Parameters
    ----------
    xml_identity:
        Output of ``extract_xml_identity`` for the XML document.
    pdf_qr_identity:
        Output of ``extract_cfdi_qr_identity`` for the PDF, or ``None`` when
        no CFDI QR was found in the PDF.

    Returns
    -------
    dict::

        {
            "is_match":       bool,
            "confidence":     "high" | "low",
            "match_reason":   str,
            "uuid_match":     bool,
            "issuer_match":   bool,
            "receiver_match": bool,
            "total_match":    bool,
        }

    Confidence rules
    ----------------
    * ``"high"`` when the UUID is present in both sides and identical — this
      is an exact fiscal match regardless of other fields.
    * ``"high"`` when UUID is absent from one or both sides but **all three**
      of {issuer RFC, receiver RFC, total} match — strong circumstantial match.
    * ``"low"`` for any partial match (two out of three fields, etc.).
    * Not a match at all when fewer than two strong fields align.
    """
    _no_match = {
        "is_match":       False,
        "confidence":     "low",
        "match_reason":   "No CFDI QR identity available for PDF",
        "uuid_match":     False,
        "issuer_match":   False,
        "receiver_match": False,
        "total_match":    False,
    }

    if pdf_qr_identity is None or not pdf_qr_identity.get("is_cfdi_qr"):
        return _no_match

    xml_uuid    = _norm(xml_identity.get("uuid"))
    qr_uuid     = _norm(pdf_qr_identity.get("uuid"))
    xml_issuer  = _norm(xml_identity.get("issuer_rfc"))
    qr_issuer   = _norm(pdf_qr_identity.get("issuer_rfc"))
    xml_recvr   = _norm(xml_identity.get("receiver_rfc"))
    qr_recvr    = _norm(pdf_qr_identity.get("receiver_rfc"))
    xml_total   = xml_identity.get("total")
    qr_total    = pdf_qr_identity.get("total")

    uuid_match     = bool(xml_uuid and qr_uuid and xml_uuid == qr_uuid)
    issuer_match   = bool(xml_issuer and qr_issuer and xml_issuer == qr_issuer)
    receiver_match = bool(xml_recvr and qr_recvr and xml_recvr == qr_recvr)
    total_match    = _totals_match(xml_total, qr_total)

    # ── Path 1: UUID exact match ─────────────────────────────────────────────
    if uuid_match:
        return {
            "is_match":       True,
            "confidence":     "high",
            "match_reason":   f"UUID exact match ({xml_uuid})",
            "uuid_match":     True,
            "issuer_match":   issuer_match,
            "receiver_match": receiver_match,
            "total_match":    total_match,
        }

    # ── Path 2: All three field matches (UUID absent) ────────────────────────
    strong_field_count = sum([issuer_match, receiver_match, total_match])

    if strong_field_count == 3:
        parts = []
        if issuer_match:   parts.append(f"issuer RFC={xml_issuer}")
        if receiver_match: parts.append(f"receiver RFC={xml_recvr}")
        if total_match:    parts.append(f"total={xml_total}")
        return {
            "is_match":       True,
            "confidence":     "high",
            "match_reason":   "All fields match: " + ", ".join(parts),
            "uuid_match":     False,
            "issuer_match":   issuer_match,
            "receiver_match": receiver_match,
            "total_match":    total_match,
        }

    # ── Path 3: Partial match (two fields) — low confidence ─────────────────
    if strong_field_count == 2:
        parts = []
        if issuer_match:   parts.append("issuer RFC")
        if receiver_match: parts.append("receiver RFC")
        if total_match:    parts.append("total")
        return {
            "is_match":       True,
            "confidence":     "low",
            "match_reason":   "Partial match: " + " + ".join(parts),
            "uuid_match":     False,
            "issuer_match":   issuer_match,
            "receiver_match": receiver_match,
            "total_match":    total_match,
        }

    # ── No match ─────────────────────────────────────────────────────────────
    return {
        "is_match":       False,
        "confidence":     "low",
        "match_reason":   "Insufficient field overlap",
        "uuid_match":     False,
        "issuer_match":   issuer_match,
        "receiver_match": receiver_match,
        "total_match":    total_match,
    }


# ---------------------------------------------------------------------------
# find_best_xml_match_for_pdf
# ---------------------------------------------------------------------------

def find_best_xml_match_for_pdf(
    db: Session,
    company_id: int,
    pdf_document_id: int,
) -> dict | None:
    """Find the best-matching CFDI XML document for a given PDF.

    Uses the CFDI QR identity extracted from the PDF's content_text as the
    primary comparison signal.  Falls back to ``None`` when the PDF contains
    no parseable CFDI QR payload.

    Parameters
    ----------
    db:
        Active SQLAlchemy session.
    company_id:
        Restricts candidate XML documents to this company.
    pdf_document_id:
        Primary key of the source PDF ``ExpenseDocument``.

    Returns
    -------
    dict | None
        Best-match result, or ``None`` if no high-confidence match is found.

    Return shape::

        {
            "pdf_document_id": int,
            "xml_document_id": int,
            "confidence":      "high" | "low",
            "match_reason":    str,
            "pdf_qr_identity": dict,
        }
    """
    # ── Load the PDF document ────────────────────────────────────────────────
    pdf_doc: ExpenseDocument | None = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.id == pdf_document_id,
            ExpenseDocument.company_id == company_id,
        )
        .first()
    )
    if pdf_doc is None:
        return None

    if not pdf_doc.filename.lower().endswith(".pdf"):
        return None

    # ── Extract CFDI QR identity from PDF text ───────────────────────────────
    pdf_qr_identity = extract_cfdi_qr_identity(
        filename=pdf_doc.filename,
        content_text=pdf_doc.content_text or None,
    )
    if pdf_qr_identity is None:
        return None

    # ── Load candidate XML documents for this company ────────────────────────
    xml_candidates: list[ExpenseDocument] = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.company_id == company_id,
            ExpenseDocument.id != pdf_document_id,
            ExpenseDocument.document_type == "cfdi_xml",
        )
        .all()
    )

    # ── Score each candidate; prefer high confidence, then field count ────────
    # Curveball guard: when multiple XMLs share the same issuer/receiver/total
    # (e.g. a recurring Jan/Feb/Mar invoice for the same amount), a
    # non-UUID field match would tie. We also pull the PDF's own text-extracted
    # identity (date + filename stem) so we can break the tie instead of
    # picking whichever candidate the DB returned first.
    from packages.modules.expenses.service.document_identity_service import (
        extract_pdf_identity,
    )
    pdf_text_identity: dict = {}
    try:
        pdf_text_identity = extract_pdf_identity(
            filename=pdf_doc.filename,
            content_text=pdf_doc.content_text or None,
        ) or {}
    except Exception:  # noqa: BLE001
        pdf_text_identity = {}

    pdf_date_iso = (pdf_text_identity.get("document_date") or "")[:10] or None
    pdf_stem     = (pdf_text_identity.get("filename_stem") or "").lower()

    best_result: dict | None = None
    best_priority = -1   # (2=high uuid, 1=high fields, 0=low partial)
    best_tiebreak = -1   # higher = stronger disambiguator (date, stem)
    ambiguous_non_uuid = False   # set when we see >1 high-field candidates

    for xml_doc in xml_candidates:
        xml_identity = extract_xml_identity(
            filename=xml_doc.filename,
            content_text=xml_doc.content_text or "",
        )
        result = match_pdf_to_xml_by_cfdi_identity(xml_identity, pdf_qr_identity)

        if not result["is_match"]:
            continue

        # Priority: high+uuid > high+fields > low
        if result["confidence"] == "high" and result["uuid_match"]:
            priority = 2
        elif result["confidence"] == "high":
            priority = 1
        else:
            priority = 0

        # Tiebreak score for same-priority candidates (RFC+total-only matches):
        # +2 if XML date matches PDF's text-extracted date (YYYY-MM-DD)
        # +1 if filename stems overlap
        tiebreak = 0
        xml_date_iso = (xml_identity.get("document_date") or "")[:10] or None
        if pdf_date_iso and xml_date_iso and pdf_date_iso == xml_date_iso:
            tiebreak += 2
        xml_stem = (xml_identity.get("filename_stem") or "").lower()
        if pdf_stem and xml_stem and (pdf_stem == xml_stem or pdf_stem in xml_stem or xml_stem in pdf_stem):
            tiebreak += 1

        if priority > best_priority or (priority == best_priority and tiebreak > best_tiebreak):
            # Track whether a same-priority high-fields match displaced another
            if priority == 1 and best_priority == 1:
                ambiguous_non_uuid = True
            best_priority = priority
            best_tiebreak = tiebreak
            best_result = {
                "pdf_document_id": pdf_document_id,
                "xml_document_id": xml_doc.id,
                "confidence":      result["confidence"],
                "match_reason":    result["match_reason"],
                "pdf_qr_identity": pdf_qr_identity,
            }

        # Short-circuit: UUID-level certainty cannot be beaten
        if best_priority == 2:
            break

    # Ambiguity guard: multiple non-UUID matches with no date/stem disambiguator
    # → downgrade confidence so callers don't auto-pair blindly.
    if best_result is not None and best_priority == 1 and ambiguous_non_uuid and best_tiebreak == 0:
        best_result["confidence"]   = "low"
        best_result["match_reason"] = (
            f"{best_result['match_reason']} (ambiguous — multiple candidates share the same "
            f"issuer/receiver/total; no date or filename disambiguator available)"
        )

    return best_result
