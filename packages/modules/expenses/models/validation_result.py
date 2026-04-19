from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ValidationResult(Base):
    __tablename__ = "validation_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(index=True)
    source: Mapped[str] = mapped_column(String(50))
    rule_code: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50))
    message: Mapped[str] = mapped_column(String(5000))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )
