"""document_triage_service.py

Combines identity extraction, deterministic matching, and classification
into a single triage decision for an uploaded document.

Never raises -- returns a safe error-state dict on infrastructure failure.

Triage pipeline
---------------
Step A  Detect document type from extension and content.
Step B  XML path  — extract CFDI identity, find matching PDF.
Step C  PDF path (CFDI QR detected) — extract QR identity, find matching XML
        via cfdi_pairing_service (UUID-level certainty first).
Step D  PDF path (no CFDI QR) — classify as receipt / supporting doc /
        international receipt using text signals; fall back to AI only when
        ALL of the following hold:
          • confidence is still "low" after deterministic classification
          • no strong (UUID-level) match was found by the fuzzy XML matcher
          • the document kind was not determined by SAT QR (Step C) or XML
            parsing (Step B)

        AI scope in Step D is intentionally narrow:
          • kind : receipt_pdf | supporting_document | unknown
          • lane : new_expense | supporting_evidence | international_receipt | unknown
          • action: create_expense | store_as_evidence | ask_user
        AI must NOT suggest pair_candidate, cfdi_xml, cfdi_pdf, or any
        pairing action — those are reserved for deterministic paths.

─────────────────────────────────────────────────────────────────────────────
DEVELOPER SMOKE-TEST NOTES
─────────────────────────────────────────────────────────────────────────────
Scoring thresholds (document_matching_service.py):
  score ≥ 60  →  strong  (UUID match alone is 60 pts)
  score ≥ 20  →  possible
  score <  20 →  no match returned

All tests: POST /expenses/documents  →  GET /expenses/document-triage/{id}?company_id=1

─── Scenario 1 · Momento PDF + XML (paired CFDI) ────────────────────────────
Represents the ideal happy path: PDF carries a SAT verification QR, XML was
uploaded first.

  XML upload (filename: "momento-ABCD1234.xml"):
    content_text must include:
      tfd:TimbreFiscalDigital UUID="<uuid>" (e.g. A1B2C3D4-…-…)
      Total="1234.56"  EmisorRFC="MOME123456ABC"  ReceptorRFC="RECR987654XYZ"

    Expected triage →
      document_kind: cfdi_xml | expense_lane: pair_candidate | confidence: high
      recommended_action: wait_for_pair          (before PDF arrives)
                       or create_expense_with_pair (after PDF arrives, strong)
      match_candidate: { match_level: "strong", pdf_document_id: <N> } or null

  PDF upload (filename: "momento-ABCD1234.pdf"):
    content_text must include the SAT verification URL:
      https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx
        ?id=A1B2C3D4-…  &re=MOME123456ABC  &rr=RECR987654XYZ
        &tt=1234.56  &fe=ABCDEFGH
    • QR UUID must match the XML UUID exactly for a "high" confidence pair.

    Expected triage →
      document_kind: cfdi_pdf | expense_lane: pair_candidate | confidence: high
      recommended_action: attach_to_existing  (if XML already present)
                       or wait_for_pair        (if XML not yet uploaded)
      match_candidate: { confidence: "high", xml_document_id: <N> }

─── Scenario 2 · Telcel / Telmex factura (CFDI with UUID in text) ───────────
PDF may embed the SAT QR or just have CFDI text markers; XML is the
authoritative source.

  XML upload (filename: "telcel-factura-2026-03.xml"):
    content_text includes UUID, EmisorRFC="TME960709LD5" (Telmex),
    Total, ReceptorRFC.

    Expected triage →
      document_kind: cfdi_xml | confidence: high
      recommended_action: wait_for_pair / create_expense_with_pair (as above)

  PDF upload — SAT QR present (filename: "telcel-factura-2026-03.pdf"):
    content_text includes SAT verification URL with same UUID as XML.
    Expected triage → same as Scenario 1 PDF (Step C, high confidence).

  PDF upload — no QR, but UUID visible in text:
    content_text: "Folio Fiscal: A1B2C3D4-… RFC Emisor: TME960709LD5 Total: $1,234.56"
    • No SAT QR → Step D (generic PDF path).
    • Fuzzy matcher sees matching RFC + Total → score ≥ 20 (possible match).
    Expected triage →
      document_kind: cfdi_pdf (text-signal CFDI markers) or receipt_pdf
      confidence: medium
      recommended_action: ask_user  (possible but not UUID-confirmed)
      match_candidate: { match_level: "possible", xml_document_id: <N> }

─── Scenario 3 · Telmex estado de cuenta / generic receipt (non-CFDI QR) ───
Estado de cuenta PDFs often have QR codes that are NOT SAT CFDI verification
URLs (e.g. payment portal links, barcode URIs).

  PDF upload (filename: "telmex-estado-cuenta-2026-03.pdf"):
    content_text includes a QR URL such as:
      https://portalempresarial.telmex.com/pago?ref=123456
    or a plain numeric barcode string.

    • cfdi_qr_service.extract_cfdi_qr_identity() checks is_cfdi_qr;
      non-SAT QR → is_cfdi_qr = False → Step D (generic PDF path).
    • Text signals: no UUID, no RFC pattern → receipt_pdf or unknown, low conf.
    • Fuzzy XML match unlikely unless amount/RFC happen to align.

    Expected triage →
      document_kind: receipt_pdf | confidence: low  (or unknown if no signals)
      recommended_action: ask_user  (or create_expense if AI lifts confidence)
      match_candidate: null
    CRITICAL: must NOT produce document_kind=cfdi_pdf or pair_candidate lane.

─── Scenario 4 · Costco XML + PDF ──────────────────────────────────────────
Large-ticket retailer; customer typically receives both XML and a paper/PDF
receipt.  Costco RFCs: CST980707A69 (various branches).

  XML upload (filename: "costco-factura-2026-03.xml"):
    content_text includes UUID, EmisorRFC="CST980707A69", Total="5678.90",
    ReceptorRFC of the employee's company.

    Expected triage →
      document_kind: cfdi_xml | confidence: high
      recommended_action: wait_for_pair / create_expense_with_pair

  PDF upload — SAT QR present:
    Identical flow to Scenario 1 PDF; UUID match → high confidence pair.

  PDF upload — "CFDI" printed in body, no QR:
    content_text: "Comprobante Fiscal Digital … RFC: CST980707A69 … Total $5,678.90"
    • No SAT QR → Step D.
    • CFDI text markers detected → document_kind=cfdi_pdf (text-signal path).
    • Fuzzy match on RFC + Total → possible match if XML already uploaded.

    Expected triage →
      document_kind: cfdi_pdf | confidence: medium
      recommended_action: ask_user  (text-signal pair, not UUID-confirmed)
      match_candidate: { match_level: "possible", xml_document_id: <N> } or null
    NOTE: confidence must NOT be promoted to "high" without UUID confirmation.

─── General expected outcomes reference ─────────────────────────────────────

  SAT CFDI QR confirmed (Step C):
    document_kind: cfdi_pdf | expense_lane: pair_candidate | confidence: high

  CFDI XML well-formed (Step B):
    document_kind: cfdi_xml | expense_lane: pair_candidate | confidence: high

  Generic PDF, no signals (Step D, AI off or insufficient):
    document_kind: unknown | confidence: low | recommended_action: ask_user

  AI refinement (Step D, confidence==low, no strong match):
    May change kind to receipt_pdf or supporting_document,
    lane to new_expense / international_receipt / supporting_evidence,
    action to create_expense / store_as_evidence / ask_user.
    AI cannot produce cfdi_pdf, cfdi_xml, pair_candidate, or pairing actions.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.service.cfdi_pairing_service import (
    find_best_xml_match_for_pdf,
)
from packages.modules.expenses.service.cfdi_qr_service import extract_cfdi_qr_identity
from packages.modules.expenses.service.document_classification_service import (
    classify_document_lane,
)
from packages.modules.expenses.service.document_identity_service import (
    extract_pdf_identity,
    extract_xml_identity,
)
from packages.modules.expenses.service.document_matching_service import (
    find_best_pdf_match_for_xml,
    score_document_match,
)

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AI fallback — set to False to disable entirely without touching call sites
# ---------------------------------------------------------------------------

AI_TRIAGE_ENABLED: bool = True

# ---------------------------------------------------------------------------
# Recommended actions (exhaustive set)
# ---------------------------------------------------------------------------

ACTION_CREATE_EXPENSE      = "create_expense"
ACTION_CREATE_WITH_PAIR    = "create_expense_with_pair"
ACTION_ATTACH_EXISTING     = "attach_to_existing"
ACTION_WAIT_FOR_PAIR       = "wait_for_pair"
ACTION_ASK_USER            = "ask_user"
ACTION_STORE_AS_EVIDENCE   = "store_as_evidence"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def triage_uploaded_document(
    db: Session,
    company_id: int,
    document_id: int,
) -> dict:
    """Run the full triage pipeline for a single uploaded document.

    Pipeline
    --------
    Step A  Detect document type (XML / CFDI PDF / other PDF / other).
    Step B  XML path   — extract CFDI XML identity, look for matching PDF.
    Step C  CFDI PDF   — extract SAT QR identity, look for matching XML via
                         cfdi_pairing_service (UUID-first, deterministic).
    Step D  Other PDF  — classify by text signals; AI only if confidence low.

    Parameters
    ----------
    db:
        Active SQLAlchemy session.
    company_id:
        Owning company — used to scope candidate searches.
    document_id:
        Primary key of the uploaded ``ExpenseDocument``.

    Returns
    -------
    dict with keys:
        document_id          int
        document_kind        str   cfdi_xml | cfdi_pdf | receipt_pdf |
                                   supporting_document | unknown
        expense_lane         str   pair_candidate | new_expense |
                                   supporting_evidence | international_receipt | unknown
        confidence           str   high | medium | low
        match_candidate      dict | None
        recommended_action   str   create_expense | create_expense_with_pair |
                                   attach_to_existing | wait_for_pair |
                                   ask_user | store_as_evidence
        reasons              list[str]
    """
    # ── Load document ──────────────────────────────────────────────────────
    doc: ExpenseDocument | None = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.id == document_id,
            ExpenseDocument.company_id == company_id,
        )
        .first()
    )
    if doc is None:
        return _error_result(document_id, "Document not found")

    filename     = doc.filename or ""
    content_text = doc.content_text or None

    # ══════════════════════════════════════════════════════════════════════
    # Step A — detect document type
    # ══════════════════════════════════════════════════════════════════════
    is_xml = _is_xml(filename, content_text)
    is_pdf = _is_pdf(filename)

    # ══════════════════════════════════════════════════════════════════════
    # Step B — CFDI XML path
    # ══════════════════════════════════════════════════════════════════════
    if is_xml:
        return _triage_xml(db, company_id, document_id, filename, content_text)

    # ══════════════════════════════════════════════════════════════════════
    # Step C / D — PDF path
    # ══════════════════════════════════════════════════════════════════════
    if is_pdf:
        return _triage_pdf(db, company_id, document_id, filename, content_text)

    # ══════════════════════════════════════════════════════════════════════
    # Non-XML, non-PDF (supporting documents, images, etc.)
    # ══════════════════════════════════════════════════════════════════════
    return _triage_other(document_id, filename, content_text)


# ---------------------------------------------------------------------------
# Step B — XML triage
# ---------------------------------------------------------------------------

def _triage_xml(
    db: Session,
    company_id: int,
    document_id: int,
    filename: str,
    content_text: str | None,
) -> dict:
    reasons: list[str] = []

    # Extract CFDI XML identity
    try:
        identity = extract_xml_identity(filename, content_text or "")
    except Exception:
        _log.exception("triage xml: identity extraction failed for document %s", document_id)
        identity = {}

    # Classify (pass identity so classification can skip re-parse)
    try:
        classification = classify_document_lane(filename, content_text, identity)
    except Exception:
        _log.exception("triage xml: classification failed for document %s", document_id)
        classification = _unknown_classification("Classification error")

    document_kind = classification["document_kind"]
    expense_lane  = classification["expense_lane"]
    confidence    = classification["confidence"]
    reasons.extend(classification["reasons"])

    # Look for a matching PDF counterpart
    match_candidate: dict | None = None
    try:
        match_candidate = find_best_pdf_match_for_xml(db, company_id, document_id)
        if match_candidate:
            reasons.append(
                f"PDF match found (doc {match_candidate['pdf_document_id']}, "
                f"score {match_candidate['score']}, "
                f"level={match_candidate['match_level']})"
            )
        else:
            reasons.append("No paired PDF found yet")
    except Exception:
        _log.exception("triage xml: PDF matching failed for document %s", document_id)

    # Recommended action
    if document_kind == "cfdi_xml":
        if match_candidate and match_candidate["match_level"] == "strong":
            action = ACTION_CREATE_WITH_PAIR
        elif match_candidate:
            # Possible but unconfirmed pair — ask user to confirm
            action = ACTION_ASK_USER
        else:
            # No PDF found yet — park and wait
            action = ACTION_WAIT_FOR_PAIR
    else:
        # XML that doesn't look like CFDI
        action = ACTION_ASK_USER

    reasons.append(f"Recommended action: {action}")
    return {
        "document_id":        document_id,
        "document_kind":      document_kind,
        "expense_lane":       expense_lane,
        "confidence":         confidence,
        "match_candidate":    match_candidate,
        "recommended_action": action,
        "reasons":            reasons,
    }


# ---------------------------------------------------------------------------
# Step C / D — PDF triage
# ---------------------------------------------------------------------------

def _triage_pdf(
    db: Session,
    company_id: int,
    document_id: int,
    filename: str,
    content_text: str | None,
) -> dict:
    reasons: list[str] = []

    # ── Step C: try CFDI QR first ──────────────────────────────────────────
    qr_identity: dict | None = None
    try:
        qr_identity = extract_cfdi_qr_identity(filename, content_text)
    except Exception:
        _log.exception("triage pdf: QR extraction failed for document %s", document_id)

    if qr_identity and qr_identity.get("is_cfdi_qr"):
        return _triage_cfdi_pdf(
            db, company_id, document_id, filename, content_text,
            qr_identity=qr_identity, reasons=reasons,
        )

    # ── Step D: no CFDI QR — classify by text signals ─────────────────────
    return _triage_generic_pdf(
        db, company_id, document_id, filename, content_text,
        qr_identity=qr_identity, reasons=reasons,
    )


def _triage_cfdi_pdf(
    db: Session,
    company_id: int,
    document_id: int,
    filename: str,
    content_text: str | None,
    *,
    qr_identity: dict,
    reasons: list[str],
) -> dict:
    """Step C — PDF with a confirmed SAT CFDI QR."""
    reasons.append("SAT CFDI QR detected — using QR-based XML matching")

    qr_uuid = qr_identity.get("uuid")
    if qr_uuid:
        reasons.append(f"QR UUID: {qr_uuid}")

    # Find matching XML via cfdi_pairing_service (UUID-level certainty first)
    match_candidate: dict | None = None
    try:
        match_candidate = find_best_xml_match_for_pdf(db, company_id, document_id)
        if match_candidate:
            reasons.append(
                f"XML match found (doc {match_candidate['xml_document_id']}, "
                f"confidence={match_candidate['confidence']})"
            )
        else:
            reasons.append("No matching XML found yet")
    except Exception:
        _log.exception("triage cfdi_pdf: XML matching failed for document %s", document_id)

    # Action
    if match_candidate and match_candidate["confidence"] == "high":
        action = ACTION_ATTACH_EXISTING
    elif match_candidate:
        action = ACTION_ASK_USER
    else:
        action = ACTION_WAIT_FOR_PAIR

    reasons.append(f"Recommended action: {action}")
    return {
        "document_id":        document_id,
        "document_kind":      "cfdi_pdf",
        "expense_lane":       "pair_candidate",
        "confidence":         "high",
        "match_candidate":    match_candidate,
        "recommended_action": action,
        "reasons":            reasons,
    }


def _triage_generic_pdf(
    db: Session,
    company_id: int,
    document_id: int,
    filename: str,
    content_text: str | None,
    *,
    qr_identity: dict | None,
    reasons: list[str],
) -> dict:
    """Step D — PDF with no SAT CFDI QR."""
    reasons.append("No SAT CFDI QR detected — using text-signal classification")

    # Extract PDF identity for fuzzy matching
    try:
        identity = extract_pdf_identity(filename, content_text)
    except Exception:
        _log.exception("triage generic_pdf: identity extraction failed for document %s", document_id)
        identity = {}

    # Classify using text signals; pass pre-computed qr_identity to avoid
    # duplicate extraction inside classify_document_lane
    try:
        classification = classify_document_lane(
            filename, content_text, identity, qr_identity=qr_identity
        )
    except Exception:
        _log.exception("triage generic_pdf: classification failed for document %s", document_id)
        classification = _unknown_classification("Classification error")

    document_kind = classification["document_kind"]
    expense_lane  = classification["expense_lane"]
    confidence    = classification["confidence"]
    reasons.extend(classification["reasons"])

    # Try fuzzy XML matching for anything that might be a CFDI-related PDF
    match_candidate: dict | None = None
    if document_kind in ("cfdi_pdf", "receipt_pdf", "unknown"):
        try:
            match_candidate = _find_best_xml_match_for_pdf_fuzzy(
                db, company_id, document_id, identity
            )
            if match_candidate:
                reasons.append(
                    f"XML fuzzy match found (doc {match_candidate['xml_document_id']}, "
                    f"score {match_candidate['score']}, "
                    f"level={match_candidate['match_level']})"
                )
        except Exception:
            _log.exception("triage generic_pdf: fuzzy XML match failed for document %s", document_id)

    # Determine action (deterministic; AI only as last resort)
    action = _recommend_action_pdf(
        document_kind=document_kind,
        expense_lane=expense_lane,
        confidence=confidence,
        match_candidate=match_candidate,
        ai_needed=classification.get("ai_needed", False),
    )

    # ── Optional AI refinement (Step D only) ─────────────────────────────
    # AI runs ONLY when all three gates pass:
    #   1. confidence is still "low" (deterministic signals were insufficient)
    #   2. no strong/UUID match was found (don't overwrite a deterministic pair)
    #   3. classification itself flagged ai_needed
    # AI may NOT override: cfdi_xml, cfdi_pdf kinds; pair_candidate lane;
    # or any pairing action.  Those are locked by Steps B and C.
    _has_strong_match = bool(
        match_candidate and match_candidate.get("match_level") == "strong"
    )
    _ai_gate = (
        AI_TRIAGE_ENABLED
        and classification.get("ai_needed")
        and confidence == "low"
        and not _has_strong_match
        and content_text
    )
    if _ai_gate:
        try:
            ai_result = _ai_refine_triage(
                filename=filename,
                content_text=content_text,
                current_kind=document_kind,
                current_lane=expense_lane,
                current_action=action,
            )
            if ai_result:
                document_kind = ai_result.get("document_kind", document_kind)
                expense_lane  = ai_result.get("expense_lane", expense_lane)
                action        = ai_result.get("recommended_action", action)
                reasons.append(
                    f"AI refined: kind={document_kind} lane={expense_lane} action={action}"
                )
        except Exception:
            _log.exception(
                "triage generic_pdf: AI refinement failed for document %s — keeping deterministic result",
                document_id,
            )

    reasons.append(f"Recommended action: {action}")
    return {
        "document_id":        document_id,
        "document_kind":      document_kind,
        "expense_lane":       expense_lane,
        "confidence":         confidence,
        "match_candidate":    match_candidate,
        "recommended_action": action,
        "reasons":            reasons,
    }


# ---------------------------------------------------------------------------
# Non-PDF, non-XML (supporting documents, images, …)
# ---------------------------------------------------------------------------

def _triage_other(document_id: int, filename: str, content_text: str | None) -> dict:
    try:
        classification = classify_document_lane(filename, content_text)
    except Exception:
        _log.exception("triage other: classification failed for document %s", document_id)
        classification = _unknown_classification("Classification error")

    document_kind = classification["document_kind"]
    expense_lane  = classification["expense_lane"]
    confidence    = classification["confidence"]
    reasons: list[str] = list(classification["reasons"])

    if document_kind == "supporting_document" or expense_lane == "supporting_evidence":
        action = ACTION_STORE_AS_EVIDENCE
    else:
        action = ACTION_ASK_USER

    reasons.append(f"Recommended action: {action}")
    return {
        "document_id":        document_id,
        "document_kind":      document_kind,
        "expense_lane":       expense_lane,
        "confidence":         confidence,
        "match_candidate":    None,
        "recommended_action": action,
        "reasons":            reasons,
    }


# ---------------------------------------------------------------------------
# Action derivation (generic PDF / Step D)
# ---------------------------------------------------------------------------

def _recommend_action_pdf(
    *,
    document_kind: str,
    expense_lane: str,
    confidence: str,
    match_candidate: dict | None,
    ai_needed: bool,
) -> str:
    if document_kind == "supporting_document" or expense_lane == "supporting_evidence":
        return ACTION_STORE_AS_EVIDENCE

    if document_kind == "cfdi_pdf":
        # Was classified as CFDI PDF by text signals (no QR), but got here via
        # Step D — treat the same as pair_candidate
        if match_candidate and match_candidate["match_level"] == "strong":
            return ACTION_ATTACH_EXISTING
        if match_candidate:
            return ACTION_ASK_USER
        return ACTION_WAIT_FOR_PAIR

    if document_kind == "receipt_pdf":
        if match_candidate and match_candidate["match_level"] == "strong":
            return ACTION_ATTACH_EXISTING
        if match_candidate:
            return ACTION_ASK_USER
        if expense_lane in ("new_expense", "international_receipt") and confidence in ("high", "medium"):
            return ACTION_CREATE_EXPENSE
        return ACTION_ASK_USER

    # unknown or anything else
    return ACTION_ASK_USER


# ---------------------------------------------------------------------------
# AI refinement hook
# ---------------------------------------------------------------------------

# AI is restricted to the non-deterministic subset of values.
# cfdi_xml and cfdi_pdf kinds are determined by SAT QR (Step C) or XML
# parsing (Step B) — AI must not claim those.  pair_candidate lane and
# all pairing actions are also off-limits for AI.
_AI_ALLOWED_KINDS: frozenset[str] = frozenset({
    "receipt_pdf", "supporting_document", "unknown",
})
_AI_ALLOWED_LANES: frozenset[str] = frozenset({
    "new_expense", "supporting_evidence", "international_receipt", "unknown",
})
_AI_ALLOWED_ACTIONS: frozenset[str] = frozenset({
    ACTION_CREATE_EXPENSE,
    ACTION_STORE_AS_EVIDENCE,
    ACTION_ASK_USER,
})

_SYSTEM_PROMPT = (
    "You are a financial document classifier for an enterprise expense management platform. "
    "You receive a document filename and a short text excerpt from a PDF that has already "
    "been confirmed NOT to be a CFDI XML and NOT to contain a SAT CFDI QR code. "
    "Your task is to decide between the remaining ambiguous document types. "
    "Reply ONLY with a JSON object (no markdown, no explanation) with exactly these keys: "
    '"document_kind", "expense_lane", "recommended_action". '
    "Allowed document_kind values: receipt_pdf, supporting_document, unknown. "
    "Do NOT output cfdi_xml or cfdi_pdf — those are determined by other systems. "
    "Allowed expense_lane values: new_expense, supporting_evidence, international_receipt, unknown. "
    "Do NOT output pair_candidate — that lane is reserved for CFDI-paired documents. "
    "Allowed recommended_action values: create_expense, store_as_evidence, ask_user. "
    "Do NOT output pairing actions (create_expense_with_pair, attach_to_existing, wait_for_pair). "
    "If the document appears to be a foreign-currency or non-Mexican receipt, "
    "use expense_lane=international_receipt with recommended_action=create_expense. "
    "If it looks like a supporting attachment rather than an expense, "
    "use document_kind=supporting_document with recommended_action=store_as_evidence."
)


def _ai_refine_triage(
    filename: str,
    content_text: str,
    current_kind: str,
    current_lane: str,
    current_action: str,
) -> dict | None:
    """Call the local Ollama model to refine a low-confidence triage result.

    Only called from Step D (_triage_generic_pdf) after all deterministic
    signals have been exhausted.  The returned dict is filtered against
    ``_AI_ALLOWED_KINDS``, ``_AI_ALLOWED_LANES``, and ``_AI_ALLOWED_ACTIONS``
    so AI can never claim a document is CFDI XML/PDF, introduce
    pair_candidate lane, or suggest any pairing action.

    Specifically, AI may help decide:
      - receipt_pdf vs supporting_document
      - new_expense vs store_as_evidence vs ask_user
      - whether expense_lane should be international_receipt

    AI must NOT and cannot override:
      - UUID exact match results (guarded at call site)
      - deterministic CFDI pairing (never called from Steps B or C)
      - XML parsing results (never called from Step B)

    Returns a partial dict with allowed field values, or None if AI is
    unavailable, times out, or returns unparseable output.

    To disable AI refinement globally, set ``AI_TRIAGE_ENABLED = False``.
    """
    try:
        from apps.api.ai.ollama_client import chat_with_ollama, resolve_model
    except ImportError:
        return None

    if resolve_model() is None:
        return None

    excerpt = content_text[:800].strip()
    user_prompt = (
        f"Filename: {filename}\n"
        f"Current classification: kind={current_kind}, lane={current_lane}, action={current_action}\n"
        f"Document excerpt:\n{excerpt}"
    )

    response = chat_with_ollama(_SYSTEM_PROMPT, user_prompt)
    if not response.get("ok"):
        return None

    raw = response.get("content", "").strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1].lstrip("json").strip()

    try:
        parsed = json.loads(raw)
    except (ValueError, TypeError):
        _log.warning("triage: AI returned non-JSON for '%s': %s", filename, raw[:200])
        return None

    result: dict = {}
    if parsed.get("document_kind") in _AI_ALLOWED_KINDS:
        result["document_kind"] = parsed["document_kind"]
    if parsed.get("expense_lane") in _AI_ALLOWED_LANES:
        result["expense_lane"] = parsed["expense_lane"]
    if parsed.get("recommended_action") in _AI_ALLOWED_ACTIONS:
        result["recommended_action"] = parsed["recommended_action"]

    if result:
        _log.debug(
            "triage: AI accepted fields for '%s': %s",
            filename, list(result.keys()),
        )
    return result if result else None


# ---------------------------------------------------------------------------
# Fuzzy PDF → XML reverse match (text-identity based, not QR-based)
# ---------------------------------------------------------------------------

def _find_best_xml_match_for_pdf_fuzzy(
    db: Session,
    company_id: int,
    pdf_document_id: int,
    pdf_identity: dict,
) -> dict | None:
    """Score all company XML documents against *pdf_identity* and return the best.

    Uses ``score_document_match`` (filename stem, date, RFC, total, UUID).
    This is the fallback when no CFDI QR is present in the PDF.
    """
    xml_candidates: list[ExpenseDocument] = (
        db.query(ExpenseDocument)
        .filter(
            ExpenseDocument.company_id == company_id,
            ExpenseDocument.id != pdf_document_id,
            ExpenseDocument.document_type == "cfdi_xml",
        )
        .all()
    )

    best_score = -1
    best_result: dict | None = None

    for xml_doc in xml_candidates:
        xml_identity = extract_xml_identity(
            filename=xml_doc.filename,
            content_text=xml_doc.content_text or "",
        )
        match = score_document_match(xml_identity, pdf_identity)

        if not match["is_possible_match"]:
            continue

        if match["score"] > best_score:
            best_score = match["score"]
            best_result = {
                "xml_document_id": xml_doc.id,
                "pdf_document_id": pdf_document_id,
                "score": match["score"],
                "reasons": match["reasons"],
                "match_level": "strong" if match["is_strong_match"] else "possible",
            }

    return best_result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _is_xml(filename: str, content_text: str | None) -> bool:
    if filename.lower().endswith(".xml"):
        return True
    if content_text:
        head = content_text[:500]
        return "<?xml" in head or "<cfdi:" in head or "<Comprobante" in head
    return False


def _is_pdf(filename: str) -> bool:
    return filename.lower().endswith(".pdf")


def _unknown_classification(reason: str) -> dict:
    return {
        "document_kind": "unknown",
        "expense_lane":  "unknown",
        "confidence":    "low",
        "reasons":       [reason],
        "ai_needed":     True,
    }


def _error_result(document_id: int, reason: str) -> dict:
    return {
        "document_id":        document_id,
        "document_kind":      "unknown",
        "expense_lane":       "unknown",
        "confidence":         "low",
        "match_candidate":    None,
        "recommended_action": ACTION_ASK_USER,
        "reasons":            [reason],
    }
