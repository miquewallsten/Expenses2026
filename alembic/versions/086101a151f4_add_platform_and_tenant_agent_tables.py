"""add foreign keys for tenant agent tables

Revision ID: 086101a151f4
Revises: f6c110def965
Create Date: 2026-05-03 18:05:17.465411

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '086101a151f4'
down_revision: Union[str, Sequence[str], None] = 'f6c110def965'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add last_used_at to tenant_agent_memory
    op.add_column('tenant_agent_memory', sa.Column('last_used_at', sa.DateTime(), nullable=True))

    # Add foreign key constraints for tenant agent tables
    op.create_foreign_key(
        'fk_tenant_agent_memory_company_id',
        'tenant_agent_memory', 'companies',
        ['company_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_tenant_agent_sessions_company_id',
        'tenant_agent_sessions', 'companies',
        ['company_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_tenant_agent_sessions_user_id',
        'tenant_agent_sessions', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_tenant_workflow_progress_company_id',
        'tenant_workflow_progress', 'companies',
        ['company_id'], ['id'],
        ondelete='CASCADE'
    )

    # Add foreign key constraints for platform tables
    op.create_foreign_key(
        'fk_platform_usage_logs_tenant_id',
        'platform_usage_logs', 'platform_tenants',
        ['tenant_id'], ['id'],
        ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_platform_usage_logs_provider_id',
        'platform_usage_logs', 'platform_llm_providers',
        ['provider_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_platform_agent_definitions_provider_id',
        'platform_agent_definitions', 'platform_llm_providers',
        ['default_provider_id'], ['id'],
        ondelete='SET NULL'
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove platform foreign keys
    op.drop_constraint('fk_platform_agent_definitions_provider_id', 'platform_agent_definitions', type_='foreignkey')
    op.drop_constraint('fk_platform_usage_logs_provider_id', 'platform_usage_logs', type_='foreignkey')
    op.drop_constraint('fk_platform_usage_logs_tenant_id', 'platform_usage_logs', type_='foreignkey')

    # Remove tenant foreign keys
    op.drop_constraint('fk_tenant_workflow_progress_company_id', 'tenant_workflow_progress', type_='foreignkey')
    op.drop_constraint('fk_tenant_agent_sessions_user_id', 'tenant_agent_sessions', type_='foreignkey')
    op.drop_constraint('fk_tenant_agent_sessions_company_id', 'tenant_agent_sessions', type_='foreignkey')
    op.drop_constraint('fk_tenant_agent_memory_company_id', 'tenant_agent_memory', type_='foreignkey')

    # Remove last_used_at column
    op.drop_column('tenant_agent_memory', 'last_used_at')