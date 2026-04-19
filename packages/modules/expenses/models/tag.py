from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ExpenseTag(Base):
    __tablename__ = "expense_tags"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True)
    name: Mapped[str] = mapped_column(String(100))
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)  # e.g. "emerald", "sky", "amber"
