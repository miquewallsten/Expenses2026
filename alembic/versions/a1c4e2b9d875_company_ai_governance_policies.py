"""Phase 8.10 — per-tenant AI governance policy

Revision ID: a1c4e2b9d875
Revises: 9f3a2c8e1b27
Create Date: 2026-04-26 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "a1c4e2b9d875"
down_revision = "9f3a2c8e1b27"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "company_ai_governance_policies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"),
                  nullable=False, unique=True),
        sa.Column("ai_enabled", sa.Boolean(), nullable=False,
                  server_default=sa.text("true")),
        sa.Column("allowed_models", sa.String(length=512), nullable=False,
                  server_default="*"),
        sa.Column("pii_redaction_level", sa.String(length=20), nullable=False,
                  server_default="standard"),
        sa.Column("max_tokens_per_call", sa.Integer(), nullable=False,
                  server_default="4096"),
        sa.Column("monthly_token_budget", sa.Integer(), nullable=False,
                  server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index(
        "ix_company_ai_governance_policies_company_id",
        "company_ai_governance_policies",
        ["company_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_company_ai_governance_policies_company_id",
        table_name="company_ai_governance_policies",
    )
    op.drop_table("company_ai_governance_policies")
