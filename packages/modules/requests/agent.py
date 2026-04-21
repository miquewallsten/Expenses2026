"""
Purchase Request AI Agent
--------------------------
Conversational intake for purchase requisitions.

Uses Ollama for multi-turn conversation with native tool use, enabling the
model to actively call web_search when it needs pricing or vendor data rather
than having Python pre-inject search results regardless of need.

Tool: web_search(query) — DuckDuckGo DDGS, max 6 results, no API key required.
"""

from __future__ import annotations

import json
import logging
import re
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from apps.api.ai.ollama_client import chat_with_messages, chat_with_tools
from packages.core.platform.models_purchase_request import PurchaseRequest

log = logging.getLogger(__name__)

_GREETING = (
    "Hi! I'm here to help you complete a purchase requisition. "
    "What do you need — a flight, hotel, piece of equipment, software, a service, or something else?"
)

# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a professional procurement assistant helping an employee complete a formal Purchase Requisition for their company's accounting and purchasing team.

Your job is to gather the information needed to fill in a standard Purchase Requisition form — ask natural, focused questions and progressively fill in the form fields below.

== PURCHASE REQUISITION FIELDS ==
Section A – Requestor
  - department: employee's department or area
  - cost_center: budget / cost center code (optional)

Section B – Request
  - type: one of: travel | hotel | equipment | software | service | other
  - title: short descriptive title (max 60 chars)
  - priority: normal | high | urgent
  - required_date: when the item/service is needed by (YYYY-MM-DD)
  - delivery_address: where to deliver (optional)

Section C – Vendor (optional)
  - vendor_name: preferred supplier name
  - vendor_contact: vendor email or phone (optional)
  - vendor_url: vendor website or quote URL (optional)

Section D – Line Items
  - items: array of {description, qty, unit, unit_price, total}

Section E – Justification
  - justification: 1–2 sentence business reason

Section F – Financial
  - currency: 3-letter code e.g. USD, EUR, MXN
  - account_code: GL account code (optional)
  - subtotal: numeric sum of items
  - tax: numeric tax amount (optional)
  - total_amount: final total

== RULES ==
- Ask 1-2 questions at a time. Keep replies concise and conversational.
- Accept approximate dates. Calculate totals from items when possible.
- Use your web_search tool proactively when you need current pricing, vendor options, flight costs, hotel rates, or product specifications — do not guess prices.
- When ALL required fields are gathered (type, title, items, justification, required_date, currency, total_amount), confirm back with a brief plain-language summary and add READY_TO_SUBMIT on its own line.
- At the END of every reply (hidden from user), include:
  <EXTRACT>{...full JSON with all known fields, null for unknowns...}</EXTRACT>

Example EXTRACT:
<EXTRACT>{"type":"software","title":"Adobe CC Annual License","department":"Marketing","cost_center":null,"priority":"normal","required_date":"2026-05-01","delivery_address":null,"vendor_name":"Adobe","vendor_contact":null,"vendor_url":"https://adobe.com","items":[{"description":"Adobe Creative Cloud All Apps Annual","qty":5,"unit":"seat","unit_price":600,"total":3000}],"justification":"Required for the creative team's design workflow","currency":"USD","account_code":"6200-MKT","subtotal":3000,"tax":null,"total_amount":3000}</EXTRACT>
""".strip()

# ── Tool definitions (Ollama/OpenAI-compatible format) ─────────────────────────

_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the web for current information. Use this to look up pricing, "
                "vendor options, flight costs, hotel rates, software plans, or any other "
                "real-world data you need to help complete the purchase requisition accurately."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "A specific search query, e.g. 'Adobe Creative Cloud pricing 2026' or 'direct flights Mexico City to New York May 2026 price'",
                    },
                },
                "required": ["query"],
            },
        },
    }
]


# ── Tool executor ──────────────────────────────────────────────────────────────

def _execute_tool(name: str, args: dict) -> str:
    if name == "web_search":
        return _search_web(args.get("query", ""))
    return f"Unknown tool: {name}"


def _search_web(query: str) -> str:
    """DuckDuckGo search — no API key required. Returns formatted results string."""
    try:
        from ddgs import DDGS
        results: list[str] = []
        with DDGS() as ddgs:
            for r in ddgs.text(query, max_results=6):
                title = r.get("title", "")
                body  = r.get("body", "")[:250]
                url   = r.get("href", "")
                results.append(f"[{title}] {body} (Source: {url})")
        if not results:
            return "No results found."
        return "\n\n".join(results[:6])
    except Exception as exc:
        log.warning("Web search failed: %s", exc)
        return f"Search unavailable: {exc}"


# ── Extraction helpers ─────────────────────────────────────────────────────────

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


# ── Public API ─────────────────────────────────────────────────────────────────

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

    The model uses its web_search tool autonomously when it needs pricing data.
    do_research=True is a hint that this turn likely needs pricing research (e.g.
    first turn for travel/hotel/equipment); the model will still decide when to call.

    Returns: { reply, extracted_fields, ready_to_submit, tool_calls_made }
    """
    try:
        conversation: list[dict] = json.loads(req.conversation_json or "[]")
    except Exception:
        conversation = []

    if not conversation:
        conversation.append({"role": "assistant", "content": _GREETING})

    conversation.append({"role": "user", "content": user_message})

    # Build messages for the model: system + conversation history
    messages: list[dict] = [{"role": "system", "content": _SYSTEM_PROMPT}]
    messages.extend(conversation)

    # Add research hint to the system prompt when appropriate
    system_for_call = _SYSTEM_PROMPT
    if do_research:
        system_for_call = (
            _SYSTEM_PROMPT
            + "\n\nIMPORTANT: This turn likely requires current pricing or vendor information. "
            "Use your web_search tool to look up real prices before providing estimates."
        )
        messages[0] = {"role": "system", "content": system_for_call}

    # Use tool-use loop so the model can call web_search autonomously
    result = chat_with_tools(
        system_prompt=system_for_call,
        user_prompt=user_message,
        tools=_TOOLS,
        tool_executor=_execute_tool,
        temperature=0.4,
        max_iterations=6,
    )

    # chat_with_tools rebuilds its own messages from scratch — we need the full
    # multi-turn context to keep the conversation coherent. If the model needed
    # tool calls, those are internal to that function. We use the returned content
    # as the assistant turn and persist it.
    raw_reply = result["content"] if result.get("ok") else (
        "I'm having trouble connecting right now. Please try again in a moment."
    )

    extracted = _extract_json_block(raw_reply)
    ready     = "READY_TO_SUBMIT" in raw_reply
    clean     = _clean_reply(raw_reply)

    conversation.append({"role": "assistant", "content": clean})
    req.conversation_json = json.dumps(conversation)

    if extracted:
        try:
            existing: dict = json.loads(req.details_json or "{}")
        except Exception:
            existing = {}
        # Merge — drop null values from extracted so they don't overwrite real data
        merged = {k: v for k, v in {**existing, **extracted}.items() if v is not None}
        req.details_json = json.dumps(merged)
        if not req.request_type and merged.get("type"):
            req.request_type = str(merged["type"])
        if not req.title and merged.get("title"):
            req.title = str(merged["title"])
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

    db.commit()

    return {
        "reply":            clean,
        "extracted_fields": extracted,
        "ready_to_submit":  ready,
        "tool_calls_made":  result.get("ok", False),
    }
