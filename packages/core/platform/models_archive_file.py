from datetime import datetime

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed values for source_type
SOURCE_TYPE_VALUES = ("expense", "manual", "import")

# Allowed values for storage_backend (mirrors storage_backend.py return values)
STORAGE_BACKEND_VALUES = ("local", "object")


class ArchiveFile(Base):
    """Metadata record for a file stored in the archive.

    Binary content is NOT stored here. The ``storage_key`` is an opaque
    reference passed to the active storage backend to retrieve the bytes.

    Allowed values
    --------------
    source_type     : "expense" | "manual" | "import"
    storage_backend : "local" | "object"
    """

    __tablename__ = "archive_files"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(index=True, nullable=False)
    expense_id: Mapped[int | None] = mapped_column(index=True, nullable=True)

    # ── File identity ─────────────────────────────────────────────────────────
    # file_name : original filename as supplied by the uploader
    # file_type : lowercased extension without dot (e.g. "pdf", "xml", "jpg")
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_type: Mapped[str] = mapped_column(String(20),  nullable=False)

    # ── Origin ────────────────────────────────────────────────────────────────
    # source_type : how the file entered the archive
    source_type: Mapped[str] = mapped_column(
        String(50),
        default="expense",
        server_default="expense",
        nullable=False,
    )

    # ── Storage location ──────────────────────────────────────────────────────
    # storage_backend : which backend holds the bytes ("local" | "object")
    # storage_key     : opaque path/key understood by that backend;
    #                   no filesystem path assumptions are made here
    storage_backend: Mapped[str] = mapped_column(
        String(20),
        default="local",
        server_default="local",
        nullable=False,
    )
    storage_key: Mapped[str] = mapped_column(String(1024), nullable=False)

    # ── Extracted content ─────────────────────────────────────────────────────
    # content_text   : text extracted from the file bytes (XML decoded / PDF OCR)
    # document_type  : classified kind — cfdi_xml | cfdi_pdf | receipt_pdf |
    #                  supporting_document | unknown  (null until triage runs)
    # validation_summary : human-readable summary from validation/triage
    content_text:      Mapped[str | None] = mapped_column(Text, nullable=True)
    document_type:     Mapped[str | None] = mapped_column(String(50),    nullable=True)
    validation_summary: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # ── Audit ─────────────────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        server_default=func.now(),
        nullable=False,
    )
