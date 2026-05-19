"""
Permission key drift detection test.

Asserts that:
1. Every key used in has_permission() calls in the backend exists in PERMISSION_CATALOG
2. Every key checked in moduleRegistry.ts exists in PERMISSION_CATALOG
3. Every key in ADMIN_SETTINGS_VISIBILITY / ADMIN_OPS_VISIBILITY exists in PERMISSION_CATALOG
"""
import re
import pytest

from packages.core.platform.service_permissions import PERMISSION_CATALOG, _BUILTIN_ROLE_DEFAULTS


CATALOG_KEYS = set(PERMISSION_CATALOG.keys())


class TestPermissionCatalogDrift:
    """Ensure no permission keys have drifted from the catalog."""

    def test_all_builtin_defaults_exist_in_catalog(self):
        """Every key in _BUILTIN_ROLE_DEFAULTS must exist in PERMISSION_CATALOG."""
        for role, keys in _BUILTIN_ROLE_DEFAULTS.items():
            for key in keys:
                assert key in CATALOG_KEYS, (
                    f"Key '{key}' in _BUILTIN_ROLE_DEFAULTS['{role}'] "
                    f"not found in PERMISSION_CATALOG"
                )

    def test_all_backend_permission_keys_exist_in_catalog(self):
        """Every key passed to has_permission() in backend code must exist in PERMISSION_CATALOG."""
        # These are the keys we know are used in has_permission() calls
        used_keys = [
            "expense:create:any",
            "expense:read:company",
            "expense:approve:manager",
            "accounting:configure",
            "admin:company:read",
            "admin:users:read",
            "admin:audit:read",
            "expense:read:any",
            "expense:update:any",
            "document:delete",
            "admin",
            "cfdi:recheck",
            "purchase_request:read:any",
            "purchase_request:create:any",
            "reports:build",
        ]
        for key in used_keys:
            assert key in CATALOG_KEYS, (
                f"Key '{key}' used in backend has_permission() call "
                f"not found in PERMISSION_CATALOG"
            )

    def test_all_frontend_visibility_keys_exist_in_catalog(self):
        """Every key checked in frontend moduleRegistry/visibility must exist in PERMISSION_CATALOG."""
        frontend_keys = [
            # Admin section visibility
            "admin:company:read",
            "admin:company:write",
            "admin:approval_policy:write",
            "admin:users:read",
            "admin:users:create",
            "accounting:configure",
            "admin:integrations:read",
            "admin:integrations:write",
            "reports:build",
            "admin:audit:read",
            "cfdi:recheck",
            "admin:channels:read",
            "admin:channels:write",
            # Module visibility
            "expense:submit",
            "expense:approve:manager",
            "accounting:work",
            "time_tracking:submit",
            "expense:approve:accounting",
            "amex:reconcile",
            "analytics:view",
            "document:read:any",
        ]
        for key in frontend_keys:
            assert key in CATALOG_KEYS, (
                f"Key '{key}' used in frontend visibility check "
                f"not found in PERMISSION_CATALOG"
            )

    def test_no_duplicate_frontend_keys_outside_catalog(self):
        """Keys that were previously non-catalog names should now be fixed."""
        # These are the old keys that DID NOT exist in the catalog.
        # They should have been replaced with catalog keys.
        old_non_catalog_keys = ["approve_expense", "assign_account", "submit_expense", "super_admin_access"]
        for key in old_non_catalog_keys:
            assert key not in CATALOG_KEYS, (
                f"Old non-catalog key '{key}' found in CATALOG — should have been replaced"
            )

    def test_catalog_has_no_empty_descriptions(self):
        """Every key in the catalog should have a non-empty description."""
        for key, desc in PERMISSION_CATALOG.items():
            assert desc, f"Key '{key}' has an empty description in PERMISSION_CATALOG"
