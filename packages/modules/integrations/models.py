"""SQLAlchemy models for the Integrations / ERP Bridge module.

Phase 4.1 — schema only.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from apps.api.db import Base


INTEGRATION_KINDS = ("erp", "bank_statement", "hris", "generic_webhook")
INTEGRATION_VENDORS = (
    "contpaqi", "aspel", "sap", "netsuite", "oracle", "quickbooks", "xero", "custom",
)
ENDPOINT_NAMES = (
    "export_polizas",
    "export_approved_expenses",
    "receive_payment_confirmations",
    "sync_cost_centers",
    "sync_users",
    "sync_accounting_categories",
)
SYNC_DIRECTIONS = ("outbound", "inbound")
SYNC_STATUSES = ("pending", "running", "succeeded", "failed", "partial")


class Integration(Base):
    """One configured ERP / external system per company."""

    __tablename__ = "integrations"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('erp','bank_statement','hris','generic_webhook')",
            name="ck_integration_kind_valid",
        ),
        Index("ix_integrations_company_kind", "company_id", "kind"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    vendor: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    # Free-form, vendor-specific configuration (URLs, account codes, mappings).
    # Sensitive secrets MUST go in `credentials_ref`, not here.
    config_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Opaque pointer into the secret store (e.g. "vault://co/42/contpaqi/main").
    # Encryption + actual fetch lives in a later phase.
    credentials_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class IntegrationEndpoint(Base):
    """A single capability exposed by an Integration (export polizas, sync users…)."""

    __tablename__ = "integration_endpoints"
    __table_args__ = (
        UniqueConstraint("integration_id", "endpoint", name="uq_integration_endpoint"),
        Index("ix_integration_endpoints_integration", "integration_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    integration_id: Mapped[int] = mapped_column(
        ForeignKey("integrations.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(60), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)
    # auth_strategy: e.g. "basic", "bearer", "api_key", "hmac", "oauth2_cc", "none".
    auth_strategy: Mapped[str | None] = mapped_column(String(40), nullable=True)
    target_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    settings_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    schedule_cron: Mapped[str | None] = mapped_column(String(60), nullable=True)
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )


class IntegrationSyncRun(Base):
    """One execution of an endpoint — outbound (we push) or inbound (ERP reports)."""

    __tablename__ = "integration_sync_runs"
    __table_args__ = (
        CheckConstraint(
            "direction IN ('outbound','inbound')",
            name="ck_sync_run_direction_valid",
        ),
        CheckConstraint(
            "status IN ('pending','running','succeeded','failed','partial')",
            name="ck_sync_run_status_valid",
        ),
        Index("ix_sync_runs_integration_started", "integration_id", "started_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    integration_id: Mapped[int] = mapped_column(
        ForeignKey("integrations.id", ondelete="CASCADE"), nullable=False
    )
    endpoint: Mapped[str] = mapped_column(String(60), nullable=False)
    direction: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    items_ok: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    items_failed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    triggered_by_user_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class ExpensePaymentStatus(Base):
    """ERP-reported payment confirmation for an approved expense.

    Reporting-only: the platform never derives payment status from this
    table — the ERP is authoritative. One row per (expense_id, integration_id);
    the latest update per pair wins.
    """

    __tablename__ = "expense_payment_statuses"
    __table_args__ = (
        UniqueConstraint(
            "expense_id", "integration_id", name="uq_expense_payment_status"
        ),
        Index("ix_expense_payment_status_expense", "expense_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    expense_id: Mapped[int] = mapped_column(Integer, nullable=False)
    integration_id: Mapped[int] = mapped_column(
        ForeignKey("integrations.id", ondelete="CASCADE"), nullable=False
    )
    erp_payment_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    erp_payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    erp_status: Mapped[str | None] = mapped_column(String(40), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reported_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
