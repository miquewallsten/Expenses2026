"""agent_usage composite index (Phase 8.6)

Revision ID: 9f3a2c8e1b27
Revises: 7d4b8e1f3a05
Create Date: 2026-04-26
"""
from __future__ import annotations

from alembic import op

revision = "9f3a2c8e1b27"
down_revision = "7d4b8e1f3a05"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_agent_usage_company_created",
        "agent_usage",
        ["company_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_agent_usage_company_created", table_name="agent_usage")
