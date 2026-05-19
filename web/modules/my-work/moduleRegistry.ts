/**
 * My Work — Module Registry
 *
 * Central source of truth for every module that can appear in the My Work
 * portal.  Visibility is computed here; UI components must NOT contain any
 * visibility logic of their own.
 *
 * Adding a module:
 *   1. Append an entry to MY_WORK_MODULES.
 *   2. Implement isVisible() to express when it should appear.
 *   3. Point component at the workspace component (use React.lazy for code
 *      splitting unless the component is already a small stub).
 */

import React from "react";
import { isAdminSectionVisible } from "@/types";
import type { ModuleVisibilityContext, MyWorkModule, AdminSectionVisibility } from "@/types";

// Re-export types for backward compatibility
export type { ModuleVisibilityContext, MyWorkModule } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasRole(ctx: ModuleVisibilityContext, ...roles: string[]): boolean {
  return ctx.role !== null && roles.includes(ctx.role);
}

function hasPermission(ctx: ModuleVisibilityContext, key: string): boolean {
  // Admin/super_admin implicitly hold all permissions
  if (ctx.role === "admin" || ctx.role === "super_admin") return true;
  return ctx.permissionKeys.includes(key);
}

function hasModule(ctx: ModuleVisibilityContext, key: string): boolean {
  return ctx.derived?.enabled_modules.includes(key) ?? false;
}

// ── Admin section visibility ─────────────────────────────────────────────────
//
// Each entry maps an AdminSection id to the minimum role/permission/capability
// required to see it in the sidebar.  Uses the same ModuleVisibilityContext
// so checks are consistent with module-level visibility.
//
// Logic: if ALL three arrays are empty → visible to anyone who can see admin.
//        Otherwise, the user must satisfy ANY non-empty gate (OR logic across
//        gates, OR within each gate array).

