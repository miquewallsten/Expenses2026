# Platform Consolidation & Fix — Design Spec

**Date:** 2026-05-05
**Approach:** Fix critical bugs, clean up orphans, keep working architecture

---

## Executive Summary

After deep analysis, the architecture is **fundamentally sound**. The issues are:

1. **CRITICAL BUG: Role name mismatch** — `"accountant"` vs `"accounting"` breaks the entire accounting workflow
2. **BUG: Export bundle status** — uses `"submitted"` instead of `"approved"`
3. **Cleanup: Orphaned code** — files that exist but are never used

The AI/Agent patterns are **NOT broken** — they serve different purposes:
- MyWork AI Panel → General conversational assistant
- Admin Copilots → Section-specific configuration help
- Super Admin Agents → Cross-tenant agent management

---

## Phase 1: Fix Critical Bugs (IMMEDIATE)

### 1.1 Role Name Mismatch — `"accountant"` vs `"accounting"`

**Root Cause:**
- Schema defines: `USER_ROLES = ["employee", "manager", "accounting", "admin", "executive", "secretary"]`
- Permission service uses: `"accountant"` as the key in `_BUILTIN_ROLE_DEFAULTS`
- Auth guard uses: `["manager", "accountant", "admin"]`

**Impact:** Users with `role="accounting"`:
- Get NO permissions (empty set fallback)
- Are BLOCKED from all accounting routes by `require_manager_or_accountant`
- Cannot see Accounting Review module

**Files to fix:**

| File | Line | Current | Change To |
|------|------|---------|-----------|
| `packages/core/platform/service_permissions.py` | 136 | `"accountant": {` | `"accounting": {` |
| `packages/core/platform/service_permissions.py` | 16 (comment) | `accountant` | `accounting` |
| `apps/api/auth.py` | 85 | `"accountant"` | `"accounting"` |

**Verification:**
```python
# After fix, user with role="accounting" should have these permissions:
expected_perms = {
    "expense:read:any",
    "expense:approve:accounting",
    "expense:reject",
    "expense:export",
    "accounting:work",
    "accounting:export_polizas",
    ...
}
```

### 1.2 Export Bundle Status Filter

**Root Cause:**
- `_ELIGIBLE_STATUSES = ("submitted",)` picks up expenses awaiting approval
- Accounting export should happen AFTER approval, not before

**File:** `packages/modules/accounting/service/export_bundle_service.py`
**Line 45:** Change `_ELIGIBLE_STATUSES = ("submitted",)` → `_ELIGIBLE_STATUSES = ("approved",)`

**Update comment on lines 42-45:**
```python
# Expenses in this status are candidates for bundle inclusion.
# Only approved expenses are ready for accounting export.
# Excludes: draft (incomplete), submitted (pending approval),
# manager_approved (pending accounting review), rejected (terminal failure).
_ELIGIBLE_STATUSES = ("approved",)
```

**Verification:**
1. Create expense → submit → manager approve → accounting approve
2. Run export bundle
3. Verify only APPROVED expenses appear in bundle

---

## Phase 2: Remove Orphaned Code

### 2.1 Files to DELETE

| File | Reason |
|------|--------|
| `web/components/agent/CopilotChat.tsx` | Placeholder mock, never imported |
| `web/components/agent/AgentRail.tsx` | Functional but never rendered in layout |
| `web/components/admin/AdminNavigation.tsx` | Duplicate of nav in `UnifiedSidebar` |
| `web/app/employee/upload/page.tsx` | Duplicate of `mywork/upload/page.tsx` |

### 2.2 Directories to DELETE

| Directory | Reason |
|-----------|--------|
| `web/app/admin/*` subdirectories | Unreachable — `/admin` redirects to `/mywork?module=admin` |

**Note:** Keep `web/app/admin/page.tsx` (the redirect file), delete only subdirectories.

---

## Phase 3: Architecture (No Changes Needed)

### 3.1 Context Hierarchy (KEEP AS-IS)

```
UserProvider (identity, permissions, capabilities)
  └── MyWorkProvider (portal config, module visibility, selection state)
        └── AdminProvider (admin section navigation)
```

This is correct. No changes needed.

### 3.2 Module Visibility (KEEP AS-IS)

`web/modules/my-work/moduleRegistry.ts` computes visibility based on:
- Role (`hasRole()`)
- Permissions (`hasPermission()`)
- Capability flags (`ctx.capabilities`)
- Company config (`ctx.derived`)

This is correct. The bug was in the backend role name, not the visibility logic.

