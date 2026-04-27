"""Repair: re-add expense CFDI lifecycle columns that drifted out of OrbStack/prod

Revision ID: e7f1c3a5d2b8
Revises: b3c5d7e9f1a2
Create Date: 2026-04-26

Background
----------
Migration ``3d8f2e6b1c4a_expense_cfdi_lifecycle`` is part of the linear
upgrade chain but its DDL never ran on the OrbStack and on-prem
databases — they were ``alembic stamp``-ed past it during the Phase 8.13
drift recovery (when the env.py-wraps-everything-in-one-tx bug caused a
late migration to fail and roll back every prior step in the same
batch). Models declare ``cfdi_uuid`` / ``cfdi_status`` /
``cfdi_last_checked_at`` / ``cfdi_amount_mismatch`` and SQL queries
reference them, so reads against ``expenses`` raise
``UndefinedColumn`` on those installs.

This migration re-applies the original DDL idempotently so it is safe to
run on databases that already have the columns (greenfield) and on
those that don't (drifted prod / OrbStack).
"""
from __future__ import annotations

from typing import Union

from alembic import op


revision: str = "e7f1c3a5d2b8"
down_revision: Union[str, None] = "b3c5d7e9f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw SQL with IF NOT EXISTS so this migration is idempotent and
    # safe to run on databases where the original 3d8f2e6b1c4a migration
    # actually executed.
    op.execute(
        "ALTER TABLE expenses "
        "ADD COLUMN IF NOT EXISTS cfdi_uuid VARCHAR(36)"
    )
    op.execute(
        "ALTER TABLE expenses "
        "ADD COLUMN IF NOT EXISTS cfdi_status VARCHAR(20)"
    )
    op.execute(
        "ALTER TABLE expenses "
        "ADD COLUMN IF NOT EXISTS cfdi_last_checked_at TIMESTAMP"
    )
    op.execute(
        "ALTER TABLE expenses "
        "ADD COLUMN IF NOT EXISTS cfdi_amount_mismatch BOOLEAN "
        "NOT NULL DEFAULT FALSE"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_expenses_cfdi_uuid "
        "ON expenses (cfdi_uuid)"
    )


def downgrade() -> None:
    # Intentional no-op. The original 3d8f2e6b1c4a migration owns the
    # canonical drop path; rolling back this repair would re-trigger the
    # drift it was created to fix.
    pass
