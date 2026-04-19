/**
 * Deterministic portal-config conflict detection.
 *
 * Accepts the full portalConfig object (as returned by GET /admin/portal-config/:id)
 * and returns a flat list of detected conflicts with codes, human-readable messages,
 * and severity ratings.
 *
 * Pure function — no side effects, no async, no external dependencies.
 * Safe to call in render, in the setup-orchestrator fallback, and in tests.
 */

export interface PortalConfigConflict {
  code: string;
  message: string;
  severity: "warning" | "critical";
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Modes that require manager routing. */
const MANAGER_APPROVAL_MODES = new Set([
  "manager_only",
  "manager_then_accounting",
  "threshold_based",
]);

const MANAGER_WORKFLOW_MODES = new Set([
  "manager_only",
  "manager_then_accounting",
]);

/** Coerce to boolean. Only `true` (exact) returns true. */
function bool(v: unknown): boolean {
  return v === true;
}

/** Normalised lowercase string, empty string as fallback. */
function str(v: unknown, fallback = ""): string {
  return v != null ? String(v).trim().toLowerCase() : fallback;
}

/**
 * Check whether a dimension keyword is present in the allocation model.
 *
 * The raw allocation_dimensions field is a single underscore-joined string such as
 * "project_client_cost_center". Compound keywords like "cost_center" are therefore
 * naturally present as a substring — we check the raw string to avoid false negatives
 * from token splitting. We additionally check the derived list for forward-compatibility.
 */
function hasDim(rawString: string, derivedList: string[], keyword: string): boolean {
  if (rawString.includes(keyword)) return true;
  if (derivedList.some((d) => d === keyword || d.includes(keyword))) return true;
  return false;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function getPortalConfigConflicts(
  portalConfig: any
): PortalConfigConflict[] {
  if (!portalConfig) return [];

  const cs  = portalConfig.company_setup    ?? {};
  const ep  = portalConfig.expense_policy   ?? {};
  const ac  = portalConfig.accounting_setup ?? {};
  const ap  = portalConfig.approval_setup   ?? {};
  const wf  = portalConfig.workflow_setup   ?? {};
  const drv = portalConfig.derived          ?? {};

  // ── Company setup ───────────────────────────────────────────────────────────
  const hasManagers       = bool(cs.has_managers);
  const accountingEnabled = bool(cs.accounting_module_enabled);
  const approvalsEnabled  = bool(cs.approvals_module_enabled);
  const reimbEnabled      = bool(cs.reimbursements_module_enabled);
  const multiCountry      = bool(cs.operates_multi_country);
  const multiEntity       = bool(cs.operates_multi_entity);

  // ── Expense policy ──────────────────────────────────────────────────────────
  const intlAllowed        = bool(ep.international_expenses_allowed);
  const ticketsAllowed     = bool(ep.tickets_allowed);
  const xmlMode            = str(ep.xml_required_mode, "none");
  const pdfPairRequired    = bool(ep.pdf_pair_required_for_cfdi);
  const managerApprovalReq = bool(ep.manager_approval_required);

  // Allocation dimensions: raw underscore string (for substring checks) + derived list.
  const rawAllocDims  = typeof ep.allocation_dimensions === "string"
    ? ep.allocation_dimensions.toLowerCase()
    : "";
  const derivedDims: string[] = Array.isArray(drv.allocation_dimensions)
    ? drv.allocation_dimensions.map((d: unknown) => str(d))
    : [];
  const hasDims = rawAllocDims.length > 0 || derivedDims.length > 0;

  // ── Accounting setup ────────────────────────────────────────────────────────
  const accountingReviewMode = str(ac.accounting_review_mode, "all");
  const polizaRequired       = bool(ac.poliza_required);
  const accountCodeRequired  = bool(ac.account_code_required);
  const costCenterRequired   = bool(ac.cost_center_required);
  const projectRequired      = bool(ac.project_required);
  const clientRequired       = bool(ac.client_required);
  const reimbEntityRequired  = bool(ac.reimbursement_entity_required);

  // ── Approval setup ──────────────────────────────────────────────────────────
  const approvalMode       = str(ap.approval_mode, "none");
  const reqManagerForAll   = bool(ap.require_manager_for_all_employees);
  const escalateIntl       = bool(ap.escalate_international_to_accounting);
  const escalateMissingDoc = bool(ap.escalate_missing_documents_to_manager);
  const managerThreshold   = ap.manager_threshold_amount as number | null | undefined;

  // ── Workflow setup ──────────────────────────────────────────────────────────
  const wfMode             = str(wf.default_expense_workflow_mode, "standard");
  const routePolicyTo      = str(wf.route_policy_failures_to, "accounting");
  const routeMissingDocsTo = str(wf.route_missing_documents_to, "employee");
  const routeIntlTo        = str(wf.route_international_expenses_to, "accounting");

  const out: PortalConfigConflict[] = [];

  const add = (
    code: string,
    message: string,
    severity: "warning" | "critical"
  ) => out.push({ code, message, severity });

  // ── Section 1: Manager routing with no managers ───────────────────────────

  if (MANAGER_APPROVAL_MODES.has(approvalMode) && !hasManagers) {
    add(
      "MANAGER_FLOW_NO_MANAGERS",
      `Approval mode is "${approvalMode}" but the company has no managers. Manager routing will never trigger.`,
      "critical"
    );
  }

  if (MANAGER_WORKFLOW_MODES.has(wfMode) && !hasManagers) {
    add(
      "MANAGER_WORKFLOW_NO_MANAGERS",
      `Workflow mode is "${wfMode}" but the company has no managers. Expenses will have no valid routing path.`,
      "critical"
    );
  }

  if (reqManagerForAll && !hasManagers) {
    add(
      "REQUIRE_MANAGER_ALL_NO_MANAGERS",
      "Approval setup requires a manager for all employees, but the company has no managers configured.",
      "critical"
    );
  }

  if (managerApprovalReq && !hasManagers) {
    add(
      "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
      "The expense policy requires manager approval, but the company has no managers configured.",
      "critical"
    );
  }

  if (escalateMissingDoc && !hasManagers) {
    add(
      "ESCALATE_MISSING_DOCS_NO_MANAGERS",
      "Missing-document escalation routes to manager, but the company has no managers.",
      "warning"
    );
  }

  if (routePolicyTo === "manager" && !hasManagers) {
    add(
      "ROUTE_POLICY_FAILURES_NO_MANAGERS",
      "Policy failures are routed to manager, but the company has no managers.",
      "warning"
    );
  }

  if (routeMissingDocsTo === "manager" && !hasManagers) {
    add(
      "ROUTE_MISSING_DOCS_NO_MANAGERS",
      "Missing-document routing is set to manager, but the company has no managers.",
      "warning"
    );
  }

  // ── Section 2: International setup contradictions ─────────────────────────

  if (escalateIntl && !intlAllowed) {
    add(
      "INTL_ESCALATION_INTL_DISABLED",
      "International escalation is enabled, but international expenses are not allowed by the expense policy.",
      "warning"
    );
  }

  if (routeIntlTo !== "none" && !intlAllowed) {
    add(
      "INTL_ROUTING_INTL_DISABLED",
      `International expenses are routed to "${routeIntlTo}", but international expenses are disabled in the expense policy.`,
      "warning"
    );
  }

  if (multiCountry && !intlAllowed) {
    add(
      "MULTI_COUNTRY_INTL_DISABLED",
      "The company operates across multiple countries, but international expenses are disabled in the expense policy.",
      "warning"
    );
  }

  // ── Section 3: Accounting dimension requirements vs allocation model ───────

  if (projectRequired && hasDims && !hasDim(rawAllocDims, derivedDims, "project")) {
    add(
      "PROJECT_REQUIRED_NOT_IN_DIMS",
      "Accounting requires project allocation, but \"project\" is not included in the expense allocation dimensions.",
      "critical"
    );
  }

  if (clientRequired && hasDims && !hasDim(rawAllocDims, derivedDims, "client")) {
    add(
      "CLIENT_REQUIRED_NOT_IN_DIMS",
      "Accounting requires client allocation, but \"client\" is not included in the expense allocation dimensions.",
      "critical"
    );
  }

  if (costCenterRequired && hasDims && !hasDim(rawAllocDims, derivedDims, "cost_center")) {
    add(
      "COST_CENTER_REQUIRED_NOT_IN_DIMS",
      "Accounting requires cost center allocation, but \"cost_center\" is not included in the expense allocation dimensions.",
      "critical"
    );
  }

  // ── Section 4: Approvals module / mode contradictions ─────────────────────

  if (approvalsEnabled && approvalMode === "none") {
    add(
      "APPROVALS_ENABLED_NO_MODE",
      "The approvals module is enabled but the approval mode is \"none\". Submitted expenses will not be reviewed.",
      "warning"
    );
  }

  if (approvalMode === "threshold_based" && (managerThreshold == null || managerThreshold === 0)) {
    add(
      "THRESHOLD_APPROVAL_NO_THRESHOLD",
      "Approval mode is \"threshold_based\" but no manager threshold amount is configured. All expenses will follow the fallback path.",
      "warning"
    );
  }

  // ── Section 5: Poliza / XML / CFDI contradictions ─────────────────────────

  if (polizaRequired && (xmlMode === "none" || xmlMode === "")) {
    add(
      "POLIZA_REQUIRED_NO_XML_MODE",
      "Accounting requires póliza, but the expense policy does not require XML (CFDI). Póliza generation will fail without a valid CFDI document.",
      "critical"
    );
  }

  if (pdfPairRequired && (xmlMode === "none" || xmlMode === "")) {
    add(
      "PDF_PAIR_REQUIRED_NO_XML_MODE",
      "PDF/XML pairing is required, but XML mode is set to none. Document pairs can never be satisfied.",
      "warning"
    );
  }

  // ── Section 6: Accounting module disabled but accounting rules are active ──

  if (!accountingEnabled && accountingReviewMode !== "none") {
    add(
      "ACCOUNTING_DISABLED_REVIEW_ACTIVE",
      "The accounting module is disabled, but accounting review mode is still active. Expenses will not reach an accounting reviewer.",
      "warning"
    );
  }

  if (!accountingEnabled && (polizaRequired || accountCodeRequired)) {
    add(
      "ACCOUNTING_DISABLED_STRICT_RULES",
      "The accounting module is disabled, but póliza or account code requirements remain active. These rules cannot be enforced without an accounting reviewer.",
      "warning"
    );
  }

  if (!accountingEnabled && routePolicyTo === "accounting") {
    add(
      "ROUTE_TO_ACCOUNTING_MODULE_DISABLED",
      "Policy failures are routed to accounting, but the accounting module is disabled.",
      "warning"
    );
  }

  // ── Section 7: Reimbursements ─────────────────────────────────────────────

  if (reimbEnabled && multiEntity && !reimbEntityRequired) {
    add(
      "REIMBURSEMENTS_MULTI_ENTITY_NO_ENTITY_REQUIRED",
      "Reimbursements are enabled and the company operates as multi-entity, but reimbursement entity is not required. Entity assignment will be inconsistent across legal entities.",
      "warning"
    );
  }

  // ── Section 8: Ticket routing while tickets are disabled ──────────────────

  if (!ticketsAllowed && routePolicyTo === "ticket") {
    add(
      "TICKETS_DISABLED_POLICY_ROUTE",
      "Policy failures are routed to tickets, but the expense policy does not allow tickets.",
      "warning"
    );
  }

  if (!ticketsAllowed && routeIntlTo === "ticket") {
    add(
      "TICKETS_DISABLED_INTL_ROUTE",
      "International expenses are routed to tickets, but the expense policy does not allow tickets.",
      "warning"
    );
  }

  return out;
}
