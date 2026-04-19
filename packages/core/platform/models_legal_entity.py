from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class LegalEntity(Base):
    __tablename__ = "legal_entities"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, ForeignKey("companies.id"), index=True, nullable=False)

    # Identity
    entity_name: Mapped[str] = mapped_column(String(255), nullable=False)
    entity_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    base_currency: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Fiscal / Legal
    legal_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rfc: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fiscal_regime: Mapped[str | None] = mapped_column(String(100), nullable=True)
    fiscal_zip_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fiscal_address: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Operational flags
    is_reimbursement_entity: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_invoice_receiver_entity: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
