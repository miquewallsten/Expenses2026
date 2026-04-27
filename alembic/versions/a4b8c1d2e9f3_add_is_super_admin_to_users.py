"""add is_super_admin to users

Adds platform-operator flag (cross-tenant access). Defaults to False —
existing users remain customer-scoped. Seeded via SUPER_ADMIN_EMAIL env
in apps/api/main.py startup if provided.

Revision ID: a4b8c1d2e9f3
Revises: d8e3a5c1f4b7
Create Date: 2026-04-27 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4b8c1d2e9f3"
down_revision: Union[str, None] = "d8e3a5c1f4b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "is_super_admin",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "is_super_admin")
