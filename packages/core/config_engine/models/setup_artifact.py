from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class SetupArtifact(Base):
    __tablename__ = "setup_artifacts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    setup_session_id: Mapped[int] = mapped_column(index=True)
    artifact_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_text: Mapped[str] = mapped_column(String(5000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
