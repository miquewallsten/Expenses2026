"""auto_categorization_service.py — AI-driven expense auto-categorization.

Pipeline:
  1. Find expenses with no category_code (or status='draft').
  2. For each, attempt categorization in priority:
     a. AccountingLearning match (keyword overlap + usage_count)
     b. Ollama LLM suggestion (if AI assist enabled)
     c. Heuristic keyword match
  3. Return suggestions — never auto-write. Accountant reviews and accepts.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_accounting_category import AccountingCategory
from packages.core.platform.models_accounting_learning import AccountingLearning
from packages.modules.admin.service.accounting_setup_service import get_accounting_setup
from packages.modules.expenses.models.expense import Expense
from packages.modules.expenses.service.accounting_learning_service import find_learning_match

# Keyword fallback map (same as expense_service uses)
_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["uber", "flight", "hotel", "aviao", "aviacion", "taxi", "renta auto", "gasolina", "combustible", "peaje", "estacionamiento", "vuelo"], "TRAVEL"),
    (["meal", "restaurant", "comida", "cena", "almuerzo", "desayuno", "cafeteria", "cantina", "bar"], "MEALS"),
    (["software", "subscription", "suscripcion", "saas", "aws", "azure", "google cloud", "github", "slack", "zoom", "teams"], "SOFTWARE"),
    (["office", "oficina", "papeleria", "tinta", "impresora", "toner", "folder"], "OFFICE"),
    (["consultoria", "honorario", "asesoria", "legal", "abogado", "contador", "auditoria"], "PROFESSIONAL_SERVICES"),
    (["marketing", "publicidad", "anuncio", "redes sociales", "facebook ads", "google ads", "seo"], "MARKETING"),
    (["capacitacion", "curso", "seminario", "diplomado", "training", "certificacion"], "TRAINING"),
    (["luz", "agua", "internet", "telefono", "celular", "utilities"], "UTILITIES"),
    (["mantenimiento", "reparacion", "servicio", "fumigacion", "limpieza", "maintenance"], "MAINTENANCE"),
]


def _keyword_suggest(description: str | None) -> str | None:
    text = (description or "").lower()
    for keywords, code in _KEYWORD_MAP:
        if any(kw in text for kw in keywords):
            return code
    return None


def get_uncategorized_expenses(db: Session, company_id: int, limit: int = 50) -> list[Expense]:
    """Return expenses missing a category_code, eligible for auto-suggestion."""
    return (
        db.query(Expense)
        .filter(
            Expense.company_id == company_id,
            Expense.category_code.is_(None) | (Expense.category_code == ""),
            Expense.status.in_(["draft", "submitted"]),
        )
        .order_by(Expense.id.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )


def suggest_category(
    db: Session,
    company_id: int,
    expense_id: int,
) -> dict[str, Any]:
    """Suggest a category for a single expense.

    Returns:
        {
            "expense_id": int,
            "suggested_category_code": str | None,
            "suggested_account_code": str | None,
            "confidence": "high" | "medium" | "low",
            "source": "learning" | "keyword" | "ai" | "none",
            "reasoning": str,
            "available_categories": list[dict],  # all active categories for UI picker
        }
    """
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        return {"expense_id": expense_id, "suggested_category_code": None, "confidence": "none", "source": "none", "reasoning": "Expense not found", "available_categories": []}

    setup = get_accounting_setup(db, company_id)
    ai_enabled = setup.ai_accounting_assist_enabled if setup else True

    # Active categories for this company
    all_categories = (
        db.query(AccountingCategory)
        .filter(AccountingCategory.company_id == company_id, AccountingCategory.is_active.is_(True))
        .order_by(AccountingCategory.code)
        .all()
    )
    cat_options = [{"code": c.code, "name": c.name} for c in all_categories]
    cat_by_code = {c.code: c for c in all_categories}

    # Priority 1: AccountingLearning match
    learning_match = find_learning_match(db, company_id, expense.description)
    if learning_match and learning_match.category_code and learning_match.category_code in cat_by_code:
        cat = cat_by_code[learning_match.category_code]
        return {
            "expense_id": expense_id,
            "suggested_category_code": cat.code,
            "suggested_account_code": cat.expense_account_code,
            "confidence": "high" if learning_match.usage_count >= 3 else "medium",
            "source": "learning",
            "reasoning": f"Matched '{learning_match.input_text}' (used {learning_match.usage_count} times)",
            "available_categories": cat_options,
        }

    # Priority 2: Keyword heuristic
    kw_code = _keyword_suggest(expense.description)
    if kw_code and kw_code in cat_by_code:
        cat = cat_by_code[kw_code]
        return {
            "expense_id": expense_id,
            "suggested_category_code": cat.code,
            "suggested_account_code": cat.expense_account_code,
            "confidence": "medium",
            "source": "keyword",
            "reasoning": f"Keywords detected in description",
            "available_categories": cat_options,
        }

    # Priority 3: Ollama AI (if enabled)
    if ai_enabled:
        try:
            suggestion = _ai_suggest_category(db, company_id, expense, cat_options)
            if suggestion:
                return suggestion
        except Exception:
            pass  # AI unavailable, fall through

    # No match
    return {
        "expense_id": expense_id,
        "suggested_category_code": None,
        "suggested_account_code": None,
        "confidence": "low",
        "source": "none",
        "reasoning": "No matching pattern found",
        "available_categories": cat_options,
    }


def _ai_suggest_category(
    db: Session, company_id: int, expense: Expense, cat_options: list[dict]
) -> dict[str, Any] | None:
    """Use Ollama to suggest a category. Returns None if unavailable."""
    import json
    from apps.api.ai.ollama_client import chat_with_ollama

    cat_list = ", ".join(f"{c['code']} ({c['name']})" for c in cat_options)
    prompt = f"""Eres un contador mexicano. Dado el gasto siguiente, sugiere la categoría contable más apropiada de la lista.

