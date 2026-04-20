"""add report_cycle_settings and extend expense_reports

Revision ID: b2e4a9f1c8d7
Revises: 44ef73e694c5
Create Date: 2026-04-20

"""
from alembic import op
import sqlalchemy as sa

revision = "b2e4a9f1c8d7"
down_revision = "44ef73e694c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── New table: report_cycle_settings ─────────────────────────────────────
    op.create_table(
        "report_cycle_settings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, unique=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("frequency", sa.String(20), nullable=False, server_default="monthly"),
        sa.Column("day_of_week", sa.Integer(), nullable=True),
        sa.Column("day_of_month", sa.Integer(), nullable=True, server_default="1"),
        sa.Column("time_of_day", sa.String(5), nullable=False, server_default="18:00"),
        sa.Column("auto_submit", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column(
            "bundle_statuses",
            sa.String(200),
            nullable=False,
            server_default="submitted,manager_approved",
        ),
        sa.Column(
            "report_name_template",
            sa.String(255),
            nullable=False,
            server_default="{user} — {month} {year}",
        ),
        sa.Column("last_run_at", sa.DateTime(), nullable=True),
        sa.Column("next_run_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_report_cycle_settings_company_id",
        "report_cycle_settings",
        ["company_id"],
        unique=True,
    )

    # ── Extend expense_reports ────────────────────────────────────────────────
    op.add_column("expense_reports", sa.Column("user_id", sa.Integer(), nullable=True))
    op.add_column("expense_reports", sa.Column("period_start", sa.Date(), nullable=True))
    op.add_column("expense_reports", sa.Column("period_end", sa.Date(), nullable=True))
    op.add_column(
        "expense_reports",
        sa.Column("triggered_by", sa.String(20), nullable=False, server_default="user"),
    )
    op.add_column(
        "expense_reports",
        sa.Column("cycle_settings_id", sa.Integer(), nullable=True),
    )
    op.create_index(
        "ix_expense_reports_user_id",
        "expense_reports",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_expense_reports_user_id", table_name="expense_reports")
    op.drop_column("expense_reports", "cycle_settings_id")
    op.drop_column("expense_reports", "triggered_by")
    op.drop_column("expense_reports", "period_end")
    op.drop_column("expense_reports", "period_start")
    op.drop_column("expense_reports", "user_id")

    op.drop_index("ix_report_cycle_settings_company_id", table_name="report_cycle_settings")
    op.drop_table("report_cycle_settings")
