# Permission & Role System Audit Report

**Date:** 2026-05-05
**Scope:** Users, roles, permissions, add-ons, and /mywork integration

## Executive Summary

The permission and role system has several critical gaps that cause security and UX issues:

1. **Permission key format mismatch** - Frontend uses different keys than backend
2. **Executive/Secretary roles have no permissions** - Not in builtin defaults
3. **Capability flags not enforced** - Stored but never checked server-side
4. **Module visibility disconnected** - Different registries in frontend/backend

---

## Issue 1: Permission Key Format Mismatch (CRITICAL)

**Severity:** HIGH - Non-admin users always fail permission checks

### Frontend uses these keys:
```typescript
// web/context/MyWorkContext.tsx:273
user.hasPermission("approve_expense")  // ❌ NOT in catalog

// web/context/MyWorkContext.tsx:280
user.hasPermission("assign_account")   // ❌ NOT in catalog

// web/modules/my-work/moduleRegistry.ts:62
hasPermission("submit_expense")         // ❌ NOT in catalog

// web/modules/my-work/moduleRegistry.ts:78
hasPermission("approve_expense")       // ❌ NOT in catalog

// web/modules/my-work/moduleRegistry.ts:94
hasPermission("assign_account")        // ❌ NOT in catalog

// web/modules/my-work/moduleRegistry.ts:201
hasPermission("analytics:view")        // ✅ EXISTS (correct)
```

### Backend uses these keys (PERMISSION_CATALOG):
```python
# packages/core/platform/service_permissions.py
"expense:create",           # Create expenses
"expense:approve:manager",  # Approve as manager
"expense:approve:accounting", # Approve as accounting
"accounting:work",           # Work accounting queue
"analytics:view",            # View analytics
```

### Impact:
- `hasPermission("approve_expense")` returns `false` for ALL non-admin users
- `hasPermission("assign_account")` returns `false` for ALL non-admin users
- Only admins bypass this via the `role === "admin"` shortcut

### Fix Required:
Either:
1. **Add frontend keys to catalog** (add `"approve_expense"`, `"assign_account"`, etc. as aliases)
2. **Update frontend to use correct keys** (change `"approve_expense"` → `"expense:approve:manager"`)

---

## Issue 2: Executive & Secretary Roles Have No Permissions (HIGH)

**Severity:** HIGH - Users with these roles get zero permission keys

### Code Location:
```python
# packages/core/platform/service_permissions.py:118-168
_BUILTIN_ROLE_DEFAULTS: dict[str, set[str]] = {
    "admin": set(PERMISSION_CATALOG.keys()),
    "manager": {...},
    "accounting": {...},
    "employee": {...},
    "disabled": set(),
    # "executive": NOT PRESENT
    # "secretary": NOT PRESENT
}
```

### Impact:
- `has_permission(db, executive_user, "expense:create")` → `False`
- `has_permission(db, secretary_user, "expense:create")` → `False`
- These roles fall through to empty `set()` default

### Frontend Expectation:
```typescript
// web/modules/my-work/moduleRegistry.ts:129
hasRole(ctx, "employee", "manager", "accounting", "executive")  // Shows My Reports
```

Executive role shows in UI but backend returns no permissions.

### Fix Required:
Add to `_BUILTIN_ROLE_DEFAULTS`:
```python
"executive": {
    "expense:create",
    "expense:read:own",
    "expense:submit",
    "document:upload",
    "document:read:own",
    "expense:approve:manager",  # Can approve as manager
    "analytics:view",
    "analytics:export",
    "agent:chat:employee",
},
"secretary": {
    "expense:create",
    "expense:read:own",
    "expense:submit",
    "document:upload",
    "document:read:own",
    "agent:chat:employee",
},
```

---

## Issue 3: Capability Flags Not Backend-Gated (MEDIUM)

**Severity:** MEDIUM - Authorization bypass possible

### Flags stored but never checked server-side:

