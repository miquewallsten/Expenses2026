"""add is_active to companies

Revision ID: y8z7x6w5v4u3
Revises: x9y8z7w6v5u4
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'y8z7x6w5v4u3'
down_revision = 'x9y8z7w6v5u4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')))


def downgrade() -> None:
    op.drop_column('companies', 'is_active')
