"""platform api keys + webhook subscriptions + deliveries (Phase 4.2)

Revision ID: 2c9b5e7a4d18
Revises: 1f4a8c2d6e9b
Create Date: 2026-04-24 00:30:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "2c9b5e7a4d18"
down_revision: Union[str, None] = "1f4a8c2d6e9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "platform_api_keys",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("key_prefix", sa.String(length=16), nullable=False),
        sa.Column("hashed_secret", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("scopes", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_platform_api_keys_company_active",
        "platform_api_keys",
        ["company_id", "revoked_at"],
    )
    op.create_index(
        "ix_platform_api_keys_prefix", "platform_api_keys", ["key_prefix"]
    )

    op.create_table(
        "webhook_subscriptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("secret", sa.String(length=120), nullable=False),
        sa.Column(
            "is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()
        ),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_webhook_subs_company_event",
        "webhook_subscriptions",
        ["company_id", "event_type"],
    )

    op.create_table(
        "webhook_deliveries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "subscription_id",
            sa.Integer(),
            sa.ForeignKey("webhook_subscriptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("company_id", sa.Integer(), nullable=False, index=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("resource_type", sa.String(length=40), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=False),
        sa.Column("nonce", sa.String(length=64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "attempt_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("delivered_at", sa.DateTime(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending','delivering','succeeded','failed','abandoned')",
            name="ck_webhook_delivery_status_valid",
        ),
        sa.UniqueConstraint(
            "subscription_id",
            "event_type",
            "resource_type",
            "resource_id",
            "nonce",
            name="uq_webhook_delivery_dedup",
        ),
    )
    op.create_index(
        "ix_webhook_deliveries_status_next",
        "webhook_deliveries",
        ["status", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_webhook_deliveries_status_next", table_name="webhook_deliveries"
    )
    op.drop_table("webhook_deliveries")
    op.drop_index(
        "ix_webhook_subs_company_event", table_name="webhook_subscriptions"
    )
    op.drop_table("webhook_subscriptions")
    op.drop_index(
        "ix_platform_api_keys_prefix", table_name="platform_api_keys"
    )
    op.drop_index(
        "ix_platform_api_keys_company_active", table_name="platform_api_keys"
    )
    op.drop_table("platform_api_keys")
