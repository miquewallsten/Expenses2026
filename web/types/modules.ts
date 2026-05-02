/**
 * Module-related types for the MyWork portal.
 *
 * Shared across moduleRegistry, context providers, and navigation components.
 */

import type { ComponentType } from "react";
import type { UserCapabilities } from "./user";
import type { PortalDerived } from "./portal";

/**
 * Context passed to module isVisible() functions.
 * Aggregates user identity, permissions, and company config.
 */
export interface ModuleVisibilityContext {
  /** Role string from session storage ("employee" | "manager" | "accounting" | "admin" | "executive" | "secretary" | null) — "secretary" displays as "Executive Assistant" */
  role: string | null;
  /** Flat list of permission_keys from /roles/user-permissions/:id */
  permissionKeys: string[];
  /** Derived block from /admin/portal-config/:company_id — null while loading */
  derived: PortalDerived | null;
  /**
   * Per-user capability flags set by admin in the Users panel.
   * Null while user profile is loading.
   */
  capabilities: UserCapabilities | null;
}

/**
 * Module definition for the MyWork portal.
 * Each entry in MY_WORK_MODULES implements this interface.
 */
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
  component: ComponentType<any>;
}

/**
 * Generic envelope for whatever the active module considers "selected".
 * Each module uses a subset of these fields; unrelated fields remain null.
 */
export interface SelectedWorkItem {
  /** Expense id when the expenses module is active */
  expenseId: number | null;
  /** Report/batch id when the accounting or approvals module is active */
  reportId: number | null;
  /** Any extra module-specific payload */
  extra: Record<string, unknown>;
}

/**
 * Empty selection constant for initialization and clearing.
 */
export const EMPTY_SELECTED_WORK_ITEM: SelectedWorkItem = {
  expenseId: null,
  reportId: null,
  extra: {},
};