"""
Purchase Request AI Agent
--------------------------
Drives the conversational intake for purchase requests.
Uses Ollama for multi-turn conversation and DuckDuckGo Search for real web research.
"""

from __future__ import annotations

import json
import logging
import re
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from apps.api.ai.ollama_client import chat_with_messages
from packages.core.platform.models_purchase_request import PurchaseRequest

log = logging.getLogger(__name__)

_GREETING = (
    "Hi! I'm here to help you complete a purchase requisition. "
    "What do you need — a flight, hotel, piece of equipment, software, a service, or something else?"
)

_SYSTEM_PROMPT = """You are a professional procurement assistant helping an employee complete a formal Purchase Requisition for their company's accounting and purchasing team.

Your job is to gather the information needed to fill in a standard Purchase Requisition form — ask natural, focused questions and progressively fill in the form fields below.

== PURCHASE REQUISITION FIELDS ==
Section A – Requestor
  - department: employee's department or area
  - cost_center: budget / cost center code (optional, skip if not applicable)

Section B – Request
  - type: one of: travel | hotel | equipment | software | service | other
  - title: short descriptive title (max 60 chars)
  - priority: normal | high | urgent
  - required_date: when the item/service is needed by (ISO date YYYY-MM-DD)
  - delivery_address: where to deliver / where travel is to (optional)

Section C – Vendor (optional)
  - vendor_name: preferred supplier / vendor name
  - vendor_contact: vendor email or phone (optional)
  - vendor_url: vendor website or quote URL (optional)

Section D – Line Items
  - items: array of {description, qty, unit, unit_price, total}
    For travel/hotel: one item per leg/night is fine.
    For equipment/software: one item per product line.

Section E – Justification
  - justification: 1–2 sentence business reason for the purchase

Section F – Financial
  - currency: 3-letter code e.g. USD, EUR, MXN
  - account_code: GL / budget account code (optional)
  - subtotal: numeric sum of items (calculate from items if possible)
  - tax: numeric tax amount (optional)
  - total_amount: final total

== RULES ==
- Ask 1-2 questions at a time. Keep replies concise.
- Accept approximate dates and ranges.
- Calculate subtotal/total from items when possible.
- When ALL required fields are gathered (type, title, items, justification, required_date, currency, total_amount), confirm back with a brief plain-language summary and add READY_TO_SUBMIT on its own line.
- At the END of your reply (hidden from user), include:
  <EXTRACT>{...full JSON with all known fields...}</EXTRACT>
  Use null for unknown optional fields. Always include "type" and "title" when known.

Example EXTRACT for a software request:
<EXTRACT>{"type":"software","title":"Adobe CC Annual License","department":"Marketing","cost_center":null,"priority":"normal","required_date":"2026-05-01","delivery_address":null,"vendor_name":"Adobe","vendor_contact":null,"vendor_url":"https://adobe.com","items":[{"description":"Adobe Creative Cloud All Apps — Annual","qty":5,"unit":"seat","unit_price":600,"total":3000}],"justification":"Required for the creative team's design workflow for FY2026","currency":"USD","account_code":"6200-MKT","subtotal":3000,"tax":null,"total_amount":3000}</EXTRACT>
""".strip()


def _search_web(query: str) -> list[dict[str, str]]:
    """Real web search via ddgs — no API key required."""
    try:
        from ddgs import DDGS
        results: list[dict[str, str]] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=6):
                results.append({
                    "title": r.get("title", ""),
                    "text": r.get("body", "")[:300],
                    "url": r.get("href", ""),
                })
        return results[:6]
    except Exception as exc:
        log.warning("Web search failed: %s", exc)
        return []


