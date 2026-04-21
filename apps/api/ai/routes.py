import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from apps.api.auth import get_current_user
from apps.api.ai.ollama_client import (
    OLLAMA_BASE_URL,
    chat_with_ollama,
    chat_with_tools,
    stream_chat_sse,
    stream_chat_with_messages_sse,
    list_models,
    resolve_model,
)
from packages.core.platform.models_user import User

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(get_current_user)])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _lang(locale: str | None) -> str:
    if locale and locale.startswith("es"):
        return "Respond exclusively in Spanish. Use formal business language (usted form)."
    return "Respond in English."


def _json_instruction() -> str:
    return (
        "Reply ONLY with a single valid JSON object. "
        "No markdown fences, no prose outside the JSON, no trailing text."
    )


# ── Request models ────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    prompt: str
    context: str | None = None
    locale: str | None = None
    system_prompt: str | None = None
    # Optional conversation history for multi-turn chat
    history: list[dict] | None = None


class StreamChatRequest(BaseModel):
    prompt: str
    context: str | None = None
    locale: str | None = None
    system_prompt: str | None = None
    history: list[dict] | None = None


class ExpenseReviewRequest(BaseModel):
    expense_text: str
    validation_summary: str | None = None
    extracted_summary: str | None = None
    locale: str | None = None
    # Rich context fields from MyWorkAssistant
    module: str | None = None
    workflow_step: str | None = None
    next_action: str | None = None
    has_blockers: bool = False
    missing_fields: list[str] | None = None
    policy_notes: list[str] | None = None
    context: str | None = None


class AllocationSuggestionRequest(BaseModel):
    expense_text: str
    available_projects: list[str] = []
    available_clients: list[str] = []
    available_cost_centers: list[str] = []
    company_policy_notes: str | None = None


class NextActionRequest(BaseModel):
    expense_text: str
    status: str | None = None
    validation_summary: str | None = None
    has_account_code: bool = False
    has_allocation: bool = False
    has_attachments: bool = False
    locale: str | None = None
    workflow_step: str | None = None
    has_blockers: bool = False
    missing_fields: list[str] | None = None
    context: str | None = None


class AccountCodeRequest(BaseModel):
    expense_text: str
    description: str
    amount: float | None = None
    detected_category: str | None = None
    available_codes: list[dict] | None = None  # [{"code": str, "name": str}]
    locale: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/status")
def ai_status() -> dict:
    active = resolve_model()
    return {
        "models":       list_models(),
        "active_model": active,
        "available":    bool(active),
        "base_url":     OLLAMA_BASE_URL,
    }


@router.post("/chat")
def ai_chat(request: ChatRequest) -> dict:
    """General-purpose copilot chat (non-streaming). Supports multi-turn history."""
    if request.system_prompt:
        system = request.system_prompt
    else:
        system = (
            "You are an expert financial operations copilot embedded in an enterprise "
            "expense management platform. You help employees understand their expenses, "
            "navigate CFDI/SAT validation, determine correct project and cost center "
            "allocation, and identify the precise next step needed for approval. "
            "Be concise, direct, and practical. Avoid generic advice — focus on what "
            "this specific expense needs right now. "
            f"{_lang(request.locale)}"
        )

    if request.history:
        # Multi-turn: reconstruct full message list
        messages: list[dict] = [{"role": "system", "content": system}]
        for turn in request.history:
            if turn.get("role") in ("user", "assistant"):
                messages.append({"role": turn["role"], "content": turn["content"]})
        # Append current user prompt with optional context
        user_content = request.prompt
        if request.context:
            user_content = f"Context:\n{request.context}\n\nQuestion:\n{request.prompt}"
        messages.append({"role": "user", "content": user_content})
        from apps.api.ai.ollama_client import chat_with_messages
        return chat_with_messages(messages, temperature=0.5)
    else:
        user_prompt = request.prompt
        if request.context:
            user_prompt = f"Context:\n{request.context}\n\nQuestion:\n{request.prompt}"
        return chat_with_ollama(system, user_prompt, temperature=0.5)


