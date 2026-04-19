"""expense_integrity_constraints

Revision ID: 11d026dfb416
Revises: 3bb49d2892c4
Create Date: 2026-04-19 00:18:50.050027

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '11d026dfb416'
down_revision: Union[str, Sequence[str], None] = '3bb49d2892c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add CHECK constraints to expenses table via batch mode (required for SQLite)."""
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.create_check_constraint(
            "ck_expense_status_valid",
            "status IN ('draft','submitted','manager_approved','approved','rejected')",
        )
        batch_op.create_check_constraint(
            "ck_expense_settlement_type_valid",
            "settlement_type IN ('reimbursable','corporate_card','advance')",
        )
        batch_op.create_check_constraint(
            "ck_expense_amount_non_negative",
            "amount >= 0",
        )


def downgrade() -> None:
    """Remove CHECK constraints from expenses table."""
    with op.batch_alter_table("expenses", schema=None) as batch_op:
        batch_op.drop_constraint("ck_expense_status_valid", type_="check")
        batch_op.drop_constraint("ck_expense_settlement_type_valid", type_="check")
        batch_op.drop_constraint("ck_expense_amount_non_negative", type_="check")
