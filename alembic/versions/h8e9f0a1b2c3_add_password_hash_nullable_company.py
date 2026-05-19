"""add password_hash and make company_id nullable for super-admins

Revision ID: h8e9f0a1b2c3
Revises: g7d8e9f0a1b2
Create Date: 2026-05-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'h8e9f0a1b2c3'
down_revision = '8e16f7031679'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add password_hash column for super-admin password authentication
    op.add_column(
        'users',
        sa.Column(
            'password_hash',
            sa.String(128),
            nullable=True,
        ),
    )
    # Make company_id nullable for super-admins who have no company association
    op.alter_column(
        'users',
        'company_id',
        existing_type=sa.Integer(),
        nullable=True,
    )


def downgrade() -> None:
    op.drop_column('users', 'password_hash')
    op.alter_column(
        'users',
        'company_id',
        existing_type=sa.Integer(),
        nullable=False,
    )