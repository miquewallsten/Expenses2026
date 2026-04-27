from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseAllocation(Base):
    __tablename__ = "expense_allocations"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # Phase 2.4 — FK + ON DELETE CASCADE: allocations are part of the expense.
    expense_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("expenses.id", ondelete="CASCADE"),
        index=True,
    )
    project_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    client_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_center_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    percent: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
