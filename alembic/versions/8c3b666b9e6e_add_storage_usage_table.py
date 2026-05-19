"""add_storage_usage_table

Revision ID: 8c3b666b9e6e
Revises: e741f6a0cb2f
Create Date: 2026-05-04 10:10:02.670080

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8c3b666b9e6e'
down_revision: Union[str, Sequence[str], None] = 'e741f6a0cb2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'storage_usage',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('period_start', sa.Date(), nullable=False),
        sa.Column('period_end', sa.Date(), nullable=False),
        sa.Column('files_bytes', sa.BigInteger(), nullable=True),
        sa.Column('db_bytes', sa.BigInteger(), nullable=True),
        sa.Column('total_bytes', sa.BigInteger(), nullable=True),
        sa.Column('included_bytes', sa.BigInteger(), nullable=True),
        sa.Column('overage_bytes', sa.BigInteger(), nullable=True),
        sa.Column('calculated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('billed', sa.Boolean(), nullable=True),
        sa.Column('billed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], name='fk_storage_usage_company_id'),
    )
    op.create_index('ix_storage_usage_company_period', 'storage_usage', ['company_id', 'period_start', 'period_end'], unique=True)
    op.create_index(op.f('ix_storage_usage_company_id'), 'storage_usage', ['company_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_storage_usage_company_id'), table_name='storage_usage')
    op.drop_index('ix_storage_usage_company_period', table_name='storage_usage')
    op.drop_table('storage_usage')
