"""integrations module — schema (Phase 4.1)

Revision ID: 1f4a8c2d6e9b
Revises: e8a1b2f6c7d4
Create Date: 2026-04-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "1f4a8c2d6e9b"
down_revision: Union[str, None] = "e8a1b2f6c7d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "integrations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("vendor", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("config_json", sa.JSON(), nullable=True),
        sa.Column("credentials_ref", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('erp','bank_statement','hris','generic_webhook')",
            name="ck_integration_kind_valid",
        ),
    )
    op.create_index(
        "ix_integrations_company_kind", "integrations", ["company_id", "kind"]
    )

    op.create_table(
        "integration_endpoints",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "integration_id",
            sa.Integer(),
            sa.ForeignKey("integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.String(length=60), nullable=False),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("auth_strategy", sa.String(length=40), nullable=True),
        sa.Column("target_url", sa.Text(), nullable=True),
        sa.Column("settings_json", sa.JSON(), nullable=True),
        sa.Column("schedule_cron", sa.String(length=60), nullable=True),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("last_status", sa.String(length=30), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "integration_id", "endpoint", name="uq_integration_endpoint"
        ),
    )
    op.create_index(
        "ix_integration_endpoints_integration",
        "integration_endpoints",
        ["integration_id"],
    )

    op.create_table(
        "integration_sync_runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "integration_id",
            sa.Integer(),
            sa.ForeignKey("integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("endpoint", sa.String(length=60), nullable=False),
        sa.Column("direction", sa.String(length=12), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "started_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column(
            "items_ok", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "items_failed", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("error_summary", sa.Text(), nullable=True),
        sa.Column("request_id", sa.String(length=60), nullable=True, index=True),
        sa.Column("triggered_by_user_id", sa.Integer(), nullable=True),
        sa.CheckConstraint(
            "direction IN ('outbound','inbound')",
            name="ck_sync_run_direction_valid",
        ),
        sa.CheckConstraint(
            "status IN ('pending','running','succeeded','failed','partial')",
            name="ck_sync_run_status_valid",
        ),
    )
    op.create_index(
        "ix_sync_runs_integration_started",
        "integration_sync_runs",
        ["integration_id", "started_at"],
    )

    op.create_table(
        "expense_payment_statuses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("expense_id", sa.Integer(), nullable=False),
        sa.Column(
            "integration_id",
            sa.Integer(),
            sa.ForeignKey("integrations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("erp_payment_reference", sa.String(length=120), nullable=True),
        sa.Column("erp_payment_date", sa.Date(), nullable=True),
        sa.Column("erp_status", sa.String(length=40), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "reported_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "expense_id", "integration_id", name="uq_expense_payment_status"
        ),
    )
    op.create_index(
        "ix_expense_payment_status_expense",
        "expense_payment_statuses",
        ["expense_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_expense_payment_status_expense", table_name="expense_payment_statuses"
    )
    op.drop_table("expense_payment_statuses")
    op.drop_index(
        "ix_sync_runs_integration_started", table_name="integration_sync_runs"
    )
    op.drop_table("integration_sync_runs")
    op.drop_index(
        "ix_integration_endpoints_integration", table_name="integration_endpoints"
    )
    op.drop_table("integration_endpoints")
    op.drop_index("ix_integrations_company_kind", table_name="integrations")
    op.drop_table("integrations")
