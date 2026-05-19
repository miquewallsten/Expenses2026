"""Add company_setup missing columns only

Revision ID: d306de71b72b
Revises: a4b8c1d2e9f3
Create Date: 2026-04-29 12:37:30.378017

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd306de71b72b'
down_revision: Union[str, Sequence[str], None] = 'a4b8c1d2e9f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('company_setup', sa.Column('amex_reconciliation_module_enabled', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('company_setup', sa.Column('onboarding_step', sa.Integer(), server_default='0', nullable=False))
    op.add_column('company_setup', sa.Column('onboarding_completed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('company_setup', 'onboarding_completed_at')
    op.drop_column('company_setup', 'onboarding_step')
    op.drop_column('company_setup', 'amex_reconciliation_module_enabled')
