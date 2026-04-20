"""add_purchase_requests_module_flag_to_company_setup

Revision ID: 44ef73e694c5
Revises: 4cc583b92709
Create Date: 2026-04-20 13:39:28.031426

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '44ef73e694c5'
down_revision: Union[str, Sequence[str], None] = '4cc583b92709'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add purchase_requests_module_enabled flag to company_setup (default False)."""
    op.add_column(
        'company_setup',
        sa.Column('purchase_requests_module_enabled', sa.Boolean(), nullable=False, server_default='false'),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('company_setup', 'purchase_requests_module_enabled')
