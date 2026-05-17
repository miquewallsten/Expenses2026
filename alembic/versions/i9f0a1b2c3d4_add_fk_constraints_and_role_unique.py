"""add FK constraints to auth join tables and unique constraint on Role

Revision ID: i9f0a1b2c3d4
Revises: h8e9f0a1b2c3
Create Date: 2026-05-17

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'i9f0a1b2c3d4'
down_revision = 'h8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add unique constraint on (company_id, key) for Role
    op.create_unique_constraint('uq_roles_company_key', 'roles', ['company_id', 'key'])

    # 2. Add FK constraints to RolePermission
    op.create_foreign_key(
        'fk_role_permissions_role_id', 'role_permissions', 'roles',
        ['role_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_role_permissions_permission_id', 'role_permissions', 'permissions',
        ['permission_id'], ['id'], ondelete='CASCADE'
    )

    # 3. Add FK constraints to UserRole
    op.create_foreign_key(
        'fk_user_roles_user_id', 'user_roles', 'users',
        ['user_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_user_roles_role_id', 'user_roles', 'roles',
        ['role_id'], ['id'], ondelete='CASCADE'
    )

    # 4. Add FK from Role.company_id to companies
    op.create_foreign_key(
        'fk_roles_company_id', 'roles', 'companies',
        ['company_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('fk_roles_company_id', 'roles', type_='foreignkey')
    op.drop_constraint('fk_user_roles_role_id', 'user_roles', type_='foreignkey')
    op.drop_constraint('fk_user_roles_user_id', 'user_roles', type_='foreignkey')
    op.drop_constraint('fk_role_permissions_permission_id', 'role_permissions', type_='foreignkey')
    op.drop_constraint('fk_role_permissions_role_id', 'role_permissions', type_='foreignkey')
    op.drop_constraint('uq_roles_company_key', 'roles', type_='unique')
