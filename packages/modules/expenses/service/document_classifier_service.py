"""Document classifier — Phase 8.11.

Coarse-grained classification for an uploaded document into one of:

    receipt | invoice | cfdi_xml | statement | other

Pipeline:
  1. Strong rule signals on extracted text (CFDI markers, SAT QR URLs,
     statement keywords, ticket/receipt keywords).
  2. Embedding-based kNN lookup against past documents in the same company
     (DocumentEmbedding rows with ``meta.label``). Weighted vote among
     neighbours that exceed a similarity floor.
  3. Combine: a high-confidence rule wins outright; otherwise the kNN vote
     can override a weak rule. Falls back to ``other`` if nothing fires.

Returns a dict with ``label``, ``confidence`` (0–1), ``method``
(``rule`` | ``knn`` | ``default``), ``rule_hits`` and ``neighbours`` for
audit/debug. Never raises.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session


LABELS = ("receipt", "invoice", "cfdi_xml", "statement", "other")

_RULE_HIGH_CONF = 0.85
_KNN_K = 5
_KNN_SIM_FLOOR = 0.2
_KNN_MIN_CONF = 0.4


def _rule_signals(content_text: str | None, filename: str | None = None) -> tuple[str | None, float, list[str]]:
    text = (content_text or "").lower()
    fn = (filename or "").lower()
    hits: list[str] = []

    # CFDI XML — the structural markers are unambiguous.
    if "cfdi:comprobante" in text or "tfd:timbrefiscaldigital" in text:
        hits.append("cfdi_xml_marker")
        return "cfdi_xml", 0.95, hits
    if fn.endswith(".xml") and ("comprobante" in text or "uuid=" in text):
        hits.append("xml_extension+comprobante")
        return "cfdi_xml", 0.9, hits

    # SAT verification URL — the PDF representation of a CFDI invoice.
    if "verificacfdi.facturaelectronica.sat.gob.mx" in text:
        hits.append("sat_qr_url")
        return "invoice", 0.9, hits

    # Bank/credit-card statement keywords.
    if "estado de cuenta" in text or "account statement" in text:
        hits.append("statement_keyword")
        return "statement", 0.85, hits
    if "saldo anterior" in text and "saldo actual" in text:
        hits.append("statement_balances")
        return "statement", 0.85, hits

    # Invoice keywords (factura) — weaker than CFDI markers.
    if "factura" in text and ("rfc emisor" in text or "uso cfdi" in text):
        hits.append("factura_keyword")
        return "invoice", 0.7, hits

    # Receipt / ticket keywords.
    if "ticket" in text or "recibo de compra" in text:
        hits.append("receipt_keyword")
        return "receipt", 0.6, hits
    if "gracias por su compra" in text or "thank you for your purchase" in text:
        hits.append("thank_you_keyword")
        return "receipt", 0.6, hits

    return None, 0.0, hits


def _knn_vote(
    db: Session,
    *,
    company_id: int,
    content_text: str,
    k: int = _KNN_K,
) -> tuple[str | None, float, list[dict[str, Any]]]:
    if not content_text or not content_text.strip():
        return None, 0.0, []
    try:
        from packages.modules.ai.service.embedding_service import find_similar
    except Exception:  # pragma: no cover
        return None, 0.0, []

    try:
        neighbours = find_similar(
            db,
            company_id=company_id,
            query_text=content_text[:2000],
            k=k,
        )
    except Exception:  # pragma: no cover — best-effort
        return None, 0.0, []

    weighted: dict[str, float] = {}
    used: list[dict[str, Any]] = []
    for emb, score in neighbours:
        if score < _KNN_SIM_FLOOR:
            continue
        meta = emb.meta or {}
        label = meta.get("label")
        if not label or label not in LABELS:
            continue
        weighted[label] = weighted.get(label, 0.0) + float(score)
        used.append(
            {
                "document_id": emb.document_id,
                "score": round(float(score), 4),
                "label": label,
            }
        )
    if not weighted:
        return None, 0.0, used
    label = max(weighted, key=lambda k: weighted[k])
    total = sum(weighted.values())
    confidence = min(0.85, weighted[label] / max(total, 1e-9))
    return label, confidence, used


def classify_document(
    db: Session,
    *,
    company_id: int,
    content_text: str | None,
    mime_type: str | None = None,
    filename: str | None = None,
) -> dict[str, Any]:
    """Return a classification decision for a single uploaded document."""

    rule_label, rule_conf, rule_hits = _rule_signals(content_text, filename)

    # High-confidence rule short-circuits the kNN pass.
    if rule_label and rule_conf >= _RULE_HIGH_CONF:
        return {
            "label": rule_label,
            "confidence": round(rule_conf, 4),
            "method": "rule",
            "rule_hits": rule_hits,
            "neighbours": [],
        }

    knn_label, knn_conf, neighbours = _knn_vote(
        db, company_id=company_id, content_text=content_text or ""
    )

    if knn_label and knn_conf >= _KNN_MIN_CONF and (rule_label is None or knn_conf > rule_conf):
        return {
            "label": knn_label,
            "confidence": round(knn_conf, 4),
            "method": "knn",
            "rule_hits": rule_hits,
            "neighbours": neighbours,
        }

    if rule_label:
        return {
            "label": rule_label,
            "confidence": round(rule_conf, 4),
            "method": "rule",
            "rule_hits": rule_hits,
            "neighbours": neighbours,
        }

    return {
        "label": "other",
        "confidence": 0.0,
        "method": "default",
        "rule_hits": rule_hits,
        "neighbours": neighbours,
    }
