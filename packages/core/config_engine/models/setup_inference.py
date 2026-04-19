from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class SetupInference(Base):
    __tablename__ = "setup_inferences"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    setup_session_id: Mapped[int] = mapped_column(index=True)
    inference_type: Mapped[str] = mapped_column(String(50), nullable=False)
    result_text: Mapped[str] = mapped_column(String(5000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
