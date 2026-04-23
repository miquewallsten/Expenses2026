"""add agent_v2_enabled flag on company_setup

Revision ID: f2b4c9a1d3e5
Revises: e7c9a2d4b6f1
Create Date: 2026-04-22 00:00:00
"""
from alembic import op
import sqlalchemy as sa


revision = "f2b4c9a1d3e5"
down_revision = "e7c9a2d4b6f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_setup",
        sa.Column(
            "agent_v2_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )


def downgrade() -> None:
    op.drop_column("company_setup", "agent_v2_enabled")
