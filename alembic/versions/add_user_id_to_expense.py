"""Add user_id to Expense model.

Revision ID: add_user_id_to_expense
Revises: h8e9f0a1b2c3
Create Date: 2026-05-06 12:00:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_user_id_to_expense'
down_revision = 'h8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('expenses', sa.Column('user_id', sa.Integer(), nullable=True))
    op.create_index(op.f('idx_expense_user_id'), 'expenses', ['user_id'], unique=False)
    # We allow nullable for now to handle migration of existing records, 
    # but application logic should usually enforce it.


def downgrade():
    op.drop_index(op.f('idx_expense_user_id'), table_name='expenses')
    op.drop_column('expenses', 'user_id')
