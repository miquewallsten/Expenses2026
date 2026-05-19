"""add missing columns: users.tags, users.deleted_at

Revision ID: z1a2b3c4d5e6
Revises: y8z7x6w5v4u3
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'z1a2b3c4d5e6'
down_revision = 'y8z7x6w5v4u3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tags column to users (JSON)
    op.add_column('users', sa.Column('tags', sa.JSON(), nullable=True))
    # Add deleted_at column to users (soft delete)
    op.add_column('users', sa.Column('deleted_at', sa.DateTime(), nullable=True))
    # Add delegates_for_user_name column to users if missing
    op.add_column('users', sa.Column('delegates_for_user_name', sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'delegates_for_user_name')
    op.drop_column('users', 'deleted_at')
    op.drop_column('users', 'tags')
