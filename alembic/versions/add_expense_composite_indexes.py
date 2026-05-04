"""add composite indexes for expense queries

Revision ID: add_expense_indexes
Revises: 1554879f2021
Create Date: 2026-05-03

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_expense_indexes'
down_revision = '1554879f2021'
branch_labels = None
depends_on = None


def upgrade():
    # Expense indexes for common query patterns
    op.create_index(
        'idx_expense_company_status',
        'expenses',
        ['company_id', 'status'],
        unique=False
    )
    op.create_index(
        'idx_expense_company_created',
        'expenses',
        ['company_id', sa.text('created_at DESC')],
        unique=False
    )

    # Archive file index for document lookup
    op.create_index(
        'idx_archive_company_expense',
        'archive_files',
        ['company_id', 'expense_id', 'file_name'],
        unique=False
    )


def downgrade():
    op.drop_index('idx_archive_company_expense', 'archive_files')
    op.drop_index('idx_expense_company_created', 'expenses')
    op.drop_index('idx_expense_company_status', 'expenses')