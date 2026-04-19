from __future__ import annotations

# ── Keyword sets ──────────────────────────────────────────────────────────────

_CFDI_FILENAME = ("recibo", "factura")

_CFDI_CONTENT = ("uuid", "folio fiscal", "cfdi", "rfc")

_INTL_CONTENT = ("usd", "eur", "invoice", "tax", "vat")
# "$ " with surrounding english words is caught by the presence of other intl signals
_INTL_AMOUNT  = ("$ ",)   # only scores if combined with another intl signal

_TICKET_CONTENT = ("ticket", "cash", "merchant copy", "terminal", "approval", "receipt")

_EVIDENCE_CONTENT = ("boarding", "itinerary", "statement", "transfer", "payment proof")


def _count(text: str, keywords: tuple[str, ...]) -> int:
    return sum(1 for kw in keywords if kw in text)


def analyze_pdf_intake(
    filename: str,
    content_text: str | None,
    company_policy: dict | None = None,
) -> dict:
    """
    Classify an unclassified PDF and suggest a handling action.

    Returns::

        {
            "suggested_type":   str,   # one of the allowed types below
            "confidence":       str,   # "high" | "medium" | "low"
            "suggested_action": str,   # one of the allowed actions below
            "reason":           str,
        }

    Allowed suggested_type:
        cfdi_pdf | international_invoice_pdf | ticket_pdf |
        supporting_evidence_pdf | pdf_unclassified

    Allowed suggested_action:
        pair_with_xml | create_international_expense | create_ticket_expense |
        attach_as_evidence | ask_employee
    """
    lower_name = filename.lower()
    lower_text = (content_text or "").lower()

    # ── Score each category ───────────────────────────────────────────────────

    cfdi_score = 0

    # filename signals (strong)
    if any(tok in lower_name for tok in _CFDI_FILENAME):
        cfdi_score += 2

    # content signals
    cfdi_score += _count(lower_text, _CFDI_CONTENT)

    # international signals
    intl_score = _count(lower_text, _INTL_CONTENT)
    # amount marker only counts when paired with at least one other intl keyword
    if intl_score > 0 and any(tok in lower_text for tok in _INTL_AMOUNT):
        intl_score += 1

    ticket_score = _count(lower_text, _TICKET_CONTENT)

    evidence_score = _count(lower_text, _EVIDENCE_CONTENT)

    # ── Pick winner ───────────────────────────────────────────────────────────

    scores = {
        "cfdi_pdf":                  cfdi_score,
        "international_invoice_pdf": intl_score,
        "ticket_pdf":                ticket_score,
        "supporting_evidence_pdf":   evidence_score,
    }

    best_type = max(scores, key=lambda k: scores[k])
    best_score = scores[best_type]

    # ── Confidence mapping ────────────────────────────────────────────────────

    if best_score >= 3:
        confidence = "high"
    elif best_score == 2:
        confidence = "medium"
    elif best_score == 1:
        confidence = "low"
    else:
        confidence = "low"
        best_type = "pdf_unclassified"

    # Tie between two or more categories → downgrade to ask_employee
    tied = [k for k, v in scores.items() if v == best_score and best_score > 0]
    if len(tied) > 1:
        confidence = "low"
        best_type = "pdf_unclassified"

    # ── Action mapping ────────────────────────────────────────────────────────

    _ACTION_MAP: dict[str, str] = {
        "cfdi_pdf":                  "pair_with_xml",
        "international_invoice_pdf": "create_international_expense",
        "ticket_pdf":                "create_ticket_expense",
        "supporting_evidence_pdf":   "attach_as_evidence",
        "pdf_unclassified":          "ask_employee",
    }

    suggested_action = _ACTION_MAP[best_type]

    # Policy override: if tickets are not allowed, don't suggest creating a ticket
    if (
        best_type == "ticket_pdf"
        and company_policy is not None
        and company_policy.get("tickets_allowed") is False
    ):
        best_type = "pdf_unclassified"
        suggested_action = "ask_employee"
        confidence = "low"

    # ── Reason string ─────────────────────────────────────────────────────────

    _REASON_MAP: dict[str, str] = {
        "cfdi_pdf":                  "Document contains CFDI/fiscal signals; likely a Mexican invoice PDF.",
        "international_invoice_pdf": "Document contains foreign currency or invoice terminology.",
        "ticket_pdf":                "Document matches receipt or point-of-sale ticket patterns.",
        "supporting_evidence_pdf":   "Document appears to be supporting evidence (boarding pass, statement, etc.).",
        "pdf_unclassified":          "Not enough signals to classify; employee should specify the document type.",
    }

    return {
        "suggested_type":   best_type,
        "confidence":       confidence,
        "suggested_action": suggested_action,
        "reason":           _REASON_MAP[best_type],
    }
