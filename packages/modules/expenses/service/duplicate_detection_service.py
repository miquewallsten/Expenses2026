"""Phase 5.3 — fuzzy duplicate expense detection.

Pure SQLAlchemy + difflib. No external service calls.

Detection tiers (highest first wins per candidate):
  • EXACT_UUID   — same cfdi_uuid (when both sides have one)
  • STRONG       — same amount (±0.01), same date (±3d), description fuzzy ≥ 0.85
  • WEAK         — same amount (±0.01), same date (±3d)

Caller decides whether to block (exact/strong) or warn (weak).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from difflib import SequenceMatcher
from typing import Iterable

from sqlalchemy.orm import Session

from packages.modules.expenses.models.expense import Expense


_AMOUNT_TOLERANCE = Decimal("0.01")
_DATE_WINDOW_DAYS = 3
_FUZZY_THRESHOLD = 0.85
_CANDIDATE_LIMIT = 200

_WS = re.compile(r"\s+")


@dataclass(frozen=True)
class DuplicateMatch:
    expense_id: int
    confidence: str  # "exact_uuid" | "strong" | "weak"
    reasons: list[str]


def _norm_desc(value: str | None) -> str:
    return _WS.sub(" ", (value or "").strip().lower())


def _fuzzy(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def _candidates(
    db: Session,
    *,
    company_id: int,
    amount: Decimal,
    expense_date: date | None,
    cfdi_uuid: str | None,
    exclude_id: int | None,
) -> Iterable[Expense]:
    q = db.query(Expense).filter(Expense.company_id == company_id)
    if exclude_id is not None:
        q = q.filter(Expense.id != exclude_id)
    # Strict amount filter narrows the table fast
    q = q.filter(
        Expense.amount >= amount - _AMOUNT_TOLERANCE,
        Expense.amount <= amount + _AMOUNT_TOLERANCE,
    )
    # Date filter when we have a date
    if expense_date is not None:
        q = q.filter(
            Expense.expense_date.is_not(None),
            Expense.expense_date >= expense_date - timedelta(days=_DATE_WINDOW_DAYS),
            Expense.expense_date <= expense_date + timedelta(days=_DATE_WINDOW_DAYS),
        )
    return q.order_by(Expense.id.desc()).limit(_CANDIDATE_LIMIT).all()


def find_duplicates(
    db: Session,
    *,
    company_id: int,
    amount: Decimal,
    expense_date: date | None,
    description: str,
    cfdi_uuid: str | None = None,
    exclude_id: int | None = None,
) -> list[DuplicateMatch]:
    """Return matches sorted strongest-first. Empty list = no duplicates."""
    amt = Decimal(str(amount))
    matches: list[DuplicateMatch] = []

    # ── Path 1: exact UUID match (separate query — cheap, indexed) ───────────
    if cfdi_uuid:
        uuid_q = db.query(Expense).filter(
            Expense.company_id == company_id,
            Expense.cfdi_uuid == cfdi_uuid,
        )
        if exclude_id is not None:
            uuid_q = uuid_q.filter(Expense.id != exclude_id)
        for e in uuid_q.all():
            matches.append(DuplicateMatch(
                expense_id=e.id,
                confidence="exact_uuid",
                reasons=[f"CFDI UUID {cfdi_uuid} already on expense {e.id}"],
            ))

    seen_ids = {m.expense_id for m in matches}
    desc_norm = _norm_desc(description)

    for e in _candidates(
        db,
        company_id=company_id,
        amount=amt,
        expense_date=expense_date,
        cfdi_uuid=cfdi_uuid,
        exclude_id=exclude_id,
    ):
        if e.id in seen_ids:
            continue
        reasons: list[str] = [
            f"amount matches ({Decimal(str(e.amount or 0)):.2f})"
        ]
        if expense_date is not None and e.expense_date is not None:
            delta = abs((e.expense_date - expense_date).days)
            reasons.append(f"date within {delta}d")

        score = _fuzzy(desc_norm, _norm_desc(e.description))
        confidence: str
        if score >= _FUZZY_THRESHOLD:
            confidence = "strong"
            reasons.append(f"description similarity {score:.2f}")
        else:
            confidence = "weak"
        matches.append(DuplicateMatch(
            expense_id=e.id, confidence=confidence, reasons=reasons,
        ))
        seen_ids.add(e.id)

    rank = {"exact_uuid": 0, "strong": 1, "weak": 2}
    matches.sort(key=lambda m: (rank[m.confidence], -m.expense_id))
    return matches


def has_blocking_duplicate(matches: list[DuplicateMatch]) -> bool:
    return any(m.confidence in ("exact_uuid", "strong") for m in matches)
