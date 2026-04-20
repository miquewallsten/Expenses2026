from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"
    __table_args__ = (
        CheckConstraint(
            "request_type IN ('travel','hotel','equipment','software','service','other')",
            name="ck_purchase_request_type_valid",
        ),
        CheckConstraint(
            "status IN ('draft','submitted','under_review','approved','rejected','fulfilled','cancelled')",
            name="ck_purchase_request_status_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    requester_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    requester_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Global per-company sequential document number — industry-standard format PR-YYYY-NNNNN
    request_no: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, index=True)

    request_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="draft", nullable=False)
    priority: Mapped[str] = mapped_column(String(20), default="normal", nullable=False)

    # JSON blobs
    details_json: Mapped[str | None] = mapped_column(Text, nullable=True)       # structured fields
    conversation_json: Mapped[str | None] = mapped_column(Text, nullable=True)  # AI chat history
    research_json: Mapped[str | None] = mapped_column(Text, nullable=True)      # web research results

    estimated_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True)

    assigned_to_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    assigned_team: Mapped[str | None] = mapped_column(String(50), nullable=True)

    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fulfilled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
