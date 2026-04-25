"""expense cfdi lifecycle (anexo 24 + cancel watcher)

Revision ID: 3d8f2e6b1c4a
Revises: 2c9b5e7a4d18
Create Date: 2026-04-24

"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "3d8f2e6b1c4a"
down_revision: Union[str, None] = "2c9b5e7a4d18"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("expenses", sa.Column("cfdi_uuid", sa.String(36), nullable=True))
    op.add_column("expenses", sa.Column("cfdi_status", sa.String(20), nullable=True))
    op.add_column("expenses", sa.Column("cfdi_last_checked_at", sa.DateTime(), nullable=True))
    op.add_column(
        "expenses",
        sa.Column(
            "cfdi_amount_mismatch",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.create_index(
        "ix_expenses_cfdi_uuid", "expenses", ["cfdi_uuid"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_cfdi_uuid", table_name="expenses")
    op.drop_column("expenses", "cfdi_amount_mismatch")
    op.drop_column("expenses", "cfdi_last_checked_at")
    op.drop_column("expenses", "cfdi_status")
    op.drop_column("expenses", "cfdi_uuid")
