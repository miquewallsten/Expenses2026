"""add dev_login_enabled to company_setup

Revision ID: x9y8z7w6v5u4
Revises: n1p2q3r4s5t6
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'x9y8z7w6v5u4'
down_revision = 'n1p2q3r4s5t6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('company_setup', sa.Column('dev_login_enabled', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('company_setup', 'dev_login_enabled')
