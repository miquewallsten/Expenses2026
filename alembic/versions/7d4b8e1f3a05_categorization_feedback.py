"""categorization_feedback (Phase 8.3)

Revision ID: 7d4b8e1f3a05
Revises: 6c2a8d3e1b94
Create Date: 2026-04-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "7d4b8e1f3a05"
down_revision = "6c2a8d3e1b94"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "categorization_feedback",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer, nullable=False),
        sa.Column(
            "expense_id",
            sa.Integer,
            sa.ForeignKey("expenses.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("original_category", sa.String(80), nullable=True),
        sa.Column("corrected_category", sa.String(80), nullable=False),
        sa.Column("description_text", sa.Text, nullable=False),
        sa.Column("description_embedding", sa.Text, nullable=True),
        sa.Column("corrected_by_user_id", sa.Integer, nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False,
        ),
    )
    op.create_index(
        "ix_categorization_feedback_company_id",
        "categorization_feedback", ["company_id"],
    )
    op.create_index(
        "ix_categorization_feedback_expense_id",
        "categorization_feedback", ["expense_id"],
    )
    op.create_index(
        "ix_categorization_feedback_company_created",
        "categorization_feedback", ["company_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_categorization_feedback_company_created", table_name="categorization_feedback")
    op.drop_index("ix_categorization_feedback_expense_id", table_name="categorization_feedback")
    op.drop_index("ix_categorization_feedback_company_id", table_name="categorization_feedback")
    op.drop_table("categorization_feedback")
