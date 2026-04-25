"""Embedding service — Phase 8.1.

Chunks document text, computes an embedding per chunk, and upserts
``DocumentEmbedding`` rows. Provides cosine-similarity nearest-neighbour
search that works on both Postgres (pgvector) and SQLite (Python fallback).

Embedding provider:
  • If ``OLLAMA_EMBED_URL`` env var is set, calls Ollama
    ``/api/embeddings`` with ``OLLAMA_EMBED_MODEL`` (default
    ``nomic-embed-text``).
  • Otherwise falls back to a deterministic 32-dim hash-based vector for
    dev / tests. Stable across runs so kNN ordering is reproducible.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
from collections.abc import Iterable

from sqlalchemy.orm import Session

from packages.modules.ai.models_embedding import EMBEDDING_DIM, DocumentEmbedding


CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
_FALLBACK_DIM = 32


def _fit(vec: list[float], dim: int = EMBEDDING_DIM) -> list[float]:
    """Pad with zeros or truncate so the vector matches the column width."""
    if len(vec) == dim:
        return vec
    if len(vec) > dim:
        return vec[:dim]
    return vec + [0.0] * (dim - len(vec))


def chunk_text(text: str, *, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    if not text:
        return []
    text = text.strip()
    if len(text) <= size:
        return [text]
    chunks: list[str] = []
    start = 0
    step = max(1, size - overlap)
    while start < len(text):
        chunks.append(text[start : start + size])
        start += step
    return chunks


def _hash_embedding(text: str, dim: int = _FALLBACK_DIM) -> list[float]:
    """Deterministic pseudo-embedding for dev/tests.

    Hashes successive (i, text) tuples with sha256 and folds 8-byte windows
    into a unit-norm vector. Good enough for cosine ordering tests.
    """
    out: list[float] = []
    seed = text.encode("utf-8")
    while len(out) < dim:
        h = hashlib.sha256(seed + len(out).to_bytes(2, "big")).digest()
        for i in range(0, 32, 8):
            if len(out) >= dim:
                break
            chunk = int.from_bytes(h[i : i + 8], "big", signed=False)
            # Map to [-1, 1)
            out.append((chunk / 2**63) - 1.0)
    norm = math.sqrt(sum(x * x for x in out)) or 1.0
    return [x / norm for x in out]


def embed_text(text: str) -> list[float]:
    """Compute an embedding for *text*.

    Uses Ollama when configured; otherwise the deterministic fallback.
    """
    url = os.environ.get("OLLAMA_EMBED_URL")
    if url:
        try:
            import httpx  # type: ignore[import-not-found]

            model = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
            r = httpx.post(
                url.rstrip("/") + "/api/embeddings",
                json={"model": model, "prompt": text},
                timeout=10.0,
            )
            r.raise_for_status()
            data = r.json()
            vec = data.get("embedding") or []
            if isinstance(vec, list) and vec:
                return [float(x) for x in vec]
        except Exception:  # pragma: no cover — fall through to hash
            pass
    return _hash_embedding(text)


def _serialize(vec: list[float]) -> str:
    return json.dumps(vec, separators=(",", ":"))


def _deserialize(raw: object) -> list[float] | None:
    if raw is None:
        return None
    if isinstance(raw, str):
        try:
            v = json.loads(raw)
            if isinstance(v, list):
                return [float(x) for x in v]
        except Exception:
            return None
        return None
    # list, tuple, numpy array, pgvector Vector — all iterable of numbers.
    try:
        return [float(x) for x in raw]  # type: ignore[union-attr]
    except (TypeError, ValueError):
        return None


def cosine(a: list[float], b: list[float]) -> float:
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
    text: str,
    document_id: int | None = None,
    expense_id: int | None = None,
    meta: dict | None = None,
    model_name: str = "fallback-hash-32",
) -> int:
    """Index *text* as one or more embedding chunks.

    Replaces any existing rows for the same ``document_id`` (when provided)
    so re-uploads don't duplicate. Returns the number of chunks indexed.
    """
    if not text or not text.strip():
        return 0

    if document_id is not None:
        (
            db.query(DocumentEmbedding)
            .filter(DocumentEmbedding.document_id == document_id)
            .delete(synchronize_session=False)
        )

    chunks = chunk_text(text)
    rows: list[DocumentEmbedding] = []
    for idx, ch in enumerate(chunks):
        vec = _fit(embed_text(ch))
        rows.append(DocumentEmbedding(
            document_id=document_id,
            expense_id=expense_id,
            company_id=company_id,
            chunk_index=idx,
            chunk_text=ch,
            embedding=vec,
            meta=meta or {},
            model_name=model_name,
        ))
    if rows:
        db.add_all(rows)
        db.flush()
    return len(rows)


def find_similar(
    db: Session,
    *,
    company_id: int,
    query_text: str,
    k: int = 5,
) -> list[tuple[DocumentEmbedding, float]]:
    """Return up to *k* most-similar embeddings within *company_id*.

    Pure-Python cosine ranking — works on both SQLite and Postgres without
    requiring pgvector at query time. For large prod scale, swap in a
    pgvector ``ORDER BY embedding <=> :q`` query path.
    """
    if not query_text.strip():
        return []
    qvec = _fit(embed_text(query_text))
    rows: Iterable[DocumentEmbedding] = (
        db.query(DocumentEmbedding)
        .filter(DocumentEmbedding.company_id == company_id)
        .all()
    )
    scored: list[tuple[DocumentEmbedding, float]] = []
    for r in rows:
        v = _deserialize(r.embedding)
        if v is None:
            continue
        scored.append((r, cosine(qvec, v)))
    scored.sort(key=lambda t: t[1], reverse=True)
    return scored[: max(0, k)]
