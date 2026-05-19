/**
 * User-related types.
 *
 * Shared across UserContext, permission checks, and module visibility logic.
 */

/**
 * The set of roles a user may hold.
 * The current session stores one role at a time, but the context exposes
 * an array so callers do not need to change when multi-role support is introduced.
 */
export type UserRole = "employee" | "manager" | "accounting" | "accountant" | "admin" | "executive" | "secretary";

/**
 * Per-user capability flags — set by admin per user.
 * These drive MyWork portal visibility independently of role.
 * An admin with can_create_expenses=false is a configuration-only admin
 * who focuses on setup and doesn't submit expenses themselves.
 */
export interface UserCapabilities {
  can_create_expenses: boolean;
  can_create_corporate_expenses: boolean;
  can_invoice_corporation: boolean;
  is_amex_reconciler: boolean;
  /** Subcontractor user — can submit invoices as a subcontractor. Only when add-on is installed. */
  is_subcontractor: boolean;
  requires_time_tracking: boolean;
  has_executive_reporting: boolean;
  /** When true, admin can access Accounting Review and finance modules */
  can_access_accounting: boolean;
  /** When true, admin can view Finance Analytics dashboard */
  can_view_analytics: boolean;
  delegates_for_user_id: number | null;
  delegates_for_user_name: string | null;
  delegation_starts_at: string | null;
  delegation_ends_at: string | null;
}

/**
 * Default capabilities for new users or when user profile is loading.
 */
export const DEFAULT_USER_CAPABILITIES: UserCapabilities = {
  can_create_expenses: true,
  can_create_corporate_expenses: false,
  can_invoice_corporation: false,
  is_amex_reconciler: false,
  is_subcontractor: false,
  requires_time_tracking: false,
  has_executive_reporting: false,
  can_access_accounting: false,
  can_view_analytics: false,
  delegates_for_user_id: null,
  delegates_for_user_name: null,
  delegation_starts_at: null,
  delegation_ends_at: null,
};