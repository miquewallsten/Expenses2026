from sqlalchemy.orm import Session

from packages.core.platform.models_role import Role
from packages.core.platform.models_permission import Permission
from packages.core.platform.models_role_permission import RolePermission
from packages.core.platform.models_user_role import UserRole
from packages.core.platform.schemas_role import (
    RoleCreate,
    PermissionCreate,
    RolePermissionCreate,
    UserRoleCreate,
)


def create_role(db: Session, data: RoleCreate) -> Role:
    obj = Role(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_roles(db: Session) -> list[Role]:
    return db.query(Role).all()


def create_permission(db: Session, data: PermissionCreate) -> Permission:
    obj = Permission(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def list_permissions(db: Session) -> list[Permission]:
    return db.query(Permission).all()


def assign_permission_to_role(db: Session, data: RolePermissionCreate) -> RolePermission:
    obj = RolePermission(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def assign_role_to_user(db: Session, data: UserRoleCreate) -> UserRole:
    obj = UserRole(**data.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def get_permission_keys_for_user(db: Session, user_id: int) -> list[str]:
    role_ids = [
        ur.role_id
        for ur in db.query(UserRole).filter(UserRole.user_id == user_id).all()
    ]
    if not role_ids:
        return []

    permission_ids = [
        rp.permission_id
        for rp in db.query(RolePermission)
        .filter(RolePermission.role_id.in_(role_ids))
        .all()
    ]
    if not permission_ids:
        return []

    keys = {
        p.key
        for p in db.query(Permission).filter(Permission.id.in_(permission_ids)).all()
    }
    return sorted(keys)
