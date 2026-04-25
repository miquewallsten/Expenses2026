"""CategorizationFeedback — Phase 8.3.

Stores accountant overrides of detected expense categories and their
embedding so the suggestion engine can learn over time.
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
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CategorizationFeedback(Base):
    __tablename__ = "categorization_feedback"

    id: Mapped[int] = mapped_column(
        BigInteger().with_variant(Integer(), "sqlite"),
        primary_key=True,
        autoincrement=True,
    )
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    expense_id: Mapped[int | None] = mapped_column(
        Integer,
        ForeignKey("expenses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    original_category: Mapped[str | None] = mapped_column(String(80), nullable=True)
    corrected_category: Mapped[str] = mapped_column(String(80), nullable=False)
    description_text: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON-serialized embedding (list[float]) — Text on every backend so we
    # don't depend on pgvector at this table (kNN is in-process).
    description_embedding: Mapped[str | None] = mapped_column(Text, nullable=True)
    corrected_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False,
    )

    __table_args__ = (
        Index(
            "ix_categorization_feedback_company_created",
            "company_id", "created_at",
        ),
    )
