"""add wa_allowed_roles to channel_settings

Revision ID: b1c2d3e4f5a7
Revises: a0b1c2d3e4f6
Create Date: 2026-05-19 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = "b1c2d3e4f5a7"
down_revision = "a0b1c2d3e4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "channel_settings",
        sa.Column("wa_allowed_roles", sa.Text(), nullable=True, server_default="employee,manager,admin"),
    )


def downgrade() -> None:
    op.drop_column("channel_settings", "wa_allowed_roles")
