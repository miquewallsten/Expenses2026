import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from apps.api.auth import get_current_user
from apps.api.ai.ollama_client import OLLAMA_BASE_URL, chat_with_ollama, list_models, resolve_model
from packages.core.platform.models_user import User

router = APIRouter(prefix="/ai", tags=["ai"], dependencies=[Depends(get_current_user)])

# ── Request models ────────────────────────────────────────────────────────────


def _lang_instruction(locale: str | None) -> str:
    if locale and locale.startswith("es"):
        return "Respond exclusively in Spanish. Use formal business language (usted form)."
    return "Respond in English."


class ChatRequest(BaseModel):
    prompt: str
    context: str | None = None
    locale: str | None = None


class ExpenseReviewRequest(BaseModel):
    expense_text: str
    validation_summary: str | None = None
    extracted_summary: str | None = None
    locale: str | None = None


class AllocationSuggestionRequest(BaseModel):
    expense_text: str
    available_projects: list[str] = []
    available_clients: list[str] = []
    available_cost_centers: list[str] = []


class NextActionRequest(BaseModel):
    expense_text: str
    status: str | None = None
    validation_summary: str | None = None
    has_account_code: bool = False
    has_allocation: bool = False
    has_attachments: bool = False
    locale: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.get("/status")
def ai_status() -> dict:
    """Return Ollama availability and active model information."""
    active = resolve_model()
    return {
        "models": list_models(),
        "active_model": active,
        "available": bool(active),
        "base_url": OLLAMA_BASE_URL,
    }


@router.post("/chat")
def ai_chat(request: ChatRequest) -> dict:
    """General-purpose financial operations copilot chat."""
    system_prompt = (
        "You are a financial operations copilot embedded in an enterprise expense management platform. "
        "You help employees understand their expenses, navigate validation results, determine correct "
        "project and cost center allocation, and identify the next steps needed to get an expense approved. "
        f"Be concise, practical, and professional. {_lang_instruction(request.locale)}"
    )

    user_prompt = request.prompt
    if request.context:
        user_prompt = f"Context:\n{request.context}\n\nQuestion:\n{request.prompt}"

    return chat_with_ollama(system_prompt, user_prompt)


@router.post("/review-expense")
def review_expense(request: ExpenseReviewRequest) -> dict:
    """Review an expense record and return structured practical guidance."""
    system_prompt = (
        "You are a financial operations reviewer inside an enterprise expense platform. "
        "Write a short assessment of the expense in plain business language. "
        "No markdown, no bullet points, no numbering, no bold text. "
        "Maximum four sentences. "
        "State what is missing or wrong, then state what the employee must do next. "
        f"Be direct. Do not restate information that is already correct. {_lang_instruction(request.locale)}"
    )

    parts = [f"Expense details:\n{request.expense_text}"]
    if request.validation_summary:
        parts.append(f"Validation results:\n{request.validation_summary}")
    if request.extracted_summary:
        parts.append(f"Extracted fiscal data:\n{request.extracted_summary}")

    user_prompt = "\n\n".join(parts)

    return chat_with_ollama(system_prompt, user_prompt)


@router.post("/suggest-allocation")
def suggest_allocation(request: AllocationSuggestionRequest) -> dict:
    """Suggest project, client, and cost center allocation for an expense. Returns structured JSON."""
    system_prompt = (
        'You are a financial assistant. Return ONLY valid JSON in this exact format:\n\n'
        '{\n'
        '  "project": string,\n'
        '  "client": string,\n'
        '  "cost_center": string,\n'
        '  "allocation_percent": number,\n'
        '  "justification": string\n'
        '}\n\n'
        'Do not include markdown, explanations, or extra text.'
    )

    projects = ", ".join(request.available_projects) if request.available_projects else "none provided"
    clients = ", ".join(request.available_clients) if request.available_clients else "none provided"
    cost_centers = ", ".join(request.available_cost_centers) if request.available_cost_centers else "none provided"

    user_prompt = (
        f"Expense:\n{request.expense_text}\n\n"
        f"Available projects: {projects}\n"
        f"Available clients: {clients}\n"
        f"Available cost centers: {cost_centers}\n\n"
        "Recommend the best allocation. Only use options from the lists above."
    )

    raw = chat_with_ollama(system_prompt, user_prompt)
    raw_text: str = raw.get("response") or raw.get("content") or raw.get("message") or ""

    # Strip markdown code fences if present
    stripped = raw_text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[-1] if stripped.count("```") >= 2 else stripped
        stripped = stripped.lstrip("json").strip().rstrip("`").strip()

    try:
        parsed = json.loads(stripped)
        # Normalise: ensure all expected keys exist
        return {
            "project":           parsed.get("project"),
            "client":            parsed.get("client"),
            "cost_center":       parsed.get("cost_center"),
            "allocation_percent": parsed.get("allocation_percent", 100),
            "justification":     parsed.get("justification", ""),
        }
    except (json.JSONDecodeError, ValueError):
        return {
            "project":           None,
            "client":            None,
            "cost_center":       None,
            "allocation_percent": 100,
            "justification":     raw_text,
        }


@router.post("/next-action")
def next_action(request: NextActionRequest) -> dict:
    """Recommend the single most important next action for an employee working on an expense."""
    system_prompt = (
        "You are an assistant inside an enterprise expense management platform. "
        "Tell the employee the single most important thing they must do next to get this expense approved. "
        "Write in plain business language. No markdown, no bullet points, no numbering, no bold text. "
        f"Maximum two sentences. Focus on the most blocking step only. {_lang_instruction(request.locale)}"
    )

    flags: list[str] = []
    if request.status:
        flags.append(f"Status: {request.status}")
    flags.append(f"Has account code: {'yes' if request.has_account_code else 'no'}")
    flags.append(f"Has allocation: {'yes' if request.has_allocation else 'no'}")
    flags.append(f"Has attachments: {'yes' if request.has_attachments else 'no'}")

    parts = [f"Expense:\n{request.expense_text}", "\n".join(flags)]
    if request.validation_summary:
        parts.append(f"Validation summary:\n{request.validation_summary}")

    user_prompt = "\n\n".join(parts) + "\n\nWhat is the next best action for this employee?"

    return chat_with_ollama(system_prompt, user_prompt)