Gasto: descripción="{expense.description or ''}", monto={expense.amount}, proveedor="{getattr(expense, 'vendor_name', '') or ''}"

Categorías disponibles: {cat_list}

Responde SOLO con un JSON: {{"code": "CATEGORY_CODE", "reasoning": "breve explicación"}}"""

    res = chat_with_ollama(prompt, "", temperature=0.1)
    if not res.get("ok"):
        return None

    raw = (res.get("content") or "").strip()
    # Strip markdown fences
    import re
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.MULTILINE)
    try:
        parsed = json.loads(raw)
    except Exception:
        return None

    code = (parsed.get("code") or "").strip()
    if not code:
        return None

    # Validate code exists
    valid_codes = {c["code"] for c in cat_options}
    if code not in valid_codes:
        return None

    from packages.core.platform.models_accounting_category import AccountingCategory
    cat = db.query(AccountingCategory).filter(AccountingCategory.company_id == company_id, AccountingCategory.code == code).first()
    return {
        "expense_id": expense.id,
        "suggested_category_code": code,
        "suggested_account_code": cat.expense_account_code if cat else None,
        "confidence": "medium",
        "source": "ai",
        "reasoning": parsed.get("reasoning", "AI suggestion"),
        "available_categories": cat_options,
    }


def bulk_suggest(
    db: Session,
    company_id: int,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Run auto-categorization for all uncategorized expenses."""
    expenses = get_uncategorized_expenses(db, company_id, limit)
    results = []
    for e in expenses:
        results.append(suggest_category(db, company_id, e.id))
    return results


def accept_suggestion(
    db: Session,
    expense_id: int,
    category_code: str,
    account_code: str | None = None,
) -> Expense:
    """Apply a suggested category to an expense (accountant accepts)."""
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise ValueError(f"Expense {expense_id} not found")

    expense.category_code = category_code
    if account_code:
        expense.account_code = account_code

    # Store in learning table for future matches
    from packages.modules.expenses.service.accounting_learning_service import store_learning
    store_learning(
        db,
        company_id=expense.company_id,
        input_text=expense.description,
        category_code=category_code,
        account_code=account_code,
    )

    db.commit()
    db.refresh(expense)
    return expense
