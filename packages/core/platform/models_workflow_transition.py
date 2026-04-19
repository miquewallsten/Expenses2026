from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class WorkflowTransition(Base):
    __tablename__ = "workflow_transitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    module_key: Mapped[str] = mapped_column(String(100))
    from_stage_key: Mapped[str] = mapped_column(String(100))
    to_stage_key: Mapped[str] = mapped_column(String(100))
    action_key: Mapped[str] = mapped_column(String(100))
    required_permission_key: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
