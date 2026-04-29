"""KnowledgeChunk — semantic memory for the agent.

Stores product docs, configuration history, and resolved issues as
vector-indexed chunks.  Searched via cosine similarity to ground the
agent's responses in relevant, up-to-date context.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

try:
    from pgvector.sqlalchemy import Vector
    _VECTOR_AVAILABLE = True
except ImportError:
    from sqlalchemy import Text as Vector  # type: ignore[assignment]
    _VECTOR_AVAILABLE = False

CHUNK_EMBED_DIM = 1536  # same as DocumentEmbedding; change if model changes


class KnowledgeChunk(Base):
    """A single searchable knowledge chunk for agent RAG."""

    __tablename__ = "agent_knowledge_chunks"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer(), "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(
        String(32), nullable=False, index=True,
        comment="product_doc | config_history | resolved_issue | tenant_note",
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[object] = mapped_column(
        Vector(CHUNK_EMBED_DIM) if _VECTOR_AVAILABLE else Text,
        nullable=True,
    )
    meta: Mapped[dict | None] = mapped_column(
        JSONB().with_variant(JSON(), "sqlite"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index("ix_agent_knowledge_chunks_company_source", "company_id", "source_type"),
    )
