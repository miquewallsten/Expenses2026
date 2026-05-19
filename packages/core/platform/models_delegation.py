"""Approval delegation model — allows users to delegate their approval authority.

A delegate can approve/reject on behalf of their principal during a specified
date range. If start_date/end_date are null, the delegation is always active.
"""

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from apps.api.db import Base


class Delegation(Base):
    __tablename__ = "delegations"
    __table_args__ = (
        Index("ix_delegations_principal", "principal_user_id"),
        Index("ix_delegations_delegate", "delegate_user_id"),
        Index("ix_delegations_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # The person who CAN ACT on behalf of the principal
    delegate_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    # The person whose authority is being delegated
    principal_user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )

    # Optional date range for temporary delegation
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="When delegation becomes active (null = always active)")
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="When delegation expires (null = never expires)")

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true", nullable=False)

    # Audit
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    delegate: Mapped["User"] = relationship("User", foreign_keys=[delegate_user_id], lazy="select")
    principal: Mapped["User"] = relationship("User", foreign_keys=[principal_user_id], lazy="select")
