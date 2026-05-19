"""user_salary_configs table for time cost calculation

Revision ID: sal_cfg_001
Revises: 
Create Date: 2026-05-18
"""
from alembic import op
import sqlalchemy as sa

revision = "sal_cfg_001"
down_revision = None  # adjust to last migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_salary_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("hourly_rate", sa.Numeric(12, 2), nullable=False),
        sa.Column("monthly_salary", sa.Numeric(14, 2), nullable=True),
        sa.Column("currency", sa.String(3), server_default="MXN"),
        sa.Column("effective_date", sa.Date(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true()),
        sa.Column("role_title", sa.String(255), nullable=True),
        sa.Column("default_cost_center_id", sa.Integer(), nullable=True),
        sa.Column("default_project_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.String(500), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_salary_company_user", "user_salary_configs", ["company_id", "user_id"])
    op.create_index("idx_salary_active", "user_salary_configs", ["company_id", "is_active"])


def downgrade() -> None:
    op.drop_index("idx_salary_active", table_name="user_salary_configs")
    op.drop_index("idx_salary_company_user", table_name="user_salary_configs")
    op.drop_table("user_salary_configs")
