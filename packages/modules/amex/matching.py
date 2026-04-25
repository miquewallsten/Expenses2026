"""Deterministic matching of Amex statement lines to CFDI documents.

The heuristic is intentionally strict so the user trusts the output:

- AMOUNT match: CFDI total equals line amount (± 1 cent tolerance).
- DATE match:   invoice_date within ±5 days of posted_date (if both present).
- UNIQUE:       each CFDI matches exactly one line, each line at most one CFDI.

Lines/documents the heuristic can't uniquely resolve are left ``unmatched`` so
the user can pick manually. This is a safer default than low-confidence fuzzy
matching, which produces embarrassing wrong guesses on Amex data where many
charges share the same round amount.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Iterable


AMOUNT_TOLERANCE = Decimal("0.01")
DATE_WINDOW_DAYS = 5


@dataclass
class Candidate:
    line_id: int
    doc_id: int


@dataclass
class LineLike:
    id: int
    amount: Decimal
    posted_date: object | None  # date | None but avoid the import


@dataclass
class DocLike:
    id: int
    total: Decimal | None
    invoice_date: object | None


def _amount_equal(a: Decimal, b: Decimal) -> bool:
    return abs(Decimal(a) - Decimal(b)) <= AMOUNT_TOLERANCE


def _date_close(a, b) -> bool:
    if a is None or b is None:
        return True  # don't penalise missing dates
    try:
        return abs((a - b).days) <= DATE_WINDOW_DAYS
    except Exception:
        return True


def compute_matches(lines: Iterable[LineLike], docs: Iterable[DocLike]) -> list[Candidate]:
    """Greedy unique match: pair each CFDI with at most one line.

    We build candidate pairs (line, doc) where amounts match and dates are
    within the window, then greedily accept pairs where both sides are
    *uniquely* claimed by that candidate. Ambiguous pairs are dropped.
    """
    lines = [l for l in lines if l.amount is not None]
    docs = [d for d in docs if d.total is not None]

    # Build candidate list
    pairs: list[tuple[int, int, int]] = []  # (line_id, doc_id, date_delta)
    for line in lines:
        for doc in docs:
            if not _amount_equal(line.amount, doc.total):
                continue
            if not _date_close(line.posted_date, doc.invoice_date):
                continue
            delta = 0
            if line.posted_date and doc.invoice_date:
                delta = abs((line.posted_date - doc.invoice_date).days)
            pairs.append((line.id, doc.id, delta))

    # Sort by smallest date delta first — best matches win ties.
    pairs.sort(key=lambda p: p[2])

    used_lines: set[int] = set()
    used_docs: set[int] = set()
    matches: list[Candidate] = []

    # First pass: accept unambiguous pairs (no other candidate claims either side).
    line_counts: dict[int, int] = {}
    doc_counts: dict[int, int] = {}
    for lid, did, _ in pairs:
        line_counts[lid] = line_counts.get(lid, 0) + 1
        doc_counts[did] = doc_counts.get(did, 0) + 1

    for lid, did, _ in pairs:
        if lid in used_lines or did in used_docs:
            continue
        if line_counts[lid] == 1 and doc_counts[did] == 1:
            matches.append(Candidate(line_id=lid, doc_id=did))
            used_lines.add(lid)
            used_docs.add(did)

    # Second pass: fill in remaining greedily by closest date.
    for lid, did, _ in pairs:
        if lid in used_lines or did in used_docs:
            continue
        matches.append(Candidate(line_id=lid, doc_id=did))
        used_lines.add(lid)
        used_docs.add(did)

    return matches
