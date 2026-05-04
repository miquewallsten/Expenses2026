"""Immutable audit trail for regulatory compliance and traceability.

Every state change in the system creates an AuditEvent record:
- Expense lifecycle (created, submitted, approved, rejected)
- Document uploads and validations
- Approval chain actions
- Accounting exports

Records are append-only: once written, they cannot be modified or deleted.
This is enforced via database triggers and application-level checks.
"""

from datetime import datetime
from typing import Literal

from sqlalchemy import DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base

# Allowed event types - extend as needed
AUDIT_EVENT_TYPES = (
    # Expense lifecycle
    "expense.created",
    "expense.submitted",
    "expense.manager_approved",
    "expense.approved",
    "expense.rejected",
    "expense.deleted",
    # Document lifecycle
    "document.uploaded",
    "document.validated",
    "document.replaced",
    "document.deleted",
    # Validation results
    "validation.sat_checked",
    "validation.policy_checked",
    "validation.passed",
    "validation.failed",
    # Approval chain
    "approval.approved",
    "approval.rejected",
    "approval.comment_added",
    # Accounting
    "accounting.exported",
    "accounting.poliza_created",
    # Export
    "export.created",
    "export.downloaded",
    # User actions
    "user.login",
    "user.logout",
    "user.export_requested",
)

AUDIT_ENTITY_TYPES = (
    "Expense",
    "Document",
    "ArchiveFile",
    "User",
    "Company",
    "ExportJob",
)


class AuditEvent(Base):
    """Immutable audit event record for compliance and traceability.

    Attributes:
        company_id: Tenant identifier (required for multi-tenant isolation)
        event_type: One of AUDIT_EVENT_TYPES
        entity_type: The model type (Expense, Document, etc.)
        entity_id: The primary key of the entity
        actor_id: User who performed the action (None for system actions)
        occurred_at: Timestamp (auto-set, cannot be modified)
        ip_address: Client IP (for security auditing)
        user_agent: Client browser/app info
        before: JSON snapshot before the change (None for creations)
        after: JSON snapshot after the change (None for deletions)

    Indexes:
        ix_audit_company_time: company_id + occurred_at (most common query)
        ix_audit_entity: entity_type + entity_id (entity history lookup)
    """

    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_company_time", "company_id", "occurred_at"),
        Index("ix_audit_entity", "entity_type", "entity_id"),
        Index("ix_audit_actor", "actor_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)

    # What happened
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # AUDIT_EVENT_TYPES
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Who did it
    actor_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )

    # Where from
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # What changed (JSON delta)
    before: Mapped[str | None] = mapped_column(Text, nullable=True)
    after: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Metadata
    correlation_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True
    )  # Link related events