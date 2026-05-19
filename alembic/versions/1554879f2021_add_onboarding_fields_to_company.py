"""add_onboarding_fields_to_company

Revision ID: 1554879f2021
Revises: 086101a151f4
Create Date: 2026-05-03 21:16:25.476006

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '1554879f2021'
down_revision: Union[str, Sequence[str], None] = '086101a151f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add onboarding fields to companies table
    op.add_column('companies', sa.Column('onboarding_started_at', sa.DateTime(), nullable=True))
    op.add_column('companies', sa.Column('onboarding_completed_at', sa.DateTime(), nullable=True))
    op.add_column('companies', sa.Column('onboarding_step', sa.String(50), nullable=True))
    op.add_column('companies', sa.Column('onboarding_data', sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('companies', 'onboarding_data')
    op.drop_column('companies', 'onboarding_step')
    op.drop_column('companies', 'onboarding_completed_at')
    op.drop_column('companies', 'onboarding_started_at')
