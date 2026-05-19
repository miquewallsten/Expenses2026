"""agent platform tables

Revision ID: f6c110def965
Revises: d306de71b72b
Create Date: 2026-04-29 13:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6c110def965'
down_revision: Union[str, Sequence[str], None] = 'd306de71b72b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'agent_definitions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('key', sa.String(length=64), nullable=False),
        sa.Column('name', sa.String(length=128), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('system_prompt', sa.Text(), nullable=False),
        sa.Column('allowed_tools', sa.Text(), server_default='[]', nullable=False),
        sa.Column('persona', sa.String(length=32), server_default='admin', nullable=False),
        sa.Column('is_system', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('key')
    )
    op.create_index(op.f('ix_agent_definitions_key'), 'agent_definitions', ['key'], unique=False)

    op.create_table(
        'channel_agent_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agent_definitions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel_type', sa.String(length=32), nullable=False),
        sa.Column('autonomous_threshold', sa.Float(), server_default='0.80', nullable=False),
        sa.Column('high_stakes_rules', sa.Text(), server_default='[]', nullable=False),
        sa.Column('test_mode', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    op.create_table(
        'llm_provider_configs',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('company_id', sa.Integer(), sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=True),
        sa.Column('provider', sa.String(length=32), server_default='ollama', nullable=False),
        sa.Column('base_url', sa.String(length=512), nullable=True),
        sa.Column('api_key_env_ref', sa.String(length=128), nullable=True),
        sa.Column('model_name', sa.String(length=128), server_default='llama3.2', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('company_id', name='uq_llm_provider_configs_company_id')
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('llm_provider_configs')
    op.drop_table('channel_agent_configs')
    op.drop_index(op.f('ix_agent_definitions_key'), table_name='agent_definitions')
    op.drop_table('agent_definitions')
