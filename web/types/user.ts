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
export type UserRole = "employee" | "manager" | "accounting" | "admin" | "executive" | "secretary";

/**
 * Per-user capability flags — set by admin per user.
 * These drive MyWork portal visibility independently of role.
 */
export interface UserCapabilities {
  can_create_expenses: boolean;
  can_create_corporate_expenses: boolean;
  can_invoice_corporation: boolean;
  is_amex_reconciler: boolean;
  requires_time_tracking: boolean;
  has_executive_reporting: boolean;
  delegates_for_user_id: number | null;
  delegates_for_user_name: string | null;
}

/**
 * Default capabilities for new users or when user profile is loading.
 */
export const DEFAULT_USER_CAPABILITIES: UserCapabilities = {
  can_create_expenses: true,
  can_create_corporate_expenses: false,
  can_invoice_corporation: false,
  is_amex_reconciler: false,
  requires_time_tracking: false,
  has_executive_reporting: false,
  delegates_for_user_id: null,
  delegates_for_user_name: null,
};