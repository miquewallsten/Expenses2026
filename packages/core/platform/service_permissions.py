"""Phase 2.3 — Permission catalog + has_permission() service.

Single source of truth for fine-grained authorization. Backed by the existing
Permission / Role / RolePermission models (one Permission row per action key,
shared across companies; one Role per (company_id, role_key); RolePermission
joins them).

Lookup is cached per (company_id, role_key) for the lifetime of the process —
permissions are seeded once and rarely change. Cache is intentionally simple
and process-local; admins editing roles in the future can reset it via
``invalidate_cache()``.

Role keys for the implicit, code-defined "built-in" roles match the values
already written to ``users.role``:

    admin, manager, accounting, employee, executive, secretary

Custom roles can still be created via the existing /admin/roles/* endpoints
and will resolve through the same path as long as they have at least one
RolePermission row. Users whose ``role`` value matches no Role row fall back
to the built-in defaults below.
"""
from __future__ import annotations

import threading
from typing import Iterable

from sqlalchemy.orm import Session

from packages.core.platform.models_permission import Permission
from packages.core.platform.models_role import Role
from packages.core.platform.models_role_permission import RolePermission
from packages.core.platform.models_user import User


# ── Catalog ──────────────────────────────────────────────────────────────────
# Action keys used across the codebase. Stable identifiers — never rename
# without a migration that updates Permission.key in place.
PERMISSION_CATALOG: dict[str, str] = {
    # expenses
    "expense:create": "Create expenses",
    "expense:read:own": "Read own expenses",
    "expense:read:any": "Read any expense in company",
    "expense:update:own": "Update own draft expenses",
    "expense:update:any": "Update any expense (admin override)",
    "expense:delete:own": "Delete own draft expenses",
    "expense:delete:any": "Delete any expense (admin override)",
    "expense:submit": "Submit expense for approval",
    "expense:approve:manager": "Approve expense as manager",
    "expense:approve:accounting": "Approve expense as accounting",
    "expense:reject": "Reject expense with comment",
    "expense:bulk_transition": "Approve/reject in bulk",
    "expense:export": "Export expenses to CSV/poliza/CFDI",
    "expense:override_policy": "Override blocking policy violations",
    # documents
    "document:upload": "Upload receipt/CFDI documents",
    "document:read:own": "Read own documents",
    "document:read:any": "Read any document in company",
    "document:delete": "Delete documents",
    # cfdi
    "cfdi:pair": "Pair expense to CFDI",
    "cfdi:recheck": "Re-query SAT for CFDI status",
    # accounting
    "accounting:work": "Work the accounting queue",
    "accounting:export_polizas": "Export Pólizas",
    "accounting:configure": "Configure chart of accounts / categories",
    # amex
    "amex:reconcile": "Reconcile AMEX statements",
    "amex:upload_statement": "Upload AMEX statement",
    # admin
    "admin:users:read": "List users",
    "admin:users:create": "Create users",
    "admin:users:update": "Update users",
    "admin:users:delete": "Delete users",
    "admin:roles:read": "List roles & permissions",
    "admin:roles:write": "Edit roles & role-permissions",
    "admin:company:read": "Read company settings",
    "admin:company:write": "Edit company settings",
    "admin:legal_entities:write": "Edit legal entities",
    "admin:cost_centers:write": "Edit cost centers",
    "admin:projects:write": "Edit projects",
    "admin:clients:write": "Edit clients",
    "admin:approval_policy:write": "Edit approval policy",
    "admin:channels:read": "Read channel/notification settings",
    "admin:channels:write": "Edit channel/notification settings",
    "admin:integrations:read": "Read ERP integrations",
    "admin:integrations:write": "Edit ERP integrations",
    "admin:ai_policy:read": "Read AI governance policy",
    "admin:ai_policy:write": "Edit AI governance policy",
    "admin:audit:read": "Read audit log",
    "admin:onboarding:write": "Edit onboarding step / company setup",
    "admin:setup:write": "Run admin setup workflows",
    # analytics
    "analytics:view": "View finance analytics dashboard",
    "analytics:export": "Export analytics data",
    # agent / copilot
    "agent:chat:employee": "Use employee copilot persona",
    "agent:chat:admin": "Use admin copilot persona",
    "agent:chat:finance_manager": "Use finance_manager copilot persona",
    "agent:tools:rbac": "Run agent rbac tools",
    "agent:tools:config": "Run agent config tools",
    "agent:tools:settings": "Run agent settings tools",
    "agent:tools:ai_policy": "Run agent ai_policy tools",
    "agent:tools:infra": "Run agent infra tools",
    "agent:tools:finance_copilot": "Run agent finance_copilot tools",
    "agent:insights:run": "Trigger insight scanners",
    # platform / API
    "platform:api_keys:write": "Create / revoke platform API keys",
    "platform:webhooks:write": "Create / revoke webhook subscriptions",
}


