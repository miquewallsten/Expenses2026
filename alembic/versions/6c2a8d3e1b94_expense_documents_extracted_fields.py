"""expense_documents.extracted_fields (Phase 8.2)

Revision ID: 6c2a8d3e1b94
Revises: 5b9c1d4e7a82
Create Date: 2026-04-25
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "6c2a8d3e1b94"
down_revision = "5b9c1d4e7a82"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        col_type = sa.dialects.postgresql.JSONB()
    else:
        col_type = sa.JSON()
    op.add_column(
        "expense_documents",
        sa.Column("extracted_fields", col_type, nullable=True),
    )


def downgrade() -> None:
    op.drop_column("expense_documents", "extracted_fields")
