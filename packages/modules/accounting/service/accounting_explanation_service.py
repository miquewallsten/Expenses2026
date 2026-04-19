"""accounting_explanation_service.py

Produces a plain-language explanation for why an expense received a given
accounting classification.  No AI or external calls — purely rule-based.

explain_accounting_decision(expense, category, learning_match) -> dict

Returns
-------
{
    "category_reason" : str,
    "account_reason"  : str,
    "confidence"      : "high" | "medium" | "low",
    "source"          : "learning" | "keyword" | "manual" | "default",
}
"""

from __future__ import annotations

# Known keywords mapped to their category codes.
# Keep in sync with expense_service._KEYWORD_CATEGORY_MAP.
_KEYWORD_MAP: list[tuple[list[str], str]] = [
    (["uber", "flight", "hotel"],  "TRAVEL"),
    (["meal", "restaurant"],       "MEALS"),
    (["software", "subscription"], "SOFTWARE"),
]


def _matched_keywords(description: str | None) -> list[str]:
    """Return any keywords in *description* that trigger category inference."""
    text = (description or "").lower()
    matched: list[str] = []
    for keywords, _ in _KEYWORD_MAP:
        for kw in keywords:
            if kw in text:
                matched.append(kw)
    return matched


def explain_accounting_decision(expense, category, learning_match) -> dict:
    """Return a plain-language explanation dict for the accounting classification
    of *expense*.

    Parameters
    ----------
    expense        : Expense ORM object (.description, .account_code,
                     .category_code, .status)
    category       : AccountingCategory ORM object | None
    learning_match : AccountingLearning ORM object | None
    """
    description  = getattr(expense, "description", None) or ""
    account_code = getattr(expense, "account_code", None)
    category_code = getattr(expense, "category_code", None)

    # ── Source + confidence ───────────────────────────────────────────────────
    if learning_match is not None:
        source     = "learning"
        confidence = "high"
        kws: list[str] = []
    else:
        kws = _matched_keywords(description)
        if kws:
            source     = "keyword"
            confidence = "medium"
        elif account_code:
            source     = "manual"
            confidence = "high"
        else:
            source     = "default"
            confidence = "low"

    # ── Category reason ───────────────────────────────────────────────────────
    if source == "learning":
        ref_text = getattr(learning_match, "input_text", "") or ""
        category_reason = f"Based on similar past expenses: \"{ref_text}\""
    elif source == "keyword":
        kws_display = ", ".join(f"'{k}'" for k in kws)
        category_reason = f"Detected keywords like {kws_display} in the description."
    elif category_code:
        category_reason = f"Category {category_code} applied."
    else:
        category_reason = "No category could be inferred."

    # ── Account reason ────────────────────────────────────────────────────────
    cat_label = (category_code or "").upper()
    if category is not None:
        expense_acct = getattr(category, "expense_account_code", None) or account_code
        if expense_acct:
            account_reason = f"Category {cat_label} maps to account {expense_acct}."
        else:
            account_reason = f"Category {cat_label} has no account code configured."
    elif account_code:
        account_reason = f"Account {account_code} assigned directly."
    else:
        account_reason = "No account code assigned."

    return {
        "category_reason": category_reason,
        "account_reason":  account_reason,
        "confidence":      confidence,
        "source":          source,
    }
