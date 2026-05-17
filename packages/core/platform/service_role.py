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


def list_roles(db: Session, company_id: int | None = None) -> list[Role]:
    query = db.query(Role)
    if company_id is not None:
        query = query.filter(Role.company_id == company_id)
    return query.all()


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
    keys = {
        p.key
        for p in (
            db.query(Permission)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .filter(UserRole.user_id == user_id)
            .all()
        )
    }
    return sorted(keys)
