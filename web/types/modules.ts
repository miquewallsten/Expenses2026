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
 * Admin section visibility rule.
 * Each admin section declares which roles/permissions/capabilities grant access.
 * Visibility logic: a user can see a section if ANY of the following are true:
 *   - Their role is in `roles` (if `roles` is non-empty)
 *   - They hold any permission in `permissions` (if `permissions` is non-empty)
 *   - They have any capability flag in `capabilities` set to true (if `capabilities` is non-empty)
 * If ALL three arrays are empty, the section is visible to anyone who can see the admin module.
 */
export interface AdminSectionVisibility {
  /** Section id matching AdminSection type */
  id: string;
  /** Roles that can see this section. Empty = not gated by role. */
  roles: string[];
  /** Permission keys that can see this section. Empty = not gated by permission. */
  permissions: string[];
  /** Capability flags that can see this section. Empty = not gated by capability. */
  capabilities: (keyof import("./user").UserCapabilities)[];
}

/**
 * Determine whether an admin section is visible for the given user context.
 * Uses the same ModuleVisibilityContext as module registry checks.
 */
export function isAdminSectionVisible(
  section: AdminSectionVisibility,
  ctx: ModuleVisibilityContext,
): boolean {
  // Admin and super_admin always see every section (consistent with UserContext.hasPermission)
  if (ctx.role === "admin" || ctx.role === "super_admin") {
    return true;
  }

  const hasRole = (r: string) => ctx.role === r;
  const hasPerm = (k: string) => ctx.permissionKeys.includes(k);
  const hasCap = (k: keyof import("./user").UserCapabilities) =>
    ctx.capabilities?.[k] === true;

  // If all gates are empty, section is visible to anyone with admin access
  if (section.roles.length === 0 && section.permissions.length === 0 && section.capabilities.length === 0) {
    return true;
  }

  // User passes if they satisfy ANY non-empty gate
  if (section.roles.length > 0 && section.roles.some(hasRole)) return true;
  if (section.permissions.length > 0 && section.permissions.some(hasPerm)) return true;
  if (section.capabilities.length > 0 && section.capabilities.some(hasCap)) return true;

  return false;
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
  /** When set, clicking this module also switches the admin context to this section. */
  adminSection?: string;
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