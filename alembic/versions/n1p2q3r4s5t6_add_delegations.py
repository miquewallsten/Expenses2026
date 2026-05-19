"""add delegations table

Revision ID: n1p2q3r4s5t6
Revises: l5m6n7o8p9q0
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa

revision = 'n1p2q3r4s5t6'
down_revision = 'l5m6n7o8p9q0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'delegations',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Integer(), nullable=False),
        sa.Column('delegate_user_id', sa.Integer(), nullable=False),
        sa.Column('principal_user_id', sa.Integer(), nullable=False),
        sa.Column('start_date', sa.Date(), nullable=True),
        sa.Column('end_date', sa.Date(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['delegate_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['principal_user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_delegations_principal', 'delegations', ['principal_user_id'])
    op.create_index('ix_delegations_delegate', 'delegations', ['delegate_user_id'])
    op.create_index('ix_delegations_company', 'delegations', ['company_id'])


def downgrade() -> None:
    op.drop_index('ix_delegations_company', table_name='delegations')
    op.drop_index('ix_delegations_delegate', table_name='delegations')
    op.drop_index('ix_delegations_principal', table_name='delegations')
    op.drop_table('delegations')
