"""Repair: re-add company_setup onboarding + expense_documents.extracted_fields

Revision ID: f3a8c5e2b1d6
Revises: e7f1c3a5d2b8
Create Date: 2026-04-26

Background
----------
Sibling repair to e7f1c3a5d2b8. ``alembic check`` after that one
flagged two more sets of columns silently missing from databases that
were ``alembic stamp``-ed past the failing migration during the Phase
8.13 drift recovery:

* 4e9a7c2b8d31 — ``company_setup.onboarding_step`` (NOT NULL DEFAULT 0)
  and ``company_setup.onboarding_completed_at`` (nullable TIMESTAMP).
* 6c2a8d3e1b94 — ``expense_documents.extracted_fields`` (JSONB on
  Postgres / JSON on SQLite).

Each statement is idempotent (IF NOT EXISTS), so this migration is a
no-op on greenfield databases and a fix on drifted ones.
"""
from __future__ import annotations

from typing import Union

from alembic import op


revision: str = "f3a8c5e2b1d6"
down_revision: Union[str, None] = "e7f1c3a5d2b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    is_pg = bind.dialect.name == "postgresql"

    # 4e9a7c2b8d31 — company_setup onboarding wizard state.
    op.execute(
        "ALTER TABLE company_setup "
        "ADD COLUMN IF NOT EXISTS onboarding_step INTEGER "
        "NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE company_setup "
        "ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP"
    )

    # 6c2a8d3e1b94 — expense_documents.extracted_fields. Use JSONB on
    # Postgres to match the original migration's column type.
    extracted_fields_type = "JSONB" if is_pg else "JSON"
    op.execute(
        "ALTER TABLE expense_documents "
        f"ADD COLUMN IF NOT EXISTS extracted_fields {extracted_fields_type}"
    )


def downgrade() -> None:
    # Intentional no-op. The original migrations own the canonical drop
    # path; rolling back this repair would re-trigger the drift it was
    # created to fix.
    pass
