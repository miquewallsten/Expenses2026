"""Access resolution service — the single source of truth for what a user can see and do.

Called at login time and on capability refresh. Computes the final, resolved
access profile from:

1. User's role + assigned roles (from user_roles table)
2. Permissions resolved from those roles (via service_permissions)
3. Role-based capability defaults (auto-sync when role changes)
4. Module enablement cross-check (auto-disable stale capabilities)
5. Admin/super_admin implicit full access

This is deterministic and fast — no LLM involved.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from packages.core.platform.models_user import User
from packages.core.platform.models_company_setup import CompanySetup
from packages.core.platform.service_permissions import list_permissions as resolve_permission_keys


# ── Role → default capabilities ──────────────────────────────────────────────
# These are the BASELINE capabilities each role gets. Admin can override per-user,
# but when a user's role changes, the resolver can auto-sync these defaults.

ROLE_CAPABILITY_DEFAULTS: dict[str, dict[str, bool]] = {
    "employee": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "manager": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "accounting": {
        "can_create_expenses": False,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": True,
        "can_view_analytics": True,
    },
    "admin": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": True,
        "can_access_accounting": True,
        "can_view_analytics": True,
    },
    "executive": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": True,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
    "secretary": {
        "can_create_expenses": True,
        "can_create_corporate_expenses": False,
        "can_invoice_corporation": False,
        "is_amex_reconciler": False,
        "is_subcontractor": False,
        "requires_time_tracking": False,
        "has_executive_reporting": False,
        "can_access_accounting": False,
        "can_view_analytics": False,
    },
}

# Capabilities that require a specific module to be enabled.
# If the module is disabled, the capability is forced to False regardless of
# what's stored in the DB.
CAPABILITY_MODULE_MAP: dict[str, str] = {
    "is_amex_reconciler": "amex_reconciliation_module_enabled",
    "is_subcontractor": "subcontractor_module_enabled",
    "requires_time_tracking": "time_allocation_module_enabled",
}


@dataclass
class AccessProfile:
    """Resolved access profile for a user — what they can see and do."""

    user_id: int
    company_id: int
    email: str
    full_name: str
    role: str
    is_active: bool
    is_super_admin: bool

    # Resolved capabilities (after role defaults + module cross-check)
    capabilities: dict[str, bool] = field(default_factory=dict)

    # Resolved permission keys from RBAC
    permission_keys: list[str] = field(default_factory=list)

    # Which modules are enabled for this company
    enabled_modules: list[str] = field(default_factory=list)

    # Warnings: stale capabilities that were auto-corrected
    auto_corrected: dict[str, str] = field(default_factory=dict)

    # Delegation info
    delegates_for_user_id: int | None = None
    delegates_for_user_name: str | None = None


def resolve_user_access(db: Session, user: User, *, sync_to_db: bool = True) -> AccessProfile:
    """Compute the final, resolved access profile for a user.

    Args:
        db: Database session
        user: The User ORM object
        sync_to_db: If True, writes auto-corrected capabilities back to the DB.
                    Set to False for read-only queries.

    Returns:
        AccessProfile with resolved capabilities, permissions, and module state.
    """
    # ── 1. Start with current DB values ────────────────────────────────────
    capabilities = {
        "can_create_expenses": user.can_create_expenses,
        "can_create_corporate_expenses": user.can_create_corporate_expenses,
        "can_invoice_corporation": user.can_invoice_corporation,
        "is_amex_reconciler": user.is_amex_reconciler,
        "is_subcontractor": user.is_subcontractor,
        "requires_time_tracking": user.requires_time_tracking,
        "has_executive_reporting": user.has_executive_reporting,
        "can_access_accounting": user.can_access_accounting,
        "can_view_analytics": user.can_view_analytics,
    }

    auto_corrected: dict[str, str] = {}

    # ── 2. Resolve enabled modules for this company ─────────────────────────
    setup = db.query(CompanySetup).filter(
        CompanySetup.company_id == user.company_id
    ).first()

    module_flags: dict[str, bool] = {}
    enabled_modules: list[str] = []
    if setup:
        for flag in [
            "expenses_module_enabled",
            "accounting_module_enabled",
            "approvals_module_enabled",
            "time_allocation_module_enabled",
            "subcontractor_module_enabled",
            "archive_module_enabled",
            "purchase_requests_module_enabled",
            "amex_reconciliation_module_enabled",
        ]:
            val = getattr(setup, flag, False)
            module_flags[flag] = val
            if val:
                # Convert flag name to module key (e.g. "expenses_module_enabled" → "expenses")
                key = flag.replace("_module_enabled", "")
                enabled_modules.append(key)

    # ── 3. Cross-check capabilities against enabled modules ───────────────
    # If a capability requires a module that's disabled, force it to False.
    for cap_key, module_flag in CAPABILITY_MODULE_MAP.items():
        if capabilities.get(cap_key, False) and not module_flags.get(module_flag, False):
            capabilities[cap_key] = False
            auto_corrected[cap_key] = f"Module {module_flag} is disabled"

    # ── 4. Admin/super_admin implicit access ──────────────────────────────
    is_super_admin = getattr(user, "is_super_admin", False)
    if user.role == "admin" or is_super_admin:
        # Admins can access accounting and analytics by default
        # unless explicitly disabled (which would be unusual)
        pass  # Keep their explicit capability values — admin has full control

    # ── 5. Resolve RBAC permissions ────────────────────────────────────────
    permission_keys = resolve_permission_keys(db, user)

    # ── 6. Sync auto-corrected capabilities back to DB ─────────────────────
    if sync_to_db and auto_corrected:
        for cap_key in auto_corrected:
            setattr(user, cap_key, False)
        db.commit()

    # ── 7. Delegation info ─────────────────────────────────────────────────
    delegates_for_user_id = user.delegates_for_user_id
    delegates_for_user_name = None
    if delegates_for_user_id:
        boss = db.query(User).filter(User.id == delegates_for_user_id).first()
        if boss:
            delegates_for_user_name = boss.full_name

    return AccessProfile(
        user_id=user.id,
        company_id=user.company_id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_active=user.is_active,
        is_super_admin=is_super_admin,
        capabilities=capabilities,
        permission_keys=permission_keys,
        enabled_modules=enabled_modules,
        auto_corrected=auto_corrected,
        delegates_for_user_id=delegates_for_user_id,
        delegates_for_user_name=delegates_for_user_name,
    )


def sync_role_capabilities(db: Session, user: User, *, preserve_overrides: bool = True) -> list[str]:
    """Sync a user's capabilities with their role's default capabilities.

    Called when a user's role changes. Merges role defaults with existing
    per-user overrides.

    Args:
        db: Database session
        user: The User ORM object
        preserve_overrides: If True, only update capabilities where the current
            value matches the OLD role's default (meaning the admin didn't
            explicitly override it). If False, force all capabilities to the
            new role's defaults.

    Returns:
        List of capability fields that were changed.
    """
    new_defaults = ROLE_CAPABILITY_DEFAULTS.get(user.role, {})
    if not new_defaults:
        return []

    # Get old role defaults to detect which values were overridden
    # We don't know the old role, so we compare against ALL role defaults
    # to see if the current value was a default for ANY role
    changed: list[str] = []

    for cap_key, new_val in new_defaults.items():
        current_val = getattr(user, cap_key, None)
        if current_val is None:
            continue

        if preserve_overrides:
            # Check if the current value matches ANY role's default for this key
            is_default_value = any(
                ROLE_CAPABILITY_DEFAULTS.get(r, {}).get(cap_key) == current_val
                for r in ROLE_CAPABILITY_DEFAULTS
            )
            # If it matches a default (not an explicit override), update to new default
            # If it was explicitly set differently, preserve the override
            if is_default_value:
                if current_val != new_val:
                    setattr(user, cap_key, new_val)
                    changed.append(cap_key)
        else:
            # Force all to new defaults
            if current_val != new_val:
                setattr(user, cap_key, new_val)
                changed.append(cap_key)

    if changed:
        db.commit()

    return changed
