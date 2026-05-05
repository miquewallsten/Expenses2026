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
import type { ModuleVisibilityContext, MyWorkModule } from "@/types";

// Re-export types for backward compatibility
export type { ModuleVisibilityContext, MyWorkModule } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function hasRole(ctx: ModuleVisibilityContext, ...roles: string[]): boolean {
  return ctx.role !== null && roles.includes(ctx.role);
}

function hasPermission(ctx: ModuleVisibilityContext, key: string): boolean {
  return ctx.permissionKeys.includes(key);
}

function hasModule(ctx: ModuleVisibilityContext, key: string): boolean {
  return ctx.derived?.enabled_modules.includes(key) ?? false;
}

// ── Module registry ────────────────────────────────────────────────────────────

export const MY_WORK_MODULES: readonly MyWorkModule[] = [
  // ── Admin ──────────────────────────────────────────────────────────────────────
// Company configuration, user management, policies, workflows, accounting
// setup, and announcements. Visible to admins and anyone with admin permission.
{
  id: "admin",
  label: "Administration",
  icon: "Settings",
  isVisible: (ctx) =>
    hasRole(ctx, "admin") || hasPermission(ctx, "admin"),
  component: React.lazy(() => import("@/components/modules/AdminModule")),
},

// ── My Expenses ─────────────────────────────────────────────────────────────
  // Gated on the per-user can_create_expenses flag (default true) AND the
  // expenses module being enabled.  Secretaries see this too — the workspace
  // fetches their boss's expenses when delegates_for_user_id is set.
  {
    id: "my_expenses",
    label: "My Expenses",
    icon: "Receipt",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (ctx.capabilities?.can_create_expenses ?? true) &&
      (hasRole(ctx, "employee", "manager", "admin", "executive", "secretary") ||
        hasPermission(ctx, "submit_expense")),
    component: React.lazy(() => import("@/modules/my-expenses/MyExpensesModule")),
  },

  // ── My Approvals ────────────────────────────────────────────────────────────
  // Managers approve expense submissions. Admins do NOT see this by default —
  // they must have the manager role or approve_expense permission. This keeps
  // configuration-only admins focused on setup, not approval workflows.
  {
    id: "my_approvals",
    label: "My Approvals",
    icon: "CheckSquare",
    isVisible: (ctx) =>
      hasModule(ctx, "approvals") &&
      (ctx.derived?.manager_flow_enabled ?? false) &&
      (hasRole(ctx, "manager", "executive") ||
        hasPermission(ctx, "approve_expense")),
    component: React.lazy(() => import("@/modules/my-approvals/MyApprovalsModule")),
  },

  // ── Accounting Review ────────────────────────────────────────────────────────
  // Accountants review expense accounting assignments. Admins do NOT see this
  // by default — they must have the accounting role OR can_access_accounting flag.
  // This keeps configuration-only admins focused on setup, not accounting work.
  {
    id: "accounting_review",
    label: "Accounting Review",
    icon: "Calculator",
    isVisible: (ctx) =>
      hasModule(ctx, "accounting") &&
      (ctx.derived?.accounting_flow_enabled ?? false) &&
      (hasRole(ctx, "accounting") ||
        (ctx.capabilities?.can_access_accounting ?? false) ||
        hasPermission(ctx, "assign_account")),
    component: React.lazy(() => import("@/modules/accounting-review/AccountingReviewModule")),
  },

  // ── Time Allocation ──────────────────────────────────────────────────────────
  // Add-on module. The company must install it first; once installed, it
  // appears for employees/admins who have the "submit_timesheet" permission,
  // OR for users the admin has explicitly marked as ``requires_time_tracking``.
  // A per-user flag must NEVER bypass the company-level install — an
  // uninstalled add-on must remain invisible for everyone.
  {
    id: "time_allocation",
    label: "Time Allocation",
    icon: "Clock",
    isVisible: (ctx) =>
      hasModule(ctx, "time_allocation") &&
      ((ctx.capabilities?.requires_time_tracking ?? false) ||
        hasRole(ctx, "employee", "admin") ||
        hasPermission(ctx, "submit_timesheet")),
    component: React.lazy(() => import("@/modules/my-time/MyTimeModule")),
  },

  // ── My Reports ───────────────────────────────────────────────────────────────
  // Executives with has_executive_reporting always see this. Others follow
  // the standard role/permission rules. Admins do NOT see this by default —
  // they must have a functional role (employee, manager, accounting) or
  // appropriate permissions. Configuration-only admins focus on setup.
  {
    id: "my_reports",
    label: "My Reports",
    icon: "BarChart2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      ((ctx.capabilities?.has_executive_reporting ?? false) ||
        hasRole(ctx, "employee", "manager", "accounting", "executive") ||
        hasPermission(ctx, "submit_expense") ||
        hasPermission(ctx, "approve_expense")),
    component: React.lazy(() => import("@/modules/my-reports/MyReportsModule")),
  },

  // ── My Requests ──────────────────────────────────────────────────────────────
  // Employee-facing PR intake.  Visible to all roles when the purchase_requests
  // add-on is enabled for the company.
  {
    id: "my_requests",
    label: "My Requests",
    icon: "ShoppingCart",
    isVisible: (ctx) =>
      hasModule(ctx, "purchase_requests") &&
      (hasRole(ctx, "employee", "manager", "accounting", "admin", "executive", "secretary") ||
        hasPermission(ctx, "submit_expense")),
    component: React.lazy(() => import("@/modules/my-requests/MyRequestsModule")),
  },

  // ── Requerimientos de Compra (Accounting) ───────────────────────────────────
  // Accounting team receives all submitted PRs for review and fulfillment
  // tracking.  Gated on purchase_requests add-on.
  {
    id: "pr_accounting",
    label: "Requerimientos de Compra",
    icon: "ClipboardList",
    isVisible: (ctx) =>
      hasModule(ctx, "purchase_requests") &&
      (hasRole(ctx, "accounting", "admin") || hasPermission(ctx, "assign_account")),
    component: React.lazy(() => import("@/modules/pr-accounting/PRAccountingModule")),
  },

  // ── Approve PO (Managers) ────────────────────────────────────────────────────
  // Managers see all submitted PRs pending their approval decision.
  // Gated on purchase_requests add-on.
  {
    id: "pr_approvals",
    label: "Approve PO",
    icon: "BadgeCheck",
    isVisible: (ctx) =>
      hasModule(ctx, "purchase_requests") &&
      (hasRole(ctx, "manager", "admin", "executive") || hasPermission(ctx, "approve_expense")),
    component: React.lazy(() => import("@/modules/pr-approvals/PRApprovalsModule")),
  },

  // ── Amex Reconciliation ──────────────────────────────────────────────────────
  // Add-on module for a dedicated Amex reconciler. The company must install
  // the add-on first; the user must be flagged as an Amex reconciler. Admins
  // see it whenever the add-on is installed so they can configure/inspect.
  {
    id: "amex_reconciliation",
    label: "Conciliación Amex",
    icon: "CreditCard",
    isVisible: (ctx) =>
      hasModule(ctx, "amex_reconciliation") &&
      ((ctx.capabilities?.is_amex_reconciler ?? false) || hasRole(ctx, "admin")),
    component: React.lazy(() => import("@/modules/amex/AmexReconciliationModule")),
  },

  // ── Finance Analytics ────────────────────────────────────────────────────────
  // Read-only finance dashboard (Phase 4.7 + 5.7). Visible to accounting,
  // executives, and anyone with can_view_analytics flag or analytics permission.
  // Admins do NOT see this by default — they must have the flag or permission.
  // This keeps configuration-only admins focused on setup, not analytics.
  {
    id: "finance_analytics",
    label: "Finance Analytics",
    icon: "BarChart2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (hasRole(ctx, "accounting", "executive") ||
        (ctx.capabilities?.can_view_analytics ?? false) ||
        hasPermission(ctx, "analytics:view")),
    component: React.lazy(() => import("@/modules/finance-analytics/FinanceAnalyticsModule")),
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
