"""Categorization feedback + kNN suggestion service (Phase 8.3).

Records accountant overrides of detected categories and uses past overrides
to suggest categories for new expense descriptions via cosine similarity
over their embeddings.
"""
from __future__ import annotations

import json
from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy.orm import Session

from packages.modules.ai.models_categorization_feedback import CategorizationFeedback
from packages.modules.ai.service.embedding_service import cosine, embed_text


_DEFAULT_K = 3
_MIN_SCORE = 0.55  # below this, we don't trust the suggestion


def record_feedback(
    db: Session,
    *,
    company_id: int,
    description_text: str,
    corrected_category: str,
    original_category: str | None = None,
    expense_id: int | None = None,
    corrected_by_user_id: int | None = None,
) -> CategorizationFeedback:
    """Persist a single category override + its embedding.

    Caller is responsible for committing the surrounding transaction.
    """
    text = (description_text or "").strip()
    if not text:
        raise ValueError("description_text is required")
    if not corrected_category:
        raise ValueError("corrected_category is required")

    emb = embed_text(text)
    row = CategorizationFeedback(
        company_id=company_id,
        expense_id=expense_id,
        original_category=original_category,
        corrected_category=corrected_category,
        description_text=text,
        description_embedding=json.dumps(emb, separators=(",", ":")),
        corrected_by_user_id=corrected_by_user_id,
    )
    db.add(row)
    db.flush()
    return row


def _deserialize(raw: str | None) -> list[float] | None:
    if not raw:
        return None
    try:
        v = json.loads(raw)
        return [float(x) for x in v] if isinstance(v, list) else None
    except (ValueError, TypeError):
        return None


def suggest_category(
    db: Session,
    *,
    company_id: int,
    description_text: str,
    k: int = _DEFAULT_K,
    min_score: float = _MIN_SCORE,
) -> dict | None:
    """Suggest a category for *description_text* via kNN over feedback rows.

    Returns ``{category, confidence, votes, neighbours}`` when at least one
    neighbour scores above *min_score*; otherwise ``None`` (caller falls back
    to keyword heuristics).
    """
    text = (description_text or "").strip()
    if not text:
        return None

    qvec = embed_text(text)
    rows: Sequence[CategorizationFeedback] = (
        db.query(CategorizationFeedback)
        .filter(CategorizationFeedback.company_id == company_id)
        .all()
    )
    if not rows:
        return None

    scored: list[tuple[CategorizationFeedback, float]] = []
    for r in rows:
        v = _deserialize(r.description_embedding)
        if v is None:
            continue
        scored.append((r, cosine(qvec, v)))

    scored.sort(key=lambda t: t[1], reverse=True)
    top = scored[: max(1, k)]
    top = [t for t in top if t[1] >= min_score]
    if not top:
        return None

    # Weighted vote — sum similarity per category.
    weights: dict[str, float] = defaultdict(float)
    for row, score in top:
        weights[row.corrected_category] += score

    winner = max(weights, key=lambda c: weights[c])
    total = sum(weights.values())
    return {
        "category": winner,
        "confidence": round(weights[winner] / total, 4) if total else 0.0,
        "votes": len(top),
        "neighbours": [
            {
                "category": r.corrected_category,
                "score": round(s, 4),
                "description": r.description_text[:120],
            }
            for r, s in top
        ],
    }