export const ADMIN_SETTINGS_VISIBILITY: readonly AdminSectionVisibility[] = [
  { id: "overview",             roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "operations",           roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "company-setup",        roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "expense-policy",       roles: ["admin", "super_admin", "accounting"],   permissions: [], capabilities: [] },
  { id: "addons",               roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "approval-workflow",    roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "users-roles",          roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
  { id: "integrations",         roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
];

export const ADMIN_OPS_VISIBILITY: readonly AdminSectionVisibility[] = [
  { id: "notifications",       roles: ["admin", "super_admin"],   permissions: [], capabilities: [] },
];

/**
 * Returns the subset of admin settings sections visible for the given context.
 */
export function getVisibleAdminSettingsSections(
  ctx: ModuleVisibilityContext,
): AdminSectionVisibility[] {
  return ADMIN_SETTINGS_VISIBILITY.filter((s) => isAdminSectionVisible(s, ctx));
}

/**
 * Returns the subset of admin ops sections visible for the given context.
 */
export function getVisibleAdminOpsSections(
  ctx: ModuleVisibilityContext,
): AdminSectionVisibility[] {
  return ADMIN_OPS_VISIBILITY.filter((s) => isAdminSectionVisible(s, ctx));
}

// ── Module registry ────────────────────────────────────────────────────────────

export const MY_WORK_MODULES: readonly MyWorkModule[] = [
  // ── Admin sections (content-based, permission-driven) ──────────────────────
  // Each admin section is a first-class sidebar item. Visibility follows the
  // same ModuleVisibilityContext rules as all other modules.
  // Admin sees everything; accounting sees accounting-relevant sections.
  {
    id: "admin-config-overview",
    label: "admin.sectionSettings",
    icon: "Settings",
    adminSection: "overview",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-operations",
    label: "admin.sectionOperations",
    icon: "BarChart2",
    adminSection: "operations",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-company-setup",
    label: "admin.companySetup.title",
    icon: "Building2",
    adminSection: "company-setup",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-users-roles",
    label: "admin.usersRoles",
    icon: "Users",
    adminSection: "users-roles",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-expense-policy",
    label: "admin.expensePolicy",
    icon: "FileText",
    adminSection: "expense-policy",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin", "accounting"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-approval-workflow",
    label: "admin.workflow",
    icon: "GitBranch",
    adminSection: "approval-workflow",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-addons",
    label: "admin.companySetup.addOns",
    icon: "Puzzle",
    adminSection: "addons",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-integrations",
    label: "admin.integrationsLabel",
    icon: "Plug",
    adminSection: "integrations",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },
  {
    id: "admin-notifications",
    label: "admin.notifications",
    icon: "Bell",
    adminSection: "notifications",
    isVisible: (ctx) =>
      hasRole(ctx, "admin", "super_admin"),
    component: React.lazy(() => import("@/components/modules/AdminModule")),
  },

// ── My Expenses ─────────────────────────────────────────────────────────────
  // Gated on the per-user can_create_expenses flag (default true) AND the
  // expenses module being enabled.  Secretaries see this too — the workspace
  // fetches their boss's expenses when delegates_for_user_id is set.
  {
    id: "my_expenses",
    label: "modules.myExpenses",
    icon: "Receipt",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (ctx.capabilities?.can_create_expenses ?? true) &&
      (hasRole(ctx, "employee", "manager", "accounting", "admin", "executive", "secretary") ||
        hasPermission(ctx, "expense:submit") ||
        ctx.capabilities?.delegates_for_user_id !== null),
    component: React.lazy(() => import("@/modules/my-expenses/MyExpensesModule")),
  },

  // ── My Approvals ────────────────────────────────────────────────────────────
  // Managers approve expense submissions. Admins do NOT see this by default —
  // they must have the manager role or approve_expense permission. This keeps
  // configuration-only admins focused on setup, not approval workflows.
  // ── My Approvals (Unified) ────────────────────────────────────────────────
  // Unified approval queue: expenses, time, purchase requests, subcontractor invoices.
  // Visible to managers, executives, and accounting users who can approve.
  // Admins see it by default; employees/secretaries do NOT unless they have approval permissions.
  {
    id: "my_approvals",
    label: "modules.myApprovals",
    icon: "CheckSquare",
    isVisible: (ctx) =>
      (hasModule(ctx, "expenses") ||
        hasModule(ctx, "time_allocation") ||
        hasModule(ctx, "purchase_requests") ||
        hasModule(ctx, "subcontractor")) &&
      (hasRole(ctx, "manager", "accounting", "admin", "executive") ||
        hasPermission(ctx, "expense:approve:manager") ||
        hasPermission(ctx, "expense:approve:accounting")),
    component: React.lazy(() => import("@/modules/my-approvals/MyApprovalsModule")),
  },

  // ── Accounting Hub (Unified) ──────────────────────────────────────────────────
  // Full accounting module: setup (chart of accounts, mappings, tax rules)
  // + operations (review queue, closing, vendors). Accountants own setup;
  // admin can lock/unlock. Review-only users still get the review queue.
  {
    id: "accounting_hub",
    label: "modules.accounting",
    icon: "Calculator",
    isVisible: (ctx) =>
      (hasModule(ctx, "accounting") ||
        hasModule(ctx, "expenses") ||
        hasModule(ctx, "time_allocation") ||
        hasModule(ctx, "subcontractor") ||
        hasModule(ctx, "purchase_requests")) &&
      (hasRole(ctx, "accounting", "admin") ||
        (ctx.capabilities?.can_access_accounting ?? false) ||
        hasPermission(ctx, "accounting:work") ||
        hasPermission(ctx, "accounting:configure")),
    component: React.lazy(() => import("@/components/modules/AccountingModule")),
  },

  // ── Time Allocation ──────────────────────────────────────────────────────────
  // Add-on module. The company must install it first; once installed, it
  // appears for employees/admins who have the "submit_timesheet" permission,
  // OR for users the admin has explicitly marked as ``requires_time_tracking``.
  // A per-user flag must NEVER bypass the company-level install — an
  // uninstalled add-on must remain invisible for everyone.
  // Only users with requires_time_tracking or admin role see this.
  {
    id: "time_allocation",
    label: "modules.timeAllocation",
    icon: "Clock",
    isVisible: (ctx) =>
      hasModule(ctx, "time_allocation") &&
      ((ctx.capabilities?.requires_time_tracking ?? false) ||
        hasRole(ctx, "admin") ||
        hasPermission(ctx, "time_tracking:submit")),
    component: React.lazy(() => import("@/modules/my-time/MyTimeModule")),
  },


  // ── My Reports ───────────────────────────────────────────────────────────────
  // Executives with has_executive_reporting always see this. Others follow
  // the standard role/permission rules. Admins do NOT see this by default —
  // they must have a functional role (employee, manager, accounting) or
  // appropriate permissions. Configuration-only admins focus on setup.
  {
    id: "my_reports",
    label: "modules.myReports",
    icon: "BarChart2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (hasRole(ctx, "manager", "accounting", "admin", "executive") ||
        (ctx.capabilities?.has_executive_reporting ?? false) ||
        hasPermission(ctx, "expense:submit") ||
        hasPermission(ctx, "expense:approve:manager")),
    component: React.lazy(() => import("@/modules/my-reports/MyReportsModule")),
  },

  // ── My Requests ──────────────────────────────────────────────────────────────
  // Employee-facing PR intake.  Visible to all roles when the purchase_requests
  // add-on is enabled for the company.
  {
    id: "my_requests",
    label: "modules.myRequests",
    icon: "ShoppingCart",
    isVisible: (ctx) =>
      hasModule(ctx, "purchase_requests") &&
      ((ctx.capabilities?.can_create_expenses ?? true) ||
        hasRole(ctx, "manager", "accounting", "admin", "executive", "secretary") ||
        hasPermission(ctx, "request:submit")),
    component: React.lazy(() => import("@/modules/my-requests/MyRequestsModule")),
  },



  // ── Amex Reconciliation ──────────────────────────────────────────────────────
  // Add-on module for a dedicated Amex reconciler. The company must install
  // the add-on first; the user must be flagged as an Amex reconciler. Admins
  // see it whenever the add-on is installed so they can configure/inspect.
  {
    id: "amex_reconciliation",
    label: "modules.amexReconciliation",
    icon: "CreditCard",
    isVisible: (ctx) =>
      hasModule(ctx, "amex_reconciliation") &&
      ((ctx.capabilities?.is_amex_reconciler ?? false) || hasRole(ctx, "admin")),
    component: React.lazy(() => import("@/modules/amex/AmexReconciliationModule")),
  },

  // ── Finance Analytics ────────────────────────────────────────────────────────
  // Read-only finance dashboard (Phase 4.7 + 5.7). Visible to accounting,
  // executives, and anyone with can_view_analytics flag or analytics permission.
  // Finance analytics dashboard. Visible to accounting, executives, and
  // anyone with the can_view_analytics capability or analytics permission.
  {
    id: "finance_analytics",
    label: "modules.financeAnalytics",
    icon: "BarChart2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (hasRole(ctx, "accounting", "executive", "admin") ||
        (ctx.capabilities?.can_view_analytics ?? false) ||
        hasPermission(ctx, "analytics:view")),
    component: React.lazy(() => import("@/modules/finance-analytics/FinanceAnalyticsModule")),
  },

  // ── Subcontractors ──────────────────────────────────────────────────────────
  // Visible only when the subcontractor add-on is enabled AND the user is
  // a subcontractor or admin. Regular employees should NOT see this.
  {
    id: "subcontractors",
    label: "modules.subcontractors",
    icon: "Users",
    isVisible: (ctx) =>
      hasModule(ctx, "subcontractor") &&
      ((ctx.capabilities?.is_subcontractor ?? false) ||
        hasRole(ctx, "admin") ||
        hasPermission(ctx, "subcontractor:submit")),
    component: React.lazy(() => import("@/modules/subcontractor/SubcontractorModule")),
  },

  // ── Archive ──────────────────────────────────────────────────────────────────
  // Document vault / file viewer. Gated on the archive add-on being enabled.
  // Provides search, filter, and detail view for all archived company documents.
  {
    id: "archive",
    label: "modules.archive",
    icon: "Archive",
    isVisible: (ctx) =>
      hasModule(ctx, "archive") &&
      (hasRole(ctx, "admin", "accounting", "executive") ||
        hasPermission(ctx, "document:read:any")),
    component: React.lazy(() => import("@/modules/archive/ArchiveModule")),
  },
] as const;

// ── Public helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the subset of modules that should be shown for the given context,
 * preserving the canonical display order defined above.
 *
 * Pass a subset `from` if you want to filter a pre-filtered list (e.g. for
 * testing or a custom portal view); omits to default to the full registry.
 */
export function getVisibleModules(
  ctx: ModuleVisibilityContext,
  from: readonly MyWorkModule[] = MY_WORK_MODULES,
): MyWorkModule[] {
  return from.filter((m) => m.isVisible(ctx));
}

/**
 * Look up a single module by id.
 * Returns `undefined` when the id is not in the registry.
 */
export function findModule(id: string): MyWorkModule | undefined {
  return MY_WORK_MODULES.find((m) => m.id === id);
}
