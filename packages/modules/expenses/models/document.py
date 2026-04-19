from datetime import datetime

from sqlalchemy import DateTime, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseDocument(Base):
    __tablename__ = "expense_documents"

    # Enforce uniqueness at the DB level so concurrent uploads of the same
    # file cannot create duplicate rows even if the SELECT-before-INSERT
    # application-level guard loses a race.
    # NULL expense_id rows are excluded from uniqueness enforcement by all
    # major databases (NULL != NULL), so orphan staging rows are unaffected.
    __table_args__ = (
        UniqueConstraint("expense_id", "filename", name="uq_expense_document_expense_filename"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    expense_id: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_text: Mapped[str] = mapped_column(String(5000))
    validation_status: Mapped[str] = mapped_column(String(50), default="pending")
    extraction_status: Mapped[str] = mapped_column(String(50), default="pending")
    document_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    validation_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
