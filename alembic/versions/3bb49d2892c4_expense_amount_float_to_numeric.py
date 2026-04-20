"""expense_amount_float_to_numeric

Revision ID: 3bb49d2892c4
Revises: 5a218cf8245e
Create Date: 2026-04-19 00:16:51.953592

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3bb49d2892c4'
down_revision: Union[str, Sequence[str], None] = '90bca491487a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Change expenses.amount from FLOAT to NUMERIC(12,2)."""
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.alter_column(
            "amount",
            existing_type=sa.Float(),
            type_=sa.Numeric(precision=12, scale=2),
            existing_nullable=False,
        )


def downgrade() -> None:
    """Revert expenses.amount back to FLOAT."""
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.alter_column(
            "amount",
            existing_type=sa.Numeric(precision=12, scale=2),
            type_=sa.Float(),
            existing_nullable=False,
        )
