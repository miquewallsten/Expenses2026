from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseAttachment(Base):
    __tablename__ = "expense_attachments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Phase 2.4 — FK + ON DELETE CASCADE: attachments live or die with the expense.
    expense_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("expenses.id", ondelete="CASCADE"),
        index=True,
    )
    attachment_type: Mapped[str] = mapped_column(String(50))
    filename: Mapped[str] = mapped_column(String(255))
    content_text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
