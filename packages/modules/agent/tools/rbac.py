"""RBAC tools — roles, permissions, role-permission grants, user-role assignments.

Read tools are free. Grant/revoke operations are destructive and go through
the receipt mechanism. Permissions themselves are platform-level and are
never mutated by the agent.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from packages.core.platform.models_permission import Permission
from packages.core.platform.models_role import Role
from packages.core.platform.models_role_permission import RolePermission
from packages.core.platform.models_user import User
from packages.core.platform.models_user_role import UserRole

from ..core.appliers import register_applier
from ..core.context import AgentContext
from ..core.registry import REGISTRY, ToolResult, ToolSpec
from ._common import propose


class Empty(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ── Reads ──────────────────────────────────────────────────────────────────

def _list_roles(ctx: AgentContext, _: Empty) -> ToolResult:
    rows = (
        ctx.db.query(Role)
        .filter(Role.company_id == ctx.company_id)
        .order_by(Role.key.asc())
        .all()
    )
    return ToolResult(
        ok=True,
        summary=f"{len(rows)} roles",
        data={"items": [{"id": r.id, "key": r.key, "name": r.name, "description": r.description} for r in rows]},
    )


# Removed duplicate list_roles (see admin_tools.py)


def _list_permissions(ctx: AgentContext, _: Empty) -> ToolResult:
    rows = ctx.db.query(Permission).order_by(Permission.key.asc()).all()
    return ToolResult(
        ok=True,
        summary=f"{len(rows)} permisos",
        data={"items": [{"id": p.id, "key": p.key, "name": p.name, "description": p.description} for p in rows]},
    )


REGISTRY.register(ToolSpec(
    name="list_permissions",
    description="Lista todos los permisos disponibles en la plataforma.",
    category="read",
    input_schema=Empty,
    handler=_list_permissions,
    personas=frozenset({"admin"}),
))


class RolePermsArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_key: str = Field(..., min_length=1, max_length=100)


def _list_role_permissions(ctx: AgentContext, args: RolePermsArgs) -> ToolResult:
    role = (
        ctx.db.query(Role)
        .filter(Role.company_id == ctx.company_id, Role.key == args.role_key)
        .one_or_none()
    )
    if role is None:
        return ToolResult(ok=False, summary=f"role {args.role_key} no encontrado", error="not_found")

    q = (
        ctx.db.query(Permission)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .filter(RolePermission.role_id == role.id)
        .order_by(Permission.key.asc())
    )
    perms = q.all()
    return ToolResult(
        ok=True,
        summary=f"rol {role.key}: {len(perms)} permisos",
        data={"role": {"id": role.id, "key": role.key}, "permissions": [p.key for p in perms]},
    )


REGISTRY.register(ToolSpec(
    name="list_role_permissions",
    description="Lista los permisos asignados a un rol (por role_key).",
    category="read",
    input_schema=RolePermsArgs,
    handler=_list_role_permissions,
    personas=frozenset({"admin"}),
))


class UserRolesArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id: int = Field(..., ge=1)


def _list_user_roles(ctx: AgentContext, args: UserRolesArgs) -> ToolResult:
    u = ctx.db.query(User).filter(User.id == args.user_id, User.company_id == ctx.company_id).one_or_none()
    if u is None:
        return ToolResult(ok=False, summary="usuario no encontrado", error="not_found")
    rows = (
        ctx.db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == u.id, Role.company_id == ctx.company_id)
        .order_by(Role.key.asc())
        .all()
    )
    return ToolResult(
        ok=True,
        summary=f"{u.email}: {len(rows)} roles",
        data={"user": {"id": u.id, "email": u.email}, "roles": [r.key for r in rows]},
    )


REGISTRY.register(ToolSpec(
    name="list_user_roles",
    description="Lista los roles asignados a un usuario.",
    category="read",
    input_schema=UserRolesArgs,
    handler=_list_user_roles,
    personas=frozenset({"admin"}),
))


# ── Destructive: assign/revoke user role ──────────────────────────────────

class UserRoleAssignArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    user_id:  int = Field(..., ge=1)
    role_key: str = Field(..., min_length=1, max_length=100)


def _resolve_user_role(ctx: AgentContext, user_id: int, role_key: str) -> tuple[User, Role]:
    u = ctx.db.query(User).filter(User.id == user_id, User.company_id == ctx.company_id).one()
    r = ctx.db.query(Role).filter(Role.key == role_key, Role.company_id == ctx.company_id).one()
    return u, r


def _handle_assign_user_role(ctx: AgentContext, args: UserRoleAssignArgs) -> ToolResult:
    try:
        u, r = _resolve_user_role(ctx, args.user_id, args.role_key)
    except Exception:
        return ToolResult(ok=False, summary="usuario o rol no encontrado", error="not_found")

    existing = ctx.db.query(UserRole).filter(UserRole.user_id == u.id, UserRole.role_id == r.id).one_or_none()
    if existing:
        return ToolResult(ok=True, summary=f"{u.email} ya tiene el rol {r.key}")

    return propose(
        ctx,
        tool_name="assign_user_role",
        args={"user_id": u.id, "role_key": r.key},
        preview={"action": "assign_user_role", "user": u.email, "role": r.key},
        summary=f"asignar rol {r.key} a {u.email}",
    )


def _apply_assign_user_role(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    u, r = _resolve_user_role(ctx, int(args["user_id"]), str(args["role_key"]))
    existing = ctx.db.query(UserRole).filter(UserRole.user_id == u.id, UserRole.role_id == r.id).one_or_none()
    if existing is None:
        ctx.db.add(UserRole(user_id=u.id, role_id=r.id))
        ctx.db.commit()
        return {"assigned": True, "user": u.email, "role": r.key}
    return {"assigned": False, "reason": "already_assigned", "user": u.email, "role": r.key}


REGISTRY.register(ToolSpec(
    name="assign_user_role",
    description="Asigna un rol a un usuario (por user_id + role_key). Requiere confirmación.",
    category="config",
    input_schema=UserRoleAssignArgs,
    handler=_handle_assign_user_role,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("assign_user_role", _apply_assign_user_role)


def _handle_revoke_user_role(ctx: AgentContext, args: UserRoleAssignArgs) -> ToolResult:
    try:
        u, r = _resolve_user_role(ctx, args.user_id, args.role_key)
    except Exception:
        return ToolResult(ok=False, summary="usuario o rol no encontrado", error="not_found")
    existing = ctx.db.query(UserRole).filter(UserRole.user_id == u.id, UserRole.role_id == r.id).one_or_none()
    if existing is None:
        return ToolResult(ok=True, summary=f"{u.email} no tiene el rol {r.key}")
    return propose(
        ctx,
        tool_name="revoke_user_role",
        args={"user_id": u.id, "role_key": r.key},
        preview={"action": "revoke_user_role", "user": u.email, "role": r.key},
        summary=f"quitar rol {r.key} de {u.email}",
    )


def _apply_revoke_user_role(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    u, r = _resolve_user_role(ctx, int(args["user_id"]), str(args["role_key"]))
    existing = ctx.db.query(UserRole).filter(UserRole.user_id == u.id, UserRole.role_id == r.id).one_or_none()
    if existing:
        ctx.db.delete(existing)
        ctx.db.commit()
        return {"revoked": True, "user": u.email, "role": r.key}
    return {"revoked": False, "reason": "not_assigned"}


REGISTRY.register(ToolSpec(
    name="revoke_user_role",
    description="Quita un rol a un usuario. Requiere confirmación.",
    category="config",
    input_schema=UserRoleAssignArgs,
    handler=_handle_revoke_user_role,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("revoke_user_role", _apply_revoke_user_role)


# ── Destructive: grant/revoke permission on role ─────────────────────────

class RolePermGrantArgs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role_key:       str = Field(..., min_length=1, max_length=100)
    permission_key: str = Field(..., min_length=1, max_length=100)


def _resolve_role_perm(ctx: AgentContext, role_key: str, permission_key: str) -> tuple[Role, Permission]:
    r = ctx.db.query(Role).filter(Role.key == role_key, Role.company_id == ctx.company_id).one()
    p = ctx.db.query(Permission).filter(Permission.key == permission_key).one()
    return r, p


def _handle_grant_role_permission(ctx: AgentContext, args: RolePermGrantArgs) -> ToolResult:
    try:
        r, p = _resolve_role_perm(ctx, args.role_key, args.permission_key)
    except Exception:
        return ToolResult(ok=False, summary="rol o permiso no encontrado", error="not_found")
    exists = ctx.db.query(RolePermission).filter(
        RolePermission.role_id == r.id, RolePermission.permission_id == p.id,
    ).one_or_none()
    if exists:
        return ToolResult(ok=True, summary=f"{r.key} ya tiene el permiso {p.key}")
    return propose(
        ctx,
        tool_name="grant_role_permission",
        args={"role_key": r.key, "permission_key": p.key},
        preview={"action": "grant_role_permission", "role": r.key, "permission": p.key},
        summary=f"otorgar permiso {p.key} al rol {r.key}",
    )


def _apply_grant_role_permission(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    r, p = _resolve_role_perm(ctx, str(args["role_key"]), str(args["permission_key"]))
    exists = ctx.db.query(RolePermission).filter(
        RolePermission.role_id == r.id, RolePermission.permission_id == p.id,
    ).one_or_none()
    if exists is None:
        ctx.db.add(RolePermission(role_id=r.id, permission_id=p.id))
        ctx.db.commit()
        return {"granted": True, "role": r.key, "permission": p.key}
    return {"granted": False, "reason": "already_granted"}


REGISTRY.register(ToolSpec(
    name="grant_role_permission",
    description="Otorga un permiso a un rol.",
    category="config",
    input_schema=RolePermGrantArgs,
    handler=_handle_grant_role_permission,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("grant_role_permission", _apply_grant_role_permission)


def _handle_revoke_role_permission(ctx: AgentContext, args: RolePermGrantArgs) -> ToolResult:
    try:
        r, p = _resolve_role_perm(ctx, args.role_key, args.permission_key)
    except Exception:
        return ToolResult(ok=False, summary="rol o permiso no encontrado", error="not_found")
    exists = ctx.db.query(RolePermission).filter(
        RolePermission.role_id == r.id, RolePermission.permission_id == p.id,
    ).one_or_none()
    if exists is None:
        return ToolResult(ok=True, summary=f"{r.key} no tiene el permiso {p.key}")
    return propose(
        ctx,
        tool_name="revoke_role_permission",
        args={"role_key": r.key, "permission_key": p.key},
        preview={"action": "revoke_role_permission", "role": r.key, "permission": p.key},
        summary=f"quitar permiso {p.key} del rol {r.key}",
    )


def _apply_revoke_role_permission(ctx: AgentContext, args: dict[str, Any]) -> dict[str, Any]:
    r, p = _resolve_role_perm(ctx, str(args["role_key"]), str(args["permission_key"]))
    exists = ctx.db.query(RolePermission).filter(
        RolePermission.role_id == r.id, RolePermission.permission_id == p.id,
    ).one_or_none()
    if exists:
        ctx.db.delete(exists)
        ctx.db.commit()
        return {"revoked": True, "role": r.key, "permission": p.key}
    return {"revoked": False, "reason": "not_granted"}


REGISTRY.register(ToolSpec(
    name="revoke_role_permission",
    description="Quita un permiso a un rol.",
    category="config",
    input_schema=RolePermGrantArgs,
    handler=_handle_revoke_role_permission,
    personas=frozenset({"admin"}),
    destructive=True,
    requires_confirmation=True,
))
register_applier("revoke_role_permission", _apply_revoke_role_permission)