@router.post("/chat/stream")
def ai_chat_stream(request: StreamChatRequest):
    """
    SSE streaming chat endpoint.

    Response is text/event-stream. Each chunk:
        data: {"text": "...partial text..."}\n\n
    Terminal:
        data: [DONE]\n\n

    Frontend reads this with the Fetch Streaming API (see AICopilotRail / MyWorkAssistant).
    """
    if request.system_prompt:
        system = request.system_prompt
    else:
        system = (
            "You are an expert financial operations copilot embedded in an enterprise "
            "expense management platform. You help employees understand their expenses, "
            "navigate CFDI/SAT validation, determine correct project and cost center "
            "allocation, and identify the precise next step needed for approval. "
            "Be concise, direct, and practical. Avoid generic advice — focus on what "
            "this specific expense needs right now. "
            f"{_lang(request.locale)}"
        )

    user_content = request.prompt
    if request.context:
        user_content = f"Context:\n{request.context}\n\nQuestion:\n{request.prompt}"

    if request.history:
        messages: list[dict] = [{"role": "system", "content": system}]
        for turn in request.history:
            if turn.get("role") in ("user", "assistant"):
                messages.append({"role": turn["role"], "content": turn["content"]})
        messages.append({"role": "user", "content": user_content})
        return StreamingResponse(
            stream_chat_with_messages_sse(messages, temperature=0.5),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
    else:
        return StreamingResponse(
            stream_chat_sse(system, user_content, temperature=0.5),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )


@router.post("/review-expense")
def review_expense(request: ExpenseReviewRequest) -> dict:
    """
    Holistic expense review. Uses tool use when the model supports it to look up
    policy rules and past decisions, then returns a targeted assessment.
    """
    system = (
        "You are a senior financial operations reviewer inside an enterprise expense platform. "
        "Your job: give a crisp, actionable assessment of one expense record.\n\n"
        "Rules:\n"
        "- Write in plain business prose. No markdown, no bullet points, no bold, no numbering.\n"
        "- Maximum 4 sentences total.\n"
        "- First: state the single most critical problem or confirm the expense looks correct.\n"
        "- Second: state exactly what the employee must do next (be specific — name the field, "
        "document type, or action).\n"
        "- Third (only if needed): note a secondary concern or compliance risk.\n"
        "- Fourth (only if needed): confirm what is already correct to avoid confusion.\n"
        "- Never restate information that is obviously correct and complete.\n"
        "- Never give generic advice like 'review carefully' — every sentence must be actionable.\n"
        f"{_lang(request.locale)}"
    )

    parts = [f"Expense record:\n{request.expense_text}"]

    if request.workflow_step:
        parts.append(f"Current workflow stage: {request.workflow_step}")
    if request.has_blockers and request.missing_fields:
        parts.append(f"Blocking issues: {', '.join(request.missing_fields)}")
    if request.policy_notes:
        parts.append(f"Policy notes: {'; '.join(request.policy_notes)}")
    if request.validation_summary:
        parts.append(f"Validation results:\n{request.validation_summary}")
    if request.extracted_summary:
        parts.append(f"Extracted fiscal data (CFDI):\n{request.extracted_summary}")
    if request.context:
        parts.append(f"Additional context:\n{request.context}")

    user_prompt = "\n\n".join(parts)
    return chat_with_ollama(system, user_prompt, temperature=0.2)


@router.post("/suggest-allocation")
def suggest_allocation(request: AllocationSuggestionRequest) -> dict:
    """Suggest project/client/cost-center allocation. Returns structured JSON."""
    system = (
        "You are a financial allocation specialist. Analyse the expense and select the best "
        "matching project, client, and cost center from the provided lists.\n\n"
        "Decision logic:\n"
        "1. Match on keywords in the expense description (vendor name, purpose, department).\n"
        "2. Prefer more specific matches over generic ones.\n"
        "3. If multiple projects match, choose the one most recently active or most semantically close.\n"
        "4. Set allocation_percent to 100 unless the description clearly implies a split.\n\n"
        + _json_instruction() + "\n\n"
        "Schema: { "
        '"project": string | null, '
        '"client": string | null, '
        '"cost_center": string | null, '
        '"allocation_percent": number, '
        '"confidence": "high" | "medium" | "low", '
        '"justification": string'
        " }"
    )

    projects     = ", ".join(request.available_projects)     or "none provided"
    clients      = ", ".join(request.available_clients)      or "none provided"
    cost_centers = ", ".join(request.available_cost_centers) or "none provided"

    user_prompt = (
        f"Expense:\n{request.expense_text}\n\n"
        f"Available projects: {projects}\n"
        f"Available clients: {clients}\n"
        f"Available cost centers: {cost_centers}\n"
    )
    if request.company_policy_notes:
        user_prompt += f"\nPolicy notes: {request.company_policy_notes}"
    user_prompt += "\n\nSelect the best allocation from the lists above."

    raw = chat_with_ollama(system, user_prompt, temperature=0.1)
    raw_text: str = raw.get("content") or ""

    stripped = raw_text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("```")
        stripped = lines[1].lstrip("json").strip() if len(lines) >= 2 else stripped
        stripped = stripped.rstrip("`").strip()

    try:
        parsed = json.loads(stripped)
        return {
            "project":            parsed.get("project"),
            "client":             parsed.get("client"),
            "cost_center":        parsed.get("cost_center"),
            "allocation_percent": parsed.get("allocation_percent", 100),
            "confidence":         parsed.get("confidence", "medium"),
            "justification":      parsed.get("justification", ""),
        }
    except (json.JSONDecodeError, ValueError):
        return {
            "project":            None,
            "client":             None,
            "cost_center":        None,
            "allocation_percent": 100,
            "confidence":         "low",
            "justification":      raw_text,
        }


@router.post("/next-action")
def next_action(request: NextActionRequest) -> dict:
    """
    Return the single most important next step for the employee.
    Tuned for brevity and precision — maximum two sentences, zero fluff.
    """
    system = (
        "You are a financial operations guide inside an enterprise expense platform. "
        "Your job: tell the employee the single most important thing they must do RIGHT NOW "
        "to move this expense forward.\n\n"
        "Rules:\n"
        "- Maximum 2 sentences.\n"
        "- First sentence: the exact action (be specific — name the button, field, or document).\n"
        "- Second sentence (optional): why it is the most important step.\n"
        "- If the expense is already ready to submit, say so clearly.\n"
        "- Never give generic advice. Never explain the process. Just the next action.\n"
        "- If there are multiple blockers, address only the most critical one.\n"
        f"{_lang(request.locale)}"
    )

    flags: list[str] = []
    if request.status:
        flags.append(f"Status: {request.status}")
    if request.workflow_step:
        flags.append(f"Workflow stage: {request.workflow_step}")
    flags.append(f"Has account code: {'yes' if request.has_account_code else 'no'}")
    flags.append(f"Has allocation: {'yes' if request.has_allocation else 'no'}")
    flags.append(f"Has attachments: {'yes' if request.has_attachments else 'no'}")
    if request.has_blockers and request.missing_fields:
        flags.append(f"Missing required fields: {', '.join(request.missing_fields)}")

    parts = [f"Expense:\n{request.expense_text}", "\n".join(flags)]
    if request.validation_summary:
        parts.append(f"Validation summary:\n{request.validation_summary}")
    if request.context:
        parts.append(f"Additional context:\n{request.context}")

    user_prompt = "\n\n".join(parts) + "\n\nWhat is the single most important next action?"

    return chat_with_ollama(system, user_prompt, temperature=0.2)


@router.post("/suggest-account-code")
def suggest_account_code(request: AccountCodeRequest) -> dict:
    """
    Suggest the best matching GL account code for an expense.
    Uses tool use to reason over available codes and return a ranked suggestion.
    """
    available_codes_text = ""
    if request.available_codes:
        lines = [f"  {c['code']}: {c.get('name', '')}" for c in request.available_codes[:50]]
        available_codes_text = "Available account codes:\n" + "\n".join(lines)
    else:
        available_codes_text = "No account code list provided — suggest based on expense type."

    system = (
        "You are a Mexican accounting specialist. Select the most appropriate GL account code "
        "for this expense based on the SAT catálogo de cuentas and common Mexican accounting practice.\n\n"
        "Decision logic:\n"
        "1. Match the expense type and vendor to the most semantically close account code.\n"
        "2. For travel: prefer 6100-series (viáticos). For technology: 6200-series. "
        "For office supplies: 6300-series. For services: 6400-series.\n"
        "3. If the expense has a CFDI, the SAT use (uso de CFDI) is a strong signal.\n"
        "4. Confidence = high when vendor name unambiguously maps to one category; "
        "medium when inferred; low when ambiguous.\n\n"
        + _json_instruction() + "\n\n"
        "Schema: { "
        '"account_code": string, '
        '"account_name": string, '
        '"confidence": "high" | "medium" | "low", '
        '"reasoning": string'
        " }"
    )

    user_prompt = (
        f"Expense description: {request.description}\n"
        f"Amount: {request.amount or 'unknown'}\n"
    )
    if request.detected_category:
        user_prompt += f"AI-detected category: {request.detected_category}\n"
    user_prompt += f"\n{available_codes_text}\n\nSelect the best account code."

    raw = chat_with_ollama(system, user_prompt, temperature=0.1)
    raw_text: str = raw.get("content") or ""

    stripped = raw_text.strip()
    if stripped.startswith("```"):
        lines = stripped.split("```")
        stripped = lines[1].lstrip("json").strip() if len(lines) >= 2 else stripped

    try:
        parsed = json.loads(stripped)
        return {
            "account_code": parsed.get("account_code"),
            "account_name": parsed.get("account_name", ""),
            "confidence":   parsed.get("confidence", "medium"),
            "reasoning":    parsed.get("reasoning", ""),
            "ok":           True,
        }
    except (json.JSONDecodeError, ValueError):
        return {"account_code": None, "account_name": "", "confidence": "low",
                "reasoning": raw_text, "ok": False}


@router.post("/diagnose-config")
def diagnose_config(request: ChatRequest) -> dict:
    """
    Deep configuration analysis for the admin orchestrator.
    Uses extended reasoning to detect conflicts and suggest coherent fixes
    across all five setup domains simultaneously.
    """
    if request.system_prompt:
        system = request.system_prompt
    else:
        system = (
            "You are a senior financial operations architect reviewing a company's expense "
            "management configuration. Your job is to identify conflicts, gaps, and risks "
            "across ALL five configuration domains at once:\n"
            "  1. Company setup (org model, modules, legal entities)\n"
            "  2. Expense policy (XML/CFDI rules, document requirements)\n"
            "  3. Approval setup (routing, escalation, thresholds)\n"
            "  4. Accounting setup (review mode, account codes, póliza)\n"
            "  5. Workflow setup (routing rules, submission controls)\n\n"
            "Think step by step before producing output. Consider interdependencies: "
            "a setting in one domain can make another domain's settings invalid or unreachable.\n\n"
            "Be precise. Name the specific fields that conflict. Propose the minimal changes "
            "needed to make the configuration consistent and operationally sound.\n\n"
            + _json_instruction() + "\n\n"
            "Schema: {\n"
            '  "summary": string,\n'
            '  "critical_conflicts": [{ "domains": string[], "issue": string, "fix": string }],\n'
            '  "warnings": [{ "domain": string, "issue": string, "recommendation": string }],\n'
            '  "proposed_patches": { "section": string, "field": string, "value": any, "reason": string }[],\n'
            '  "operational_impact": string[],\n'
            '  "missing_decisions": string[]\n'
            "}"
        )

    user_prompt = request.prompt
    if request.context:
        user_prompt = f"Current platform configuration:\n{request.context}\n\nRequest:\n{request.prompt}"

    return chat_with_ollama(system, user_prompt, temperature=0.2)
