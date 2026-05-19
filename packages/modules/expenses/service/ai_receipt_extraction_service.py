"""AI-powered receipt extraction service.

Uses the configured LLM (Ollama, OpenAI-compatible) to extract structured
data from receipt text. Falls back to the heuristic regex extractor when
no LLM is available.
"""
from __future__ import annotations

import json
import logging
from decimal import Decimal
from typing import Any

from packages.modules.expenses.service.pdf_ticket_extraction_service import (
    extract_ticket_data as heuristic_extract,
)

log = logging.getLogger(__name__)

_EXTRACTION_PROMPT = """You are a receipt data extraction engine. Extract the following fields from the receipt text below.

Return ONLY valid JSON (no markdown, no explanation):
{
  "vendor_name": "string or null",
  "total_amount": 123.45,
  "currency": "MXN" or "USD" or "EUR" or null,
  "date": "YYYY-MM-DD" or null,
  "category": "meals" | "transport" | "lodging" | "telecom" | "office" | "fuel" | "other",
  "tax_amount": 12.34 or null,
  "line_items": [
    {"description": "item", "amount": 10.00}
  ] or null,
  "is_cfdi": false,
  "payment_method": "cash" | "card" | "other" | null
}

If a field cannot be determined, use null. Always include total_amount and vendor_name if visible.

Receipt text:
"""


def extract_with_ai(
    content_text: str | None,
    filename: str | None = None,
    llm_provider: Any | None = None,
) -> dict[str, Any]:
    """Extract receipt data using AI (LLM) with heuristic fallback.

    Parameters
    ----------
    content_text : str | None
        Raw text content of the receipt/document.
    filename : str | None
        Original filename (used for heuristic fallback).
    llm_provider : Any | None
        An LLM provider object with a chat completion API. If None, falls back
        to heuristic extraction.

    Returns
    -------
    dict
        Extracted data with keys: vendor_name, total_amount, currency, date,
        category, tax_amount, line_items, is_cfdi, payment_method.
    """
    if not content_text or not content_text.strip():
        return {"extraction_method": "none", "raw_text_available": False}

    # Try AI extraction first
    if llm_provider is not None:
        try:
            return _extract_with_llm(content_text, llm_provider)
        except Exception as exc:
            log.warning("AI receipt extraction failed, falling back to heuristic: %s", exc)

    # Fallback to heuristic
    result = heuristic_extract(content_text, filename)
    result["extraction_method"] = "heuristic"
    return result


def _extract_with_llm(content_text: str, provider: Any) -> dict[str, Any]:
    """Call the LLM to extract receipt data."""
    from apps.api.ai.ollama_client import chat_with_ollama, Provider

    prompt = _EXTRACTION_PROMPT + content_text[:3000]  # Truncate to avoid token overflow

    result = chat_with_ollama(
        system="You extract receipt data into JSON. Return ONLY valid JSON, no other text.",
        user_prompt=prompt,
        temperature=0.0,
        provider=provider if isinstance(provider, Provider) else None,
    )

    content = result.get("content", "").strip()

    # Strip markdown code fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[-1]
    if content.endswith("```"):
        content = content.rsplit("```", 1)[0]
    content = content.strip()

    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        log.warning("LLM returned invalid JSON for receipt extraction")
        # Fall back to heuristic
        result = heuristic_extract(content_text, None)
        result["extraction_method"] = "heuristic_fallback"
        return result

    # Normalize the response
    normalized = {
        "vendor_name": data.get("vendor_name"),
        "total_amount": _safe_decimal(data.get("total_amount")),
        "currency": data.get("currency", "MXN"),
        "date": data.get("date"),
        "category": data.get("category", "other"),
        "tax_amount": _safe_decimal(data.get("tax_amount")),
        "line_items": data.get("line_items"),
        "is_cfdi": data.get("is_cfdi", False),
        "payment_method": data.get("payment_method"),
        "extraction_method": "ai",
    }

    return normalized


def _safe_decimal(value: Any) -> Decimal | None:
    """Convert a value to Decimal, returning None on failure."""
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None
