"""add_company_profile_narrative

Revision ID: e6f2a9b3c1d5
Revises: d5e1f8a2b3c4
Create Date: 2026-04-22 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e6f2a9b3c1d5"
down_revision: Union[str, Sequence[str], None] = "b2e4a9f1c8d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("company_setup")}
    if "company_profile_narrative" not in existing:
        op.add_column(
            "company_setup",
            sa.Column("company_profile_narrative", sa.Text, nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing = {c["name"] for c in inspector.get_columns("company_setup")}
    if "company_profile_narrative" in existing:
        op.drop_column("company_setup", "company_profile_narrative")
