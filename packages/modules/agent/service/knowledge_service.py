"""Knowledge vector service — index and search agent knowledge chunks.

Uses the existing embedding_service.embed_text() for consistency, but
stores results in agent_knowledge_chunks for agent-specific RAG.
"""

from __future__ import annotations

import json
import math
import os
from typing import Any

from sqlalchemy.orm import Session

from packages.modules.ai.service.embedding_service import embed_text, _fit, _deserialize
from packages.modules.agent.models_knowledge_chunk import (
    CHUNK_EMBED_DIM,
    KnowledgeChunk,
    _VECTOR_AVAILABLE,
)


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na * nb)


def index_document(
    db: Session,
    *,
    company_id: int,
    source_type: str,
    title: str,
    body: str,
    meta: dict[str, Any] | None = None,
) -> KnowledgeChunk:
    """Embed *body* and persist a single knowledge chunk.

    Returns the created row.  Caller must ``db.commit()``.
    """
    vec = _fit(embed_text(body), dim=CHUNK_EMBED_DIM)
    row = KnowledgeChunk(
        company_id=company_id,
        source_type=source_type,
        title=title,
        body=body,
        embedding=vec,
        meta=meta or {},
    )
    db.add(row)
    db.flush()
    return row


def search_knowledge(
    db: Session,
    *,
    company_id: int,
    query_text: str,
    k: int = 5,
    min_score: float = 0.65,
    source_type: str | None = None,
) -> list[dict[str, Any]]:
    """Vector-based semantic search over knowledge chunks.

    Returns a list of chunk dicts, each with ``score`` injected.
    Falls back to empty list when pgvector is not available or no rows
    match the score threshold.
    """
    if not query_text or not query_text.strip():
        return []

    # Check if we can use pgvector at query time
    use_pgvector = _VECTOR_AVAILABLE and os.environ.get("OLLAMA_EMBED_URL")

    if use_pgvector:
        return _search_pgvector(db, company_id, query_text, k, min_score, source_type)
    return _search_python(db, company_id, query_text, k, min_score, source_type)


def _search_pgvector(
    db: Session,
    company_id: int,
    query_text: str,
    k: int,
    min_score: float,
    source_type: str | None,
) -> list[dict[str, Any]]:
    """Use pgvector ``ORDER BY embedding <=> query`` when possible."""
    try:
        from pgvector.sqlalchemy import cosine_distance
        from sqlalchemy import text

        qvec = _fit(embed_text(query_text), dim=CHUNK_EMBED_DIM)

        # Build a vector literal for the SQL query
        vec_literal = "[" + ",".join(str(v) for v in qvec) + "]"

        # Use raw SQL for pgvector-specific ordering
        base_sql = """
            SELECT id, company_id, source_type, title, body, meta,
                   1 - (embedding <=> :qvec) AS score
            FROM agent_knowledge_chunks
            WHERE company_id = :cid
        """
        params: dict[str, Any] = {"qvec": vec_literal, "cid": company_id}

        if source_type:
            base_sql += " AND source_type = :stype"
            params["stype"] = source_type

        base_sql += """
            ORDER BY embedding <=> :qvec
            LIMIT :lim
        """
        params["lim"] = k

        rows = db.execute(text(base_sql), params).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            score = float(r.score) if r.score is not None else 0.0
            if score < min_score:
                continue
            out.append({
                "id": r.id,
                "source_type": r.source_type,
                "title": r.title,
                "body": r.body,
                "meta": json.loads(r.meta) if isinstance(r.meta, str) else (r.meta or {}),
                "score": round(score, 4),
            })
        return out
    except Exception:
        return []


def _search_python(
    db: Session,
    company_id: int,
    query_text: str,
    k: int,
    min_score: float,
    source_type: str | None,
) -> list[dict[str, Any]]:
    """Pure-Python cosine ranking — works on SQLite (tests) too."""
    qvec = _fit(embed_text(query_text), dim=CHUNK_EMBED_DIM)

    q = db.query(KnowledgeChunk).filter(KnowledgeChunk.company_id == company_id)
    if source_type:
        q = q.filter(KnowledgeChunk.source_type == source_type)

    scored: list[tuple[float, KnowledgeChunk]] = []
    for row in q.all():
        v = _deserialize(row.embedding)
        if v is None:
            continue
        score = _cosine(qvec, v)
        if score >= min_score:
            scored.append((score, row))

    scored.sort(key=lambda t: t[0], reverse=True)
    out: list[dict[str, Any]] = []
    for score, row in scored[:k]:
        out.append({
            "id": row.id,
            "source_type": row.source_type,
            "title": row.title,
            "body": row.body,
            "meta": row.meta or {},
            "score": round(score, 4),
        })
    return out
