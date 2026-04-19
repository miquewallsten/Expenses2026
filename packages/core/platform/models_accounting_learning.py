from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class AccountingLearning(Base):
    """Accumulated classification signal for expense coding.

    Each row captures an observed pairing of input text (typically an expense
    description) with a resolved category_code and/or account_code.  The
    usage_count is incremented each time the same input_text resolves to the
    same classification, making high-confidence patterns visible over time.

    No foreign-key constraints are used so the table stays independent of
    company, expense, and category lifecycle events.
    """

    __tablename__ = "accounting_learning"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # Raw or normalised description text used as the classification input.
    input_text: Mapped[str] = mapped_column(String(500), nullable=False)

    # Space- or comma-separated keywords extracted from input_text (optional).
    detected_keywords: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Resolved classification — either or both may be set.
    category_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    account_code: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Number of times this input_text → classification mapping has been observed.
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