| Capability | Frontend Check | Backend Check |
|------------|---------------|---------------|
| `is_amex_reconciler` | ✅ moduleRegistry:185 | ❌ Never checked |
| `can_create_corporate_expenses` | ❌ Never checked | ❌ Never checked |
| `can_invoice_corporation` | ❌ Never checked | ❌ Never checked |
| `requires_time_tracking` | moduleRegistry:111 (visibility only) | ❌ Not enforced |

### Example Vulnerability:
```typescript
// Frontend shows AMEX reconciliation module
isVisible: (ctx) => hasModule(ctx, "amex_reconciliation") && 
                    ctx.capabilities?.is_amex_reconciler
```

But backend AMEX endpoints don't check `is_amex_reconciler`:
```python
# packages/modules/amex/api/router.py - No capability check
@router.post("/statements/upload")
def upload_statement(...):
    # Missing: check is_amex_reconciler
    ...
```

### Fix Required:
Add capability checks to relevant API endpoints:
```python
if not current_user.is_amex_reconciler and current_user.role != "admin":
    raise HTTPException(status_code=403, detail="AMEX reconciler access required")
```

---

## Issue 4: Module Visibility Registries Disconnected (MEDIUM)

**Severity:** MEDIUM - Frontend can show modules backend doesn't know about

### Frontend Registry:
```typescript
// web/modules/my-work/moduleRegistry.ts
MY_WORK_MODULES: [
  { id: "admin", ... },
  { id: "my_expenses", ... },
  { id: "my_approvals", ... },
  { id: "accounting_review", ... },
  { id: "time_allocation", ... },
  { id: "my_reports", ... },
  { id: "my_requests", ... },
  { id: "pr_accounting", ... },
  { id: "pr_approvals", ... },
  { id: "amex_reconciliation", ... },
  { id: "finance_analytics", ... },
]
```

### Backend Registry:
```python
# packages/core/platform/manifest_service.py
MODULE_REGISTRY = {
    "expenses": {...},
    "approvals": {...},
    "accounting": {...},
    # Missing: time_allocation, purchase_requests, amex_reconciliation, etc.
}
```

### Impact:
- No validation that frontend modules match backend expectations
- New modules added to frontend without backend awareness

---

## Issue 5: Derived Config Missing User Context (LOW)

**Severity:** LOW - Performance and complexity

### Current State:
Frontend must make **3 API calls** to get full context:
1. `/admin/portal-config/:companyId` → DerivedConfig + CompanySetup
2. `/roles/user-permissions/:userId` → permissionKeys[]
3. `/users/:userId` → capabilities + delegation

### Missing from DerivedConfig:
- `can_create_expenses`
- `can_access_accounting`
- `can_view_analytics`
- `is_amex_reconciler`
- `has_executive_reporting`
- `requires_time_tracking`
- `delegates_for_user_id`
- `permission_keys` (currently separate fetch)

### Fix Required:
Embed user context in portal config response:
```python
class PortalConfigResponse(BaseModel):
    company: CompanyRead
    derived: DerivedConfig
    user: UserContextResponse  # NEW: capabilities, permissions, delegation
```

---

## Recommended Fix Priority

1. **P0 - Permission Key Mismatch**: Fix immediately - breaks all non-admin users
2. **P0 - Executive/Secretary Permissions**: Fix immediately - roles are broken
3. **P1 - Capability Backend Gates**: Add API endpoint checks
4. **P2 - Module Registry Sync**: Create single source of truth
5. **P3 - Derived Config Enhancement**: Reduce API calls

---

## Files to Modify

### Permission Keys
- `packages/core/platform/service_permissions.py` - Add aliases or update catalog
- `web/context/MyWorkContext.tsx` - Update hasPermission calls
- `web/modules/my-work/moduleRegistry.ts` - Update hasPermission calls

### Role Defaults
- `packages/core/platform/service_permissions.py` - Add executive/secretary defaults

### Capability Checks
- `packages/modules/amex/api/router.py` - Add is_amex_reconciler check
- Any corporate expense/invoice endpoints - Add capability checks

### Module Registry
- Create shared module registry or sync frontend/backend