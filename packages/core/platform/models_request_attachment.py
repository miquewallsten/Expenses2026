from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


class RequestAttachment(Base):
    __tablename__ = "request_attachments"
    __table_args__ = (
        CheckConstraint(
            "attachment_type IN ('file', 'url')",
            name="ck_request_attachment_type_valid",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("purchase_requests.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    uploader_id: Mapped[int] = mapped_column(Integer, nullable=False)

    attachment_type: Mapped[str] = mapped_column(String(10), nullable=False)  # "file" | "url"

    # file fields
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    stored_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # url fields
    url: Mapped[str | None] = mapped_column(Text, nullable=True)

    # shared
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
