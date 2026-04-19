from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class ModuleSetting(Base):
    __tablename__ = "module_settings"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True)
    module_key: Mapped[str] = mapped_column(String(100), index=True)
    setting_key: Mapped[str] = mapped_column(String(100))
    setting_value: Mapped[str] = mapped_column(String(5000))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
