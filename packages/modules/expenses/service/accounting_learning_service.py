"""accounting_learning_service.py

Looks up and stores expense classification learning signals.

find_learning_match — returns the best AccountingLearning row for a given
company + input text, ranked by usage_count descending.

store_learning — upserts a classification learning entry.  Guards:
  - no-op when expense_status is "rejected"
  - no-op when both category_code and account_code are absent
  - no-op when input_text or company_id is missing
"""

import re

from sqlalchemy.orm import Session
from sqlalchemy import func

from packages.core.platform.models_accounting_learning import AccountingLearning

# Words too generic to be useful for matching.
_STOP_WORDS = {
    "a", "an", "the", "in", "on", "at", "to", "of", "for",
    "and", "or", "with", "from", "by", "per",
}


def _normalise(text: str | None) -> str:
    return (text or "").strip().lower()


def _keywords(text: str | None) -> set[str]:
    """Return significant lowercase words (len >= 3, not stop-words)."""
    words = re.findall(r"[a-z0-9]+", _normalise(text))
    return {w for w in words if len(w) >= 3 and w not in _STOP_WORDS}


def find_learning_match(
    db: Session, company_id: int, input_text: str | None
) -> AccountingLearning | None:
    """Return the best AccountingLearning row for *company_id* + *input_text*.

    Matching uses keyword overlap (>=1 shared significant word).
    Ties are broken by overlap count then usage_count, both descending.
    Returns None when input_text yields no usable keywords.
    """
    query_kws = _keywords(input_text)
    if not query_kws:
        return None

    candidates = (
        db.query(AccountingLearning)
        .filter(AccountingLearning.company_id == company_id)
        .all()
    )

    best: AccountingLearning | None = None
    best_overlap = 0

    for row in candidates:
        overlap = len(query_kws & _keywords(row.input_text))
        if overlap < 1:
            continue
        if overlap > best_overlap or (
            overlap == best_overlap
            and (row.usage_count or 0) > (best.usage_count or 0)
        ):
            best = row
            best_overlap = overlap

    return best


def store_learning(
    db: Session,
    company_id: int,
    input_text: str | None,
    category_code: str | None,
    account_code: str | None,
    expense_status: str | None = None,
) -> AccountingLearning | None:
    """Upsert a classification learning entry for *input_text*.

    Guards (returns None immediately):
    - expense_status is "rejected" — rejected expenses carry unreliable coding.
    - Both category_code and account_code are absent — nothing useful to store.
    - input_text or company_id is blank/zero.
    """
    # Guard: rejected expense
    if (expense_status or "").strip().lower() == "rejected":
        return None

    # Guard: missing required fields
    if not company_id:
        return None

    cat  = (category_code or "").strip() or None
    acct = (account_code  or "").strip() or None
    if cat is None and acct is None:
        return None

    normalised = _normalise(input_text)
    if not normalised:
        return None

    existing = (
        db.query(AccountingLearning)
        .filter(
            AccountingLearning.company_id == company_id,
            func.lower(func.trim(AccountingLearning.input_text)) == normalised,
        )
        .first()
    )

    if existing is not None:
        existing.category_code = cat
        existing.account_code  = acct
        existing.usage_count   = (existing.usage_count or 1) + 1
        db.commit()
        db.refresh(existing)
        return existing

    row = AccountingLearning(
        company_id=company_id,
        input_text=(input_text or "").strip(),
        category_code=cat,
        account_code=acct,
        usage_count=1,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