### 3.3 AI/Agent Integration (KEEP AS-IS)

| Component | Purpose | Status |
|-----------|---------|--------|
| MyWork AI Panel (`AgentChat`) | General conversational assistant | ✅ Working |
| MyWorkAssistant | Expense-specific suggestions | ✅ Working |
| AdminOnboardingCopilot | Guided company setup | ✅ Working |
| AdminCompanySetupCopilot | Configuration analysis | ✅ Working |
| AdminAccountingCopilot | Accounting setup help | ✅ Working |
| CopilotLauncher | Floating admin AI button | ✅ Working |
| Super Admin Agents | Cross-tenant agent management | ✅ Working |

These serve **different purposes** and are **not duplicates**.

### 3.4 Navigation (KEEP AS-IS)

| Route | Purpose | Status |
|-------|---------|--------|
| `/mywork` | Unified entry point for ALL roles | ✅ Correct |
| `/mywork?module=admin` | Admin configuration module | ✅ Correct |
| `/super-admin/*` | Cross-tenant platform admin | ✅ Correct |
| Legacy routes → `/mywork?module=X` | Redirects | ✅ Correct |

---

## Phase 4: Test Plan

### Critical Path Tests

| # | Test | Steps | Expected |
|---|------|-------|----------|
| 1 | **Accounting user login** | Login as `role="accounting"` user | Permissions load, Accounting Review visible |
| 2 | **Accounting queue access** | Navigate to Accounting Review | Queue loads, no 403 |
| 3 | **Accounting approve** | Select expense → Approve | Status → "approved" |
| 4 | **Export bundle** | Trigger export | Only approved expenses included |
| 5 | **Upload flow** | Upload PDF/XML | Document created, CFDI parsed |
| 6 | **Manager approve** | Login as manager → My Approvals → Approve | Status → "manager_approved" |
| 7 | **AI Chat** | Open AI assistant → Send message | Streaming response works |
| 8 | **Admin Copilot** | Admin → Company Setup → Ask AI | Response with suggestions |

### Role Permission Matrix (After Fix)

| Role | Permissions (selected) |
|------|----------------------|
| `employee` | expense:create, expense:read:own, expense:submit, document:upload |
| `manager` | All employee + expense:approve:manager, expense:read:any, expense:bulk_transition |
| `accounting` | expense:read:any, expense:approve:accounting, accounting:work, accounting:export_polizas |
| `admin` | All permissions |
| `executive` | (depends on capabilities) analytics:view, expense:read:any |
| `secretary` | (depends on delegates_for_user_id) proxy access to boss's data |

---

## Implementation Order

### Step 1: Fix role bugs (10 min)
1. Edit `service_permissions.py:136` → `"accounting"`
2. Edit `service_permissions.py:16` → update comment
3. Edit `auth.py:85` → `"accounting"`

### Step 2: Fix export bundle (5 min)
1. Edit `export_bundle_service.py:45` → `("approved",)`
2. Update comment

### Step 3: Remove orphans (10 min)
1. Delete orphaned files
2. Delete unreachable directories
3. Verify no imports break

### Step 4: Test (15 min)
1. Run manual tests above
2. Verify accounting user can access all routes
3. Verify export bundle only includes approved expenses

---

## Files Summary

### To Modify (3 files)
| File | Change |
|------|--------|
| `packages/core/platform/service_permissions.py` | Line 136: `"accountant"` → `"accounting"` |
| `apps/api/auth.py` | Line 85: `"accountant"` → `"accounting"` |
| `packages/modules/accounting/service/export_bundle_service.py` | Line 45: `("submitted",)` → `("approved",)` |

### To Delete (6 files + directories)
| Path | Type |
|------|------|
| `web/components/agent/CopilotChat.tsx` | File |
| `web/components/agent/AgentRail.tsx` | File |
| `web/components/admin/AdminNavigation.tsx` | File |
| `web/app/employee/upload/page.tsx` | File |
| `web/app/admin/agent/` | Directory |
| `web/app/admin/audit-log/` | Directory |
| `web/app/admin/company-setup/` | Directory |
| `web/app/admin/onboarding/` | Directory |
| `web/app/admin/users-roles/` | Directory |

---

## Success Criteria

1. ✅ User with `role="accounting"` has correct permissions
2. ✅ User with `role="accounting"` can access Accounting Review
3. ✅ User with `role="accounting"` can approve/reject expenses
4. ✅ Export bundle only includes expenses with `status="approved"`
5. ✅ No orphaned code remains
6. ✅ All critical paths tested and working