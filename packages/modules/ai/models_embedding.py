"""
DocumentEmbedding — pgvector-backed semantic index for expense documents.

Each row stores a 1536-dimension embedding (OpenAI text-embedding-3-small
compatible; swap dimensions for other models) alongside enough metadata to
reconstruct a result without a JOIN.

Index strategy:
  • IVFFlat index on the embedding column for approximate nearest-neighbour
    search.  Suitable for up to ~1 M rows; switch to HNSW for larger datasets
    (the column definition is identical — only the CREATE INDEX statement
    differs).
  • GIN index on metadata for fast JSON key/value filtering.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy import JSON
try:
    from sqlalchemy.dialects.postgresql import JSONB as _JSONB
    # Use JSONB on PostgreSQL; fall back to plain JSON for SQLite (tests).
    _meta_type = _JSONB().with_variant(JSON(), "sqlite")
except ImportError:  # pragma: no cover
    _meta_type = JSON()
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db import Base

try:
    from pgvector.sqlalchemy import Vector
    _VECTOR_AVAILABLE = True
except ImportError:
    # Fallback: store as TEXT so the model can still be imported without
    # pgvector installed (e.g. in test environments without the extension).
    from sqlalchemy import Text as Vector  # type: ignore[assignment]
    _VECTOR_AVAILABLE = False

EMBEDDING_DIM = 1536  # matches text-embedding-3-small; change to 768 for MiniLM


class DocumentEmbedding(Base):
    """Semantic embedding for an expense document chunk."""

    __tablename__ = "document_embeddings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    # Source reference — nullable so orphan embeddings (e.g. from archived
    # docs) survive document deletion without FK errors.
    document_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("expense_documents.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    expense_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("expenses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    company_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)

    # Content
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[object] = mapped_column(
        Vector(EMBEDDING_DIM) if _VECTOR_AVAILABLE else Text,
        nullable=True,
    )

    # Metadata bag — document_type, filename, detected_category, etc.
    meta: Mapped[dict | None] = mapped_column(_meta_type, nullable=True)

    # Auditing
    model_name: Mapped[str] = mapped_column(
        String(80), default="text-embedding-3-small", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # ── Relationships ─────────────────────────────────────────────────────────
    document = relationship(
        "ExpenseDocument",
        foreign_keys=[document_id],
        lazy="select",
    )

    # ── Indexes ───────────────────────────────────────────────────────────────
    __table_args__ = (
        # IVFFlat ANN index — created after bulk-loading data with
        # SET ivfflat.probes = N for recall tuning.
        # Switch to 'hnsw' for write-heavy workloads (no VACUUM needed).
        Index(
            "ix_document_embeddings_vector",
            "embedding",
            postgresql_using="ivfflat",
            postgresql_ops={"embedding": "vector_cosine_ops"},
            postgresql_with={"lists": "100"},
        ),
        # Composite index for filtered ANN: "find similar docs in company X"
        Index("ix_document_embeddings_company_doc", "company_id", "document_id"),
    )
