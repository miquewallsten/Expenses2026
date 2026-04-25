"""ai_policies table + drop dead toggle columns

Adds:
  - ai_policies (new table for natural-language → structured policies)

Drops dead columns (audit confirmed zero runtime consumers):
  company_setup:
    has_accounting_team, has_subcontractors, agent_v2_enabled,
    ai_setup_completed, ai_copilot_enabled,
    operates_multi_entity, operates_multi_country
  company_expense_policies:
    manager_approval_required, accounting_review_required,
    ai_policy_assist_enabled
  approval_setup:
    accounting_threshold_amount, allow_self_submission_without_manager,
    escalate_missing_documents_to_manager, ai_approval_assist_enabled,
    ai_approval_notes
  workflow_setup: drops the entire table — its 2 useful fields
    (block_submit_on_failed_validation, allow_submit_with_warnings) live in
    accounting_setup.allow_submit_with_warnings + transition_service hard rule.

Revision ID: a1b2c3d4e5f6
Revises: c9d2f4a7e3b1
Create Date: 2026-04-23 17:00:00
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "c9d2f4a7e3b1"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    # ── 1. New ai_policies table ────────────────────────────────────────────
    op.create_table(
        "ai_policies",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), sa.ForeignKey("companies.id"), nullable=False, index=True),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("rule_json", JSONB(), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=False),
        sa.Column("scope", sa.String(length=40), nullable=False, server_default="expense_validation"),
        sa.Column("severity", sa.String(length=10), nullable=False, server_default="warn"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )

    # ── 2. Drop dead columns: company_setup ─────────────────────────────────
    for col in (
        "has_accounting_team",
        "has_subcontractors",
        "agent_v2_enabled",
        "ai_setup_completed",
        "ai_copilot_enabled",
        "operates_multi_entity",
        "operates_multi_country",
    ):
        op.execute(f'ALTER TABLE company_setup DROP COLUMN IF EXISTS {col}')

    # ── 3. Drop dead columns: company_expense_policies ──────────────────────
    for col in (
        "manager_approval_required",
        "accounting_review_required",
        "ai_policy_assist_enabled",
    ):
        op.execute(f'ALTER TABLE company_expense_policies DROP COLUMN IF EXISTS {col}')

    # ── 4. Drop dead columns: approval_setup ────────────────────────────────
    for col in (
        "accounting_threshold_amount",
        "allow_self_submission_without_manager",
        "escalate_missing_documents_to_manager",
        "ai_approval_assist_enabled",
        "ai_approval_notes",
    ):
        op.execute(f'ALTER TABLE approval_setup DROP COLUMN IF EXISTS {col}')

    # ── 5. Drop workflow_setup table entirely ───────────────────────────────
    op.execute("DROP TABLE IF EXISTS workflow_setup CASCADE")


def downgrade() -> None:
    # Best-effort restore — restores types only, not the data which is gone.
    op.execute("""
        CREATE TABLE IF NOT EXISTS workflow_setup (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id) UNIQUE,
            default_expense_workflow_mode VARCHAR(50) NOT NULL DEFAULT 'standard',
            auto_submit_on_complete_upload BOOLEAN NOT NULL DEFAULT FALSE,
            block_submit_on_failed_validation BOOLEAN NOT NULL DEFAULT TRUE,
            allow_submit_with_warnings BOOLEAN NOT NULL DEFAULT FALSE,
            auto_assign_review_stage BOOLEAN NOT NULL DEFAULT TRUE,
            route_policy_failures_to VARCHAR(50) NOT NULL DEFAULT 'accounting',
            route_missing_documents_to VARCHAR(50) NOT NULL DEFAULT 'employee',
            route_international_expenses_to VARCHAR(50) NOT NULL DEFAULT 'accounting',
            allow_draft_save BOOLEAN NOT NULL DEFAULT TRUE,
            allow_resubmit_after_return BOOLEAN NOT NULL DEFAULT TRUE,
            show_next_action_guidance BOOLEAN NOT NULL DEFAULT TRUE,
            ai_workflow_assist_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            ai_workflow_notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        )
    """)
    op.execute("ALTER TABLE approval_setup ADD COLUMN IF NOT EXISTS ai_approval_notes TEXT")
    op.execute("ALTER TABLE approval_setup ADD COLUMN IF NOT EXISTS ai_approval_assist_enabled BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE approval_setup ADD COLUMN IF NOT EXISTS escalate_missing_documents_to_manager BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE approval_setup ADD COLUMN IF NOT EXISTS allow_self_submission_without_manager BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE approval_setup ADD COLUMN IF NOT EXISTS accounting_threshold_amount FLOAT")
    op.execute("ALTER TABLE company_expense_policies ADD COLUMN IF NOT EXISTS ai_policy_assist_enabled BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE company_expense_policies ADD COLUMN IF NOT EXISTS accounting_review_required BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE company_expense_policies ADD COLUMN IF NOT EXISTS manager_approval_required BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS operates_multi_country BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS operates_multi_entity BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS ai_copilot_enabled BOOLEAN NOT NULL DEFAULT TRUE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS ai_setup_completed BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS agent_v2_enabled BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS has_subcontractors BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE company_setup ADD COLUMN IF NOT EXISTS has_accounting_team BOOLEAN NOT NULL DEFAULT TRUE")
    op.drop_table("ai_policies")
