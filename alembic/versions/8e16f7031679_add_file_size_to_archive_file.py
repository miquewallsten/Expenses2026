"""add_file_size_to_archive_file

Revision ID: 8e16f7031679
Revises: 0e69bec78e33
Create Date: 2026-05-04 11:31:10.143335

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8e16f7031679'
down_revision: Union[str, Sequence[str], None] = '0e69bec78e33'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('archive_files', sa.Column('size_bytes', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('archive_files', 'size_bytes')
