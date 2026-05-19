"""add is_subcontractor to users

Revision ID: add_is_subcontractor
Revises:
Create Date: 2026-05-18

"""
from alembic import op
import sqlalchemy as sa

revision = "add_is_subcontractor"
down_revision = None  # Will be set by alembic revision
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_subcontractor", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("users", "is_subcontractor")
