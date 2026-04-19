from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Index, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class CompanyModule(Base):
    __tablename__ = "company_modules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)
    module_key: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    config_json: Mapped[Optional[str]] = mapped_column(String(5000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
