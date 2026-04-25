"""add amex reconciliation module flag

Revision ID: b5e8f1c3d7a2
Revises: a1b2c3d4e5f6
Create Date: 2026-04-23 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b5e8f1c3d7a2"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "company_setup",
        sa.Column(
            "amex_reconciliation_module_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    # Drop the server_default so Python-level defaults govern new rows.
    op.alter_column(
        "company_setup", "amex_reconciliation_module_enabled", server_default=None
    )


def downgrade() -> None:
    op.drop_column("company_setup", "amex_reconciliation_module_enabled")
