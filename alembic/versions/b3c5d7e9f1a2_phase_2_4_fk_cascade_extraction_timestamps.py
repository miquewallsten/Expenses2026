"""Phase 2.4 — FK cascade + extraction timestamps + content_text cap

- expense_documents.expense_id           → FK → expenses.id  ON DELETE SET NULL
  (nullable: orphan staging rows are intentional, so SET NULL not CASCADE)
- expense_attachments.expense_id         → FK → expenses.id  ON DELETE CASCADE
- expense_allocations.expense_id         → FK → expenses.id  ON DELETE CASCADE
- expense_documents.extraction_started_at, extraction_completed_at (nullable DateTime)
- CHECK length(content_text) <= 1048576  on expense_documents and expense_attachments

Uses batch_alter_table so SQLite (test DB) can rewrite the table to add FKs.
PostgreSQL accepts ALTER TABLE ADD CONSTRAINT directly inside the same batch.

Revision ID: b3c5d7e9f1a2
Revises: a1c4e2b9d875
Create Date: 2026-04-26
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b3c5d7e9f1a2"
down_revision = "a1c4e2b9d875"
branch_labels = None
depends_on = None


_CONTENT_TEXT_CAP = 1_048_576  # 1 MiB


def upgrade() -> None:
    # ── Pre-flight: clean orphaned rows ──────────────────────────────────────
    # FK enforcement was previously off for these columns, so the production DB
    # may contain rows whose expense_id no longer references an existing
    # expense. The new FKs would reject these. Apply each FK's intended on-
    # delete behaviour to the existing orphans before adding the constraint.
    op.execute(
        # documents: SET NULL on orphan expense_id (matches ondelete='SET NULL')
        "UPDATE expense_documents SET expense_id = NULL "
        "WHERE expense_id IS NOT NULL "
        "AND expense_id NOT IN (SELECT id FROM expenses)"
    )
    op.execute(
        # attachments: CASCADE delete on orphans (matches ondelete='CASCADE')
        "DELETE FROM expense_attachments "
        "WHERE expense_id NOT IN (SELECT id FROM expenses)"
    )
    op.execute(
        # allocations: CASCADE delete on orphans
        "DELETE FROM expense_allocations "
        "WHERE expense_id NOT IN (SELECT id FROM expenses)"
    )

    # ── expense_documents ────────────────────────────────────────────────────
    with op.batch_alter_table("expense_documents") as batch:
        batch.add_column(sa.Column("extraction_started_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("extraction_completed_at", sa.DateTime(), nullable=True))
        batch.create_foreign_key(
            "fk_expense_documents_expense_id",
            "expenses",
            ["expense_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_check_constraint(
            "ck_expense_documents_content_text_cap",
            f"length(content_text) <= {_CONTENT_TEXT_CAP}",
        )

    # ── expense_attachments ──────────────────────────────────────────────────
    with op.batch_alter_table("expense_attachments") as batch:
        batch.create_foreign_key(
            "fk_expense_attachments_expense_id",
            "expenses",
            ["expense_id"],
            ["id"],
            ondelete="CASCADE",
        )
        batch.create_check_constraint(
            "ck_expense_attachments_content_text_cap",
            f"length(content_text) <= {_CONTENT_TEXT_CAP}",
        )

    # ── expense_allocations ──────────────────────────────────────────────────
    with op.batch_alter_table("expense_allocations") as batch:
        batch.create_foreign_key(
            "fk_expense_allocations_expense_id",
            "expenses",
            ["expense_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("expense_allocations") as batch:
        batch.drop_constraint("fk_expense_allocations_expense_id", type_="foreignkey")

    with op.batch_alter_table("expense_attachments") as batch:
        batch.drop_constraint("ck_expense_attachments_content_text_cap", type_="check")
        batch.drop_constraint("fk_expense_attachments_expense_id", type_="foreignkey")

    with op.batch_alter_table("expense_documents") as batch:
        batch.drop_constraint("ck_expense_documents_content_text_cap", type_="check")
        batch.drop_constraint("fk_expense_documents_expense_id", type_="foreignkey")
        batch.drop_column("extraction_completed_at")
        batch.drop_column("extraction_started_at")