# ── Built-in role defaults ──────────────────────────────────────────────────
# A user whose ``role`` value matches a key here gets at minimum these
# permissions, even when no Role row exists. Custom Role rows extend (not
# replace) the defaults — explicit RolePermission entries always grant
# additional access.
_BUILTIN_ROLE_DEFAULTS: dict[str, set[str]] = {
    "admin": set(PERMISSION_CATALOG.keys()),  # admin gets everything
    "manager": {
        "expense:create",
        "expense:read:own",
        "expense:read:any",
        "expense:update:own",
        "expense:delete:own",
        "expense:submit",
        "expense:approve:manager",
        "expense:reject",
        "expense:bulk_transition",
        "document:upload",
        "document:read:own",
        "document:read:any",
        "agent:chat:employee",
        "analytics:view",
    },
    "accounting": {
        "expense:read:any",
        "expense:approve:accounting",
        "expense:reject",
        "expense:export",
        "expense:bulk_transition",
        "document:read:any",
        "cfdi:pair",
        "cfdi:recheck",
        "accounting:work",
        "accounting:export_polizas",
        "accounting:configure",
        "amex:reconcile",
        "amex:upload_statement",
        "agent:chat:employee",
        "agent:chat:finance_manager",
        "agent:tools:finance_copilot",
        "analytics:view",
        "analytics:export",
        "admin:audit:read",
    },
    "employee": {
        "expense:create",
        "expense:read:own",
        "expense:update:own",
        "expense:delete:own",
        "expense:submit",
        "document:upload",
        "document:read:own",
        "agent:chat:employee",
    },
    "disabled": set(),  # explicitly empty
}


# ── Cache ────────────────────────────────────────────────────────────────────
_cache_lock = threading.Lock()
_cache: dict[tuple[int, str], frozenset[str]] = {}


def invalidate_cache(company_id: int | None = None, role_key: str | None = None) -> None:
    """Invalidate the in-process permission cache.

    Call after editing Role rows / RolePermission rows in admin tooling. With
    no args, clears everything. With company_id only, clears every role for
    that company. With both, clears just that one entry.
    """
    with _cache_lock:
        if company_id is None:
            _cache.clear()
            return
        if role_key is None:
            for key in [k for k in _cache if k[0] == company_id]:
                _cache.pop(key, None)
            return
        _cache.pop((company_id, role_key), None)


def _resolve_role_permissions(
    db: Session, company_id: int, role_key: str
) -> frozenset[str]:
    """Return the full permission set for a (company, role_key) pair.

    Built-in defaults are always included; custom Role rows add on top so an
    admin can grant extra permissions to a built-in role without losing the
    baseline. Lookup is cached per process.
    """
    cache_key = (company_id, role_key)
    with _cache_lock:
        cached = _cache.get(cache_key)
    if cached is not None:
        return cached

    # Built-in baseline first.
    granted: set[str] = set(_BUILTIN_ROLE_DEFAULTS.get(role_key, set()))

    # Custom Role row, if one exists for this company under this key.
    role = (
        db.query(Role)
        .filter(Role.company_id == company_id, Role.key == role_key)
        .first()
    )
    if role is not None:
        keys = (
            db.query(Permission.key)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .filter(RolePermission.role_id == role.id)
            .all()
        )
        granted.update(k for (k,) in keys)

    result = frozenset(granted)
    with _cache_lock:
        _cache[cache_key] = result
    return result


def has_permission(
    db: Session, user: User | None, action_key: str
) -> bool:
    """Return True iff ``user`` is allowed to perform ``action_key``.

    Anonymous (None) users have no permissions. Disabled users have no
    permissions even if their built-in role would normally grant them.
    Unknown action keys raise — this is a programmer-error guard so a typo'd
    key can never accidentally allow access by silently returning False or
    True somewhere downstream.
    """
    if action_key not in PERMISSION_CATALOG:
        raise ValueError(f"Unknown permission key: {action_key!r}")
    if user is None or not user.role or user.role == "disabled":
        return False
    perms = _resolve_role_permissions(db, user.company_id, user.role)
    return action_key in perms


def list_permissions(db: Session, user: User | None) -> list[str]:
    """Return the sorted list of permission keys ``user`` holds."""
    if user is None or not user.role or user.role == "disabled":
        return []
    perms = _resolve_role_permissions(db, user.company_id, user.role)
    return sorted(perms)


def all_permission_keys() -> Iterable[str]:
    """Return every catalog key — useful for admin UI building permission
    pickers."""
    return list(PERMISSION_CATALOG.keys())
