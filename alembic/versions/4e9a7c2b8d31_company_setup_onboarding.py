"""company setup onboarding wizard state

Revision ID: 4e9a7c2b8d31
Revises: 3d8f2e6b1c4a
Create Date: 2026-04-24

"""
from __future__ import annotations

from typing import Union

import sqlalchemy as sa
from alembic import op


revision: str = "4e9a7c2b8d31"
down_revision: Union[str, None] = "3d8f2e6b1c4a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "company_setup",
        sa.Column(
            "onboarding_step",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "company_setup",
        sa.Column("onboarding_completed_at", sa.DateTime(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("company_setup", "onboarding_completed_at")
    op.drop_column("company_setup", "onboarding_step")
