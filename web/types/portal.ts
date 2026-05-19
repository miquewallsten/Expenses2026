/**
 * Portal configuration types.
 *
 * These types match the /admin/portal-config/:company_id response shape
 * and are shared across the MyWork portal, admin settings, and conflict detection.
 */

/**
 * Company expense policy settings.
 * Stored in expense_policy table, exposed via portal config.
 */
export interface ExpensePolicy {
  id: number;
  company_id: number;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
  international_expenses_allowed: boolean;
  tickets_allowed: boolean;
  require_justification: boolean;
  require_proof: boolean;
  allow_split_allocations: boolean;
  allocation_dimensions: string;
  manager_approval_required: boolean;
  accounting_review_required: boolean;
  ai_policy_assist_enabled: boolean;
  allow_document_free_expenses: boolean;
}

/**
 * Derived values computed from the full portal config.
 * Pre-computed by the backend for frontend convenience.
 */
export interface PortalDerived {
  enabled_modules: string[];
  allocation_dimensions: string[];
  allow_split_allocations: boolean;
  tickets_allowed: boolean;
  international_expenses_allowed: boolean;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
  allow_document_free_expenses: boolean;
  manager_flow_enabled: boolean;
  accounting_flow_enabled: boolean;
  workflow_mode: string;
}

/**
 * Full portal configuration response.
 * Returned by GET /admin/portal-config/:company_id.
 */
export interface PortalConfig {
  company_setup: Record<string, unknown>;
  expense_policy: ExpensePolicy;
  accounting_setup: Record<string, unknown>;
  approval_setup: Record<string, unknown>;
  workflow_setup: Record<string, unknown>;
  derived: PortalDerived;
}

/**
 * Conflict detected in portal configuration.
 * Used by getPortalConfigConflicts() in lib/portal-config-conflicts.ts.
 */
export interface PortalConfigConflict {
  code: string;
  message: string;
  severity: "warning" | "critical";
  /** Admin section to navigate to for remediation. */
  section: string;
}