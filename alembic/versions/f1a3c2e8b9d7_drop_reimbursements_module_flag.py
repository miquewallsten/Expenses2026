"""drop reimbursements_module_enabled flag

Reimbursements module was never built — remove the dead flag.

Revision ID: f1a3c2e8b9d7
Revises: e6f2a9b3c1d5
Create Date: 2026-04-22
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a3c2e8b9d7"
down_revision: Union[str, Sequence[str], None] = "e6f2a9b3c1d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("company_setup", "reimbursements_module_enabled")


def downgrade() -> None:
    op.add_column(
        "company_setup",
        sa.Column(
            "reimbursements_module_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
        ),
    )
