from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class WorkflowStage(Base):
    __tablename__ = "workflow_stages"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    module_key: Mapped[str] = mapped_column(String(100))
    stage_key: Mapped[str] = mapped_column(String(100))
    stage_name: Mapped[str] = mapped_column(String(255))
    stage_order: Mapped[int] = mapped_column(Integer)
    is_terminal: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
