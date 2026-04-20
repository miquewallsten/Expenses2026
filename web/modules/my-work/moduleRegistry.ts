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

// ── Visibility context ─────────────────────────────────────────────────────────
//
// Passed by the host shell into isVisible().  Keep this type in sync with
// what the portal config API returns (apps/api/routes/ derived block) and
// the session helpers in lib/session.ts.

export interface ModuleVisibilityContext {
  /** Role string from session storage ("employee" | "manager" | "accounting" | "admin" | "executive" | "secretary" | null) */
  role: string | null;
  /** Flat list of permission_keys from /roles/user-permissions/:id */
  permissionKeys: string[];
  /** Derived block from /admin/portal-config/:company_id — null while loading */
  derived: {
    enabled_modules: string[];
    manager_flow_enabled: boolean;
    accounting_flow_enabled: boolean;
    allocation_dimensions: string[];
    allow_split_allocations: boolean;
    tickets_allowed: boolean;
    international_expenses_allowed: boolean;
    xml_required_mode: string;
    pdf_pair_required_for_cfdi: boolean;
    workflow_mode: string;
  } | null;
  /**
   * Per-user capability flags set by admin in the Users panel.
   * Null while user profile is loading.
   */
  capabilities: {
    can_create_expenses: boolean;
    can_create_corporate_expenses: boolean;
    can_invoice_corporation: boolean;
    is_amex_reconciler: boolean;
    requires_time_tracking: boolean;
    has_executive_reporting: boolean;
    delegates_for_user_id: number | null;
    delegates_for_user_name: string | null;
  } | null;
}

// ── Module type ────────────────────────────────────────────────────────────────

export interface MyWorkModule {
  /** Stable identifier used as a key and for URL-fragment routing */
  id: string;
  /** Human-readable label shown in the module nav */
  label: string;
  /**
   * Lucide icon name (string reference so this file stays free of React
   * icon imports).  The host nav component resolves the icon by name.
   */
  icon?: string;
  /**
   * Pure function — must return true when this module should appear for a
   * given user/company context.  Called on every context change; keep it
   * cheap (no side-effects, no async).
   */
  isVisible: (ctx: ModuleVisibilityContext) => boolean;
  /**
   * The workspace component rendered in the detail area when this module is
   * active.  Use React.lazy() for large modules so their code is only
   * fetched when the user navigates to them.
   *
   * The shell passes `Record<string, unknown>` props at minimum; each module
   * component should define its own prop interface and cast or default-handle
   * any extras.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
}

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

// ── Placeholder component (used for modules not yet fully built) ───────────────

function buildPlaceholder(label: string): React.FC {
  function Placeholder() {
    return React.createElement(
      "div",
      { className: "flex h-full items-center justify-center" },
      React.createElement(
        "div",
        { className: "text-center" },
        React.createElement(
          "p",
          { className: "text-sm font-medium text-white/30" },
          label,
        ),
        React.createElement(
          "p",
          { className: "mt-1 text-xs text-white/18" },
          "This workspace is not yet available.",
        ),
      ),
    );
  }
  Placeholder.displayName = `${label.replace(/\s+/g, "")}Placeholder`;
  return Placeholder;
}

// ── Module registry ────────────────────────────────────────────────────────────

export const MY_WORK_MODULES: readonly MyWorkModule[] = [
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

  // ── Corporate Expenses ───────────────────────────────────────────────────────
  // Any role — gated purely on the per-user can_create_corporate_expenses flag.
  // These are non-project expenses (presales, operations, equipment, etc.).
  {
    id: "corporate_expenses",
    label: "Corporate Expenses",
    icon: "Building2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      (ctx.capabilities?.can_create_corporate_expenses ?? false),
    component: buildPlaceholder("Corporate Expenses"),
  },

  // ── My Approvals ────────────────────────────────────────────────────────────
  // Visible to managers, executives, admins, and anyone with approve_expense,
  // but only when the manager approval flow is configured.
  {
    id: "my_approvals",
    label: "My Approvals",
    icon: "CheckSquare",
    isVisible: (ctx) =>
      (ctx.derived?.manager_flow_enabled ?? false) &&
      (hasRole(ctx, "manager", "admin", "executive") ||
        hasPermission(ctx, "approve_expense")),
    component: React.lazy(() => import("@/modules/my-approvals/MyApprovalsModule")),
  },

  // ── Accounting Review ────────────────────────────────────────────────────────
  // Visible to accountants, admins, and anyone with assign_account permission
  // when the accounting review flow is configured.
  {
    id: "accounting_review",
    label: "Accounting Review",
    icon: "Calculator",
    isVisible: (ctx) =>
      (ctx.derived?.accounting_flow_enabled ?? false) &&
      (hasRole(ctx, "accounting", "admin") ||
        hasPermission(ctx, "assign_account")),
    component: React.lazy(() => import("@/modules/accounting-review/AccountingReviewModule")),
  },

  // ── Time Allocation ──────────────────────────────────────────────────────────
  // Shown when the per-user requires_time_tracking flag is set (admin assigned
  // this requirement) OR when the company-level time_allocation add-on is on.
  {
    id: "time_allocation",
    label: "Time Allocation",
    icon: "Clock",
    isVisible: (ctx) =>
      (ctx.capabilities?.requires_time_tracking ?? false) ||
      (hasModule(ctx, "time_allocation") &&
        (hasRole(ctx, "employee", "admin") ||
          hasPermission(ctx, "submit_timesheet"))),
    component: React.lazy(() => import("@/modules/my-time/MyTimeModule")),
  },

  // ── Archive ──────────────────────────────────────────────────────────────────
  // Visible to accounting, admins, and anyone with view_archive when the
  // archive module is enabled.
  {
    id: "archive",
    label: "Archive",
    icon: "Archive",
    isVisible: (ctx) =>
      hasModule(ctx, "archive") &&
      (hasRole(ctx, "accounting", "admin") ||
        hasPermission(ctx, "view_archive")),
    component: buildPlaceholder("Archive"),
  },

  // ── Exports ──────────────────────────────────────────────────────────────────
  // Visible only to admins and users with export_data when the exports module
  // is explicitly enabled in company config.
  {
    id: "exports",
    label: "Exports",
    icon: "Download",
    isVisible: (ctx) =>
      hasModule(ctx, "exports") &&
      (hasRole(ctx, "admin") || hasPermission(ctx, "export_data")),
    component: buildPlaceholder("Exports"),
  },

  // ── My Reports ───────────────────────────────────────────────────────────────
  // Executives with has_executive_reporting always see this.  Others follow
  // the standard role/permission rules.
  {
    id: "my_reports",
    label: "My Reports",
    icon: "BarChart2",
    isVisible: (ctx) =>
      hasModule(ctx, "expenses") &&
      ((ctx.capabilities?.has_executive_reporting ?? false) ||
        hasRole(ctx, "employee", "manager", "accounting", "admin", "executive") ||
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
