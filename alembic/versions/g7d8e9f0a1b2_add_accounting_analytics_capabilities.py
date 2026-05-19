"""add accounting and analytics capability flags to users

Revision ID: g7d8e9f0a1b2
Revises: f6c110def965
Create Date: 2026-05-04

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'g7d8e9f0a1b2'
down_revision = 'f6c110def965'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new capability flags for admin users who need accounting/analytics access
    op.add_column('users', sa.Column('can_access_accounting', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('can_view_analytics', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'can_view_analytics')
    op.drop_column('users', 'can_access_accounting')