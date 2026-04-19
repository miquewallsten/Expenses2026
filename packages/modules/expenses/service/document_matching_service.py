"""document_matching_service.py

Matches PDF documents to XML (CFDI) documents using deterministic rules.
No AI.  Scoring is additive; thresholds are explicit constants.
"""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.document_identity_service import (
    extract_pdf_identity,
    extract_xml_identity,
)

# ---------------------------------------------------------------------------
# Score weights
# ---------------------------------------------------------------------------

_W_UUID_EXACT = 60       # UUID present in both and identical
_W_TOTAL_EXACT = 20      # Total amounts identical (to 2 dp)
_W_RFC_ISSUER = 10       # Issuer RFC matches
_W_RFC_RECEIVER = 10     # Receiver RFC matches
_W_STEM_EXACT = 15       # Normalised filename stems are identical
_W_STEM_SUBSTR = 8       # One stem contains the other
_W_DATE_EXACT = 8        # Document dates are identical strings (YYYY-MM-DD prefix)
_W_DATE_CLOSE = 4        # Document dates within 5 calendar days

_STRONG_THRESHOLD = 60   # score >= this → strong match
_POSSIBLE_THRESHOLD = 20 # score >= this → possible match


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _date_prefix(value: str | None) -> str | None:
    """Return the YYYY-MM-DD portion of a datetime string, or None."""
    if not value:
        return None
    return value[:10] if len(value) >= 10 else None


def _date_distance(a: str | None, b: str | None) -> int | None:
    """Absolute day difference between two YYYY-MM-DD strings, or None."""
    if not a or not b:
        return None
    try:
        da = date.fromisoformat(a[:10])
        db = date.fromisoformat(b[:10])
        return abs((da - db).days)
    except ValueError:
        return None


def _round2(value: float | None) -> float | None:
    return round(value, 2) if value is not None else None


# ---------------------------------------------------------------------------
# score_document_match
# ---------------------------------------------------------------------------

def score_document_match(xml_identity: dict, pdf_identity: dict) -> dict:
    """Score how likely *pdf_identity* is the PDF counterpart of *xml_identity*.

    Parameters
    ----------
    xml_identity:
        Output of ``extract_xml_identity``.
    pdf_identity:
        Output of ``extract_pdf_identity``.

    Returns
    -------
    dict with keys:
        score            int   (additive, 0–100+)
        reasons          list[str]
        is_strong_match  bool
        is_possible_match bool
    """
    score = 0
    reasons: list[str] = []

    # -- UUID exact match -------------------------------------------------
    xml_uuid = (xml_identity.get("uuid") or "").upper().strip()
    pdf_uuid = (pdf_identity.get("uuid") or "").upper().strip()
    if xml_uuid and pdf_uuid and xml_uuid == pdf_uuid:
        score += _W_UUID_EXACT
        reasons.append(f"UUID match ({xml_uuid})")

    # -- Total exact match ------------------------------------------------
    xml_total = _round2(xml_identity.get("total"))
    pdf_total = _round2(pdf_identity.get("total"))
    if xml_total is not None and pdf_total is not None and xml_total == pdf_total:
        score += _W_TOTAL_EXACT
        reasons.append(f"Total match ({xml_total})")

    # -- RFC issuer -------------------------------------------------------
    xml_issuer = (xml_identity.get("issuer_rfc") or "").upper().strip()
    pdf_issuer = (pdf_identity.get("issuer_rfc") or "").upper().strip()
    if xml_issuer and pdf_issuer and xml_issuer == pdf_issuer:
        score += _W_RFC_ISSUER
        reasons.append(f"Issuer RFC match ({xml_issuer})")

    # -- RFC receiver -----------------------------------------------------
    xml_receiver = (xml_identity.get("receiver_rfc") or "").upper().strip()
    pdf_receiver = (pdf_identity.get("receiver_rfc") or "").upper().strip()
    if xml_receiver and pdf_receiver and xml_receiver == pdf_receiver:
        score += _W_RFC_RECEIVER
        reasons.append(f"Receiver RFC match ({xml_receiver})")

    # -- Filename stem similarity -----------------------------------------
    xml_stem = xml_identity.get("filename_stem") or ""
    pdf_stem = pdf_identity.get("filename_stem") or ""
    if xml_stem and pdf_stem:
        if xml_stem == pdf_stem:
            score += _W_STEM_EXACT
            reasons.append(f"Filename stem exact match ({xml_stem!r})")
        elif xml_stem in pdf_stem or pdf_stem in xml_stem:
            score += _W_STEM_SUBSTR
            reasons.append(f"Filename stem substring match ({xml_stem!r} / {pdf_stem!r})")

    # -- Document date ----------------------------------------------------
    xml_date = _date_prefix(xml_identity.get("document_date"))
    pdf_date = _date_prefix(pdf_identity.get("document_date"))
    if xml_date and pdf_date:
        if xml_date == pdf_date:
            score += _W_DATE_EXACT
            reasons.append(f"Document date exact match ({xml_date})")
        else:
            dist = _date_distance(xml_date, pdf_date)
            if dist is not None and dist <= 5:
                score += _W_DATE_CLOSE
                reasons.append(f"Document date close ({xml_date} vs {pdf_date}, {dist}d apart)")

    return {
        "score": score,
        "reasons": reasons,
        "is_strong_match": score >= _STRONG_THRESHOLD,
        "is_possible_match": score >= _POSSIBLE_THRESHOLD,
    }


# ---------------------------------------------------------------------------
# find_best_pdf_match_for_xml
# ---------------------------------------------------------------------------

def find_best_pdf_match_for_xml(
    db: Session,
    company_id: int,
    xml_document_id: int,
) -> dict | None:
    """Return the best-matching PDF document for a given XML document.

    Parameters
    ----------
    db:
        Active SQLAlchemy session.
    company_id:
        Scope candidates to this company.
    xml_document_id:
        Primary key of the source XML ``ExpenseDocument``.

    Returns
    -------
    dict | None
        Best-match result dict, or ``None`` if no candidate reaches
        ``_POSSIBLE_THRESHOLD``.

    Return shape::

        {
            "xml_document_id": int,
            "pdf_document_id": int,
            "score": int,
            "reasons": [str, ...],
            "match_level": "strong" | "possible",
        }
    """
    # Load the source XML document
    xml_doc: ExpenseDocument | None = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.id == xml_document_id,
            ExpenseDocument.company_id == company_id,
        )
        .first()
    )
    if xml_doc is None:
        return None

    if xml_doc.document_type != "cfdi_xml":
        return None

    xml_identity = extract_xml_identity(
        filename=xml_doc.filename,
        content_text=xml_doc.content_text or "",
    )

    # Load candidate PDFs for this company (exclude the XML doc itself)
    candidates: list[ExpenseDocument] = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.company_id == company_id,
            ExpenseDocument.id != xml_document_id,
            ExpenseDocument.document_type.in_(["cfdi_pdf", "pdf_unclassified", "ticket"]),
        )
        .all()
    )

    best_score = -1
    best_result: dict | None = None

    for pdf_doc in candidates:
        pdf_identity = extract_pdf_identity(
            filename=pdf_doc.filename,
            content_text=pdf_doc.content_text or None,
        )
        match = score_document_match(xml_identity, pdf_identity)

        if not match["is_possible_match"]:
            continue

        if match["score"] > best_score:
            best_score = match["score"]
            best_result = {
                "xml_document_id": xml_document_id,
                "pdf_document_id": pdf_doc.id,
                "score": match["score"],
                "reasons": match["reasons"],
                "match_level": "strong" if match["is_strong_match"] else "possible",
            }

    return best_result
