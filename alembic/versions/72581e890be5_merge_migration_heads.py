"""merge migration heads

Revision ID: 72581e890be5
Revises: add_user_id_to_expense, h8e9f0a1b2c3
Create Date: 2026-05-06 13:55:57.887683

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '72581e890be5'
down_revision: Union[str, Sequence[str], None] = ('add_user_id_to_expense', 'h8e9f0a1b2c3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
