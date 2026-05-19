"""Enhance expense_reports and polizas with builder fields.

Revision ID: a0b1c2d3e4f5
Revises: z1a2b3c4d5e6
Create Date: 2026-05-17

Adds:
  - expense_reports: total_amount, expense_count, currency, settlement_type,
    notes (JSON), generated_at, needs_accountant_review, mapping_snapshot
  - polizas: period, format, line_items (JSON), total_debit, total_credit,
    balanced, notes
"""
from alembic import op
import sqlalchemy as sa

revision = 'a0b1c2d3e4f5'
down_revision = 'z1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── expense_reports enhancements ──────────────────────────────────────
    op.add_column('expense_reports', sa.Column('total_amount', sa.Numeric(14, 2), nullable=True,
                  comment='Sum of all expense amounts in the report (MXN).'))
    op.add_column('expense_reports', sa.Column('expense_count', sa.Integer(), nullable=True,
                  comment='Number of expenses bundled in this report.'))
    op.add_column('expense_reports', sa.Column('currency', sa.String(3), nullable=False,
                  server_default='MXN',
                  comment='Primary currency of the report.'))
    op.add_column('expense_reports', sa.Column('settlement_type', sa.String(20), nullable=False,
                  server_default='reimbursable',
                  comment='Primary settlement type of the bundled expenses.'))
    op.add_column('expense_reports', sa.Column('notes', sa.Text(), nullable=True,
                  comment='JSON array of flagged issues for accountant review.'))
    op.add_column('expense_reports', sa.Column('generated_at', sa.DateTime(), nullable=True,
                  comment='When the report builder generated this report.'))
    op.add_column('expense_reports', sa.Column('needs_accountant_review', sa.Boolean(), nullable=False,
                  server_default='false',
                  comment='True if the builder flagged issues needing accountant attention.'))
    op.add_column('expense_reports', sa.Column('mapping_snapshot', sa.Text(), nullable=True,
                  comment='Pre-computed accounting mappings stored as JSON.'))

    # Update status comment to reflect new statuses
    # (Can't easily alter column comments in SQLite, skip for now)

    # ── polizas enhancements ────────────────────────────────────────────────
    op.add_column('polizas', sa.Column('period', sa.String(7), nullable=True,
                  comment='Accounting period in YYYY-MM format.'))
    op.add_column('polizas', sa.Column('format', sa.String(20), nullable=False,
                  server_default='coi',
                  comment='Output format: coi, contpaqi, csv, xml_sat.'))
    op.add_column('polizas', sa.Column('line_items', sa.Text(), nullable=True,
                  comment='Structured journal entry lines as JSON.'))
    op.add_column('polizas', sa.Column('total_debit', sa.Numeric(14, 2), nullable=True))
    op.add_column('polizas', sa.Column('total_credit', sa.Numeric(14, 2), nullable=True))
    op.add_column('polizas', sa.Column('balanced', sa.Boolean(), nullable=False,
                  server_default='false',
                  comment='True if total_debit == total_credit.'))
    op.add_column('polizas', sa.Column('notes', sa.Text(), nullable=True,
                  comment='Builder notes (issues, warnings, resolution notes).'))


def downgrade() -> None:
    # ── expense_reports ──────────────────────────────────────────────────
    op.drop_column('expense_reports', 'mapping_snapshot')
    op.drop_column('expense_reports', 'needs_accountant_review')
    op.drop_column('expense_reports', 'generated_at')
    op.drop_column('expense_reports', 'notes')
    op.drop_column('expense_reports', 'settlement_type')
    op.drop_column('expense_reports', 'currency')
    op.drop_column('expense_reports', 'expense_count')
    op.drop_column('expense_reports', 'total_amount')

    # ── polizas ──────────────────────────────────────────────────────────
    op.drop_column('polizas', 'notes')
    op.drop_column('polizas', 'balanced')
    op.drop_column('polizas', 'total_credit')
    op.drop_column('polizas', 'total_debit')
    op.drop_column('polizas', 'line_items')
    op.drop_column('polizas', 'format')
    op.drop_column('polizas', 'period')