def _build_research_query(req: PurchaseRequest, fallback: str) -> str:
    try:
        details: dict = json.loads(req.details_json or "{}")
    except Exception:
        details = {}
    rtype = req.request_type or ""
    if rtype == "travel":
        dest = details.get("destination", "")
        orig = details.get("origin", "")
        dep = details.get("departure_date", "")
        if orig and dest:
            return f"flights {orig} to {dest} {dep} price options airlines"
        return f"flight options {fallback[:60]} cost airlines"
    if rtype == "hotel":
        city = details.get("city", "") or details.get("destination", "")
        cin = details.get("check_in_date", "")
        return f"hotels in {city} {cin} price per night business".strip() or f"hotel prices {fallback[:60]}"
    if rtype == "equipment":
        item = details.get("item_name", "") or details.get("title", fallback[:60])
        return f"{item} price buy specifications"
    if rtype == "software":
        product = details.get("product_name", "") or details.get("title", fallback[:60])
        return f"{product} pricing plans cost"
    if rtype == "service":
        stype = details.get("service_type", "") or details.get("title", fallback[:60])
        return f"{stype} service cost pricing"
    # Generic: use the user's message as the query
    return f"{fallback[:120]} price options"


def _extract_json_block(text: str) -> dict[str, Any] | None:
    m = re.search(r"<EXTRACT>(.*?)</EXTRACT>", text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except Exception:
            pass
    return None


def _clean_reply(text: str) -> str:
    cleaned = re.sub(r"<EXTRACT>.*?</EXTRACT>", "", text, flags=re.DOTALL)
    cleaned = re.sub(r"\s*READY_TO_SUBMIT\s*", " ", cleaned)
    return cleaned.strip()


def get_initial_greeting(db: Session, req: PurchaseRequest) -> str:
    """Seed the conversation with the AI greeting and return it."""
    try:
        conv = json.loads(req.conversation_json or "[]")
    except Exception:
        conv = []
    if conv:
        return conv[0]["content"] if conv and conv[0]["role"] == "assistant" else _GREETING
    conv = [{"role": "assistant", "content": _GREETING}]
    req.conversation_json = json.dumps(conv)
    db.commit()
    return _GREETING


def process_chat(
    db: Session,
    req: PurchaseRequest,
    user_message: str,
    do_research: bool = False,
) -> dict[str, Any]:
    """
    Process one chat turn. Updates conversation_json and details_json in the DB.
    Returns: {reply, extracted_fields, ready_to_submit, research_results}
    """
    try:
        conversation: list[dict] = json.loads(req.conversation_json or "[]")
    except Exception:
        conversation = []

    if not conversation:
        conversation.append({"role": "assistant", "content": _GREETING})

    conversation.append({"role": "user", "content": user_message})

    # Optional web research
    research_results: list[dict] = []
    research_context = ""
    if do_research:
        query = _build_research_query(req, user_message)
        research_results = _search_web(query)
        if research_results:
            research_context = (
                "\n\nWeb research results for this request (use these to suggest specific options, "
                "prices, vendors, or flight/product details — cite source names but not raw URLs):\n"
            )
            research_context += "\n".join(
                f"[{r['title']}] {r['text'][:200]}" for r in research_results[:5]
            )

    # Build Ollama messages
    messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT + research_context}]
    messages.extend(conversation)

    result = chat_with_messages(messages)
    raw_reply = result["content"] if result.get("ok") else (
        "I'm having trouble connecting right now. Please try again in a moment."
    )

    extracted = _extract_json_block(raw_reply)
    ready = "READY_TO_SUBMIT" in raw_reply
    clean = _clean_reply(raw_reply)

    conversation.append({"role": "assistant", "content": clean})
    req.conversation_json = json.dumps(conversation)

    if extracted:
        try:
            existing: dict = json.loads(req.details_json or "{}")
        except Exception:
            existing = {}
        # Remove null values from extracted before merging
        merged = {k: v for k, v in {**existing, **extracted}.items() if v is not None}
        req.details_json = json.dumps(merged)
        if not req.request_type and merged.get("type"):
            req.request_type = str(merged["type"])
        if not req.title and merged.get("title"):
            req.title = str(merged["title"])
        # Map new total fields → estimated_amount
        for amt_key in ("total_amount", "subtotal", "budget"):
            if merged.get(amt_key):
                try:
                    req.estimated_amount = Decimal(str(merged[amt_key]))
                    break
                except Exception:
                    pass
        if merged.get("currency"):
            req.currency = str(merged["currency"])
        if merged.get("priority"):
            req.priority = str(merged["priority"])

    if research_results:
        req.research_json = json.dumps(research_results)

    db.commit()

    return {
        "reply": clean,
        "extracted_fields": extracted,
        "ready_to_submit": ready,
        "research_results": research_results or None,
    }
