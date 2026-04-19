/**
 * expenseDecision.ts — My Work decision context helper.
 *
 * A pure, deterministic function that derives what matters for the currently
 * selected expense/report before any module component renders.
 *
 * No React, no hooks, no async, no AI.
 * Given the same inputs it always produces the same output.
 *
 * ── Typical usage ────────────────────────────────────────────────────────────
 *
 *   import { deriveExpenseDecision } from "@/lib/my-work/expenseDecision";
 *
 *   const decision = useMemo(
 *     () => deriveExpenseDecision({
 *       item:     selected,
 *       actions,
 *       blockers: apiBlockers,
 *       policy:   effectiveConfig?.expense_policy ?? null,
 *       derived:  effectiveConfig?.derived ?? null,
 *       userRole,
 *       module: {
 *         moduleId,
 *         accountingSetup: effectiveConfig?.accounting_setup ?? null,
 *         allocationPresence,
 *       },
 *     }),
 *     [selected, actions, apiBlockers, effectiveConfig, userRole, allocationPresence],
 *   );
 *
 * ── Decision rules ───────────────────────────────────────────────────────────
 *
 *   - Exactly one primaryStatus label (framed from the active module's POV)
 *   - Exactly one nextAction (the highest-priority thing to do right now)
 *   - Blockers prevent forward movement; warnings do not
 *   - When blockers exist, nextAction always directs to resolving them
 *   - Sections expand only when they are actionable or contain blocking content
 */

// ── Module ID constants ────────────────────────────────────────────────────────

export const MODULE_IDS = {
  MY_EXPENSES:       "my_expenses",
  MY_APPROVALS:      "my_approvals",
  ACCOUNTING_REVIEW: "accounting_review",
} as const;

export type KnownModuleId = (typeof MODULE_IDS)[keyof typeof MODULE_IDS];

// ── Expense status constants ───────────────────────────────────────────────────

/** Canonical status strings as returned by the API. */
export const EXPENSE_STATUS = {
  DRAFT:            "draft",
  SUBMITTED:        "submitted",
  MANAGER_APPROVED: "manager_approved",
  APPROVED:         "approved",
  REJECTED:         "rejected",
} as const;

// ── Input types ────────────────────────────────────────────────────────────────

/**
 * Fields present on all module Expense shapes.  A superset — fields only
 * present in one module (e.g. `accounting_explanation`) are optional.
 */
export interface WorkItemData {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  /** AI-matched account category code (accounting module only). */
  category_code?: string | null;
  report_id: number | null;
  created_at: string;
  /**
   * AI explanation for how the category / account code was assigned.
   * Present after the accounting module fetches the AI categorization step.
   */
  accounting_explanation?: {
    category_reason: string;
    account_reason: string;
    confidence: "high" | "medium" | "low";
    source: "learning" | "keyword" | "manual" | "default";
  } | null;

  // ── Parsed document state (employee module only) ──────────────────────────
  // Populated by MyExpensesModule after EmployeeExpenseDetail fires onDocStateChanged.
  // Used by deriveNextAction and AssistantContext to produce specific guidance.
  /** True when a CFDI XML document is linked to this expense. */
  has_xml?: boolean;
  /** True when a paired PDF document is linked (relevant when pdf_pair_required_for_cfdi). */
  has_pdf?: boolean;
  /** Result of SAT validation on the linked XML. null = not yet checked. */
  sat_status?: "valid" | "warning" | "error" | null;
  /** RFC UUID (folio fiscal) from the parsed XML. */
  xml_uuid?: string | null;
  /** Emisor name from the parsed XML. */
  xml_emisor?: string | null;
  /** Fecha de emisión from the parsed XML (ISO date string). */
  xml_fecha?: string | null;
}

/**
 * Action capabilities returned by GET /expenses/actions/:id?portal_role=<role>.
 * Superset of both ManagerActions and AccountingActions.
 */
export interface WorkflowActions {
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  /** Accounting module only. */
  can_assign_account_code?: boolean;
  /** Accounting module only. */
  can_generate_accounting_event?: boolean;
  /**
   * Human-readable reasons why certain actions are unavailable.
   * Used as derived blockers when can_approve is false.
   */
  reasons: string[];
}

/**
 * Blocker and warning data from GET /expenses/blockers/:id.
 * Only populated by the accounting module.
 */
export interface WorkflowBlockers {
  /** Hard blockers — prevent accounting approval. */
  accounting_blockers: string[];
  /** Soft blockers — prevent póliza generation but not approval. */
  poliza_blockers: string[];
  /** Non-blocking advisory notices. */
  warnings: string[];
}

/**
 * Which allocation dimensions are present on the selected item.
 * From GET /expenses/allocations-summary/:id (accounting module only).
 */
export interface WorkflowAllocationPresence {
  has_any: boolean;
  has_project: boolean;
  has_client: boolean;
  has_cost_center: boolean;
}

/** Relevant subset of PortalConfig.expense_policy. */
export interface DecisionExpensePolicy {
  xml_required_mode: string;           // "always" | "mxn_only" | "never"
  pdf_pair_required_for_cfdi: boolean;
  tickets_allowed: boolean;
  require_justification: boolean;
  require_proof: boolean;
  allow_split_allocations: boolean;
  manager_approval_required: boolean;
  accounting_review_required: boolean;
  ai_policy_assist_enabled: boolean;
}

/** Relevant subset of PortalConfig.derived. */
export interface DecisionDerived {
  workflow_mode: string;
  manager_flow_enabled: boolean;
  accounting_flow_enabled: boolean;
  allocation_dimensions: string[];
  allow_split_allocations: boolean;
  tickets_allowed: boolean;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
}

/**
 * Module-specific context that the active module passes in.
 * Each module only populates the fields it has — unneeded fields stay null.
 */
export interface ModuleDecisionContext {
  /** Active module identifier.  See MODULE_IDS for valid values. */
  moduleId: string;
  /**
   * PortalConfig.accounting_setup — provides dimension requirements.
   * Passed by the accounting module; null everywhere else.
   */
  accountingSetup: Record<string, unknown> | null;
  /**
   * Whether the selected expense has at least one attached document.
   * Set to true/false when known; leave undefined when not yet fetched.
   */
  hasDocuments?: boolean;
  /**
   * Per-expense allocation presence.
   * Fetched by the accounting module via /expenses/allocations-summary/:id.
   * Null in other modules.
   */
  allocationPresence: WorkflowAllocationPresence | null;
}

/** Complete input bag for deriveExpenseDecision(). */
export interface ExpenseDecisionInput {
  /** The selected expense/report.  Pass null when nothing is selected. */
  item: WorkItemData | null;
  /** Action capabilities for the selected item.  Null while loading. */
  actions: WorkflowActions | null;
  /**
   * Blockers and warnings from the API.
   * Populated by the accounting module; null elsewhere or while loading.
   */
  blockers: WorkflowBlockers | null;
  /** Expense policy block from the active portal config. */
  policy: DecisionExpensePolicy | null;
  /** Derived block from the active portal config. */
  derived: DecisionDerived | null;
  /** Current user's role string ("employee" | "manager" | "accounting" | "admin"). */
  userRole: string | null;
  /** Module-specific context from the host component. */
  module: ModuleDecisionContext;
}

// ── Output types ───────────────────────────────────────────────────────────────

/** Where in the overall workflow this item currently sits. */
export type WorkflowStep =
  | "employee_draft"      // Created; not yet submitted
  | "employee_submitted"  // Submitted; no review flows configured
  | "manager_review"      // Awaiting manager approval
  | "accounting_review"   // Awaiting accounting assignment / approval
  | "complete"            // Fully approved and closed
  | "rejected";           // Rejected at any workflow stage

/**
 * Section keys that module components check to decide which UI blocks to
 * render.  Only keys relevant to the active module are emitted.
 */
export type SectionKey =
  | "status_badge"            // Compact status chip — always shown
  | "expense_summary"         // Amount + description + date header
  | "expense_details"         // Full field list (employee module)
  | "document_upload"         // CFDI / PDF drop zone (employee module)
  | "requirements"            // Justification / proof fields (employee module)
  | "allocations"             // Allocation dimension grid (any module)
  | "ai_category_explanation" // AI categorization reasoning
  | "category_detail"         // Detected-category badge (approval module)
  | "account_code_detail"     // Account code display (approval module)
  | "readiness"               // Blockers + warnings checklist (accounting module)
  | "required_fields"         // Account code input + allocation checks (accounting)
  | "approval_actions"        // Approve / Reject / Return bar (manager module)
  | "accounting_actions"      // Approve / Reject / Return bar (accounting module)
  | "poliza";                 // Póliza generation block (accounting module)

/** Structured context object for the AI assistant payload. */
export interface AssistantContext {
  /** Expense id for API correlation. */
  expenseId: number | null;
  /** Active module id. */
  moduleId: string;
  /** Current user's role. */
  userRole: string | null;
  /** Where in the workflow this item sits. */
  workflowStep: WorkflowStep;
  /** Raw API status string. */
  currentStatus: string;
  /** Human-readable canonical status from the active module's perspective. */
  primaryStatus: string;
  /** The single most important action for the current user right now. */
  nextAction: string;
  /** True when there are hard blockers preventing forward movement. */
  hasBlockers: boolean;
  /** Count of active hard blockers. */
  blockerCount: number;
  /** True when there are non-blocking warnings. */
  hasWarnings: boolean;
  /** Count of active warnings. */
  warningCount: number;
  /** True when no account code has been assigned. */
  missingAccountCode: boolean;
  /**
   * True when the expense policy requires a document (e.g. CFDI XML) and none
   * has been confirmed.  Requires `module.hasDocuments` to be passed explicitly.
   */
  missingRequiredDocuments: boolean;
  /** Allocation dimension labels that are required but not present. */
  missingAllocations: string[];
  amount: number | null;
  description: string | null;
  detectedCategory: string | null;
  accountCode: string | null;
  /** Human-readable policy constraints derived from the company config. */
  policyNotes: string[];
  /** AI categorization confidence, if available from accounting_explanation. */
  aiCategoryConfidence: "high" | "medium" | "low" | null;
  canApprove: boolean;
  canReject: boolean;
  canReturn: boolean;

  // ── Document state (employee module) ─────────────────────────────────────
  /** True when a CFDI XML is linked to this expense. */
  hasXml: boolean;
  /** True when a paired PDF is linked. */
  hasPdf: boolean;
  /** Result of SAT validation. null = not yet checked. */
  satStatus: "valid" | "warning" | "error" | null;
  /** Emisor name from the parsed XML. */
  xmlVendor: string | null;
  /** Folio fiscal UUID from the parsed XML. */
  xmlUuid: string | null;
  /** Fecha de emisión from the parsed XML. */
  xmlFecha: string | null;
  /** True when policy requires a CFDI XML for this expense. */
  xmlRequired: boolean;
  /** True when policy requires a paired PDF alongside the XML. */
  pdfPairRequired: boolean;
}

/** Complete output of deriveExpenseDecision(). */
export interface ExpenseDecision {
  /**
   * Single canonical status label framed from the active module's perspective.
   * Always exactly one value — never an array.
   */
  primaryStatus: string;

  /**
   * The single most important action for the current user right now.
   * When blockers exist this directs the user to resolve them first.
   * Always exactly one value.
   */
  nextAction: string;

  /**
   * Hard blockers — prevent forward movement (approval / submission / export).
   * Blockers always take precedence over warnings and gate the nextAction.
   * Empty when there are no blockers.
   */
  blockers: string[];

  /**
   * Non-blocking notices (low AI confidence, póliza issues, advisory policy notes).
   * Shown after blockers, or alone when no blockers are present.
   */
  warnings: string[];

  /**
   * Section keys that should be rendered for this item + module combination.
   * Components call `decision.visibleSections.includes("readiness")` before
   * rendering a section.
   */
  visibleSections: SectionKey[];

  /**
   * Subset of visibleSections that should auto-expand on first render.
   * A section is only expanded when it is actionable or contains blocking
   * content — purely informational sections default to collapsed.
   */
  expandedSections: SectionKey[];

  /** Rich flat context for the AI assistant payload. */
  assistantContext: AssistantContext;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function deriveWorkflowStep(
  status: string,
  derived: DecisionDerived | null,
): WorkflowStep {
  if (status === EXPENSE_STATUS.REJECTED) return "rejected";
  if (status === EXPENSE_STATUS.APPROVED) return "complete";
  if (status === EXPENSE_STATUS.MANAGER_APPROVED) {
    return derived?.accounting_flow_enabled ? "accounting_review" : "complete";
  }
  if (status === EXPENSE_STATUS.SUBMITTED) {
    if (derived?.manager_flow_enabled)   return "manager_review";
    if (derived?.accounting_flow_enabled) return "accounting_review";
    return "employee_submitted";
  }
  if (status === EXPENSE_STATUS.DRAFT) return "employee_draft";
  return "employee_submitted";
}

function derivePrimaryStatus(
  status: string,
  moduleId: string,
  derived: DecisionDerived | null,
): string {
  switch (moduleId) {
    case MODULE_IDS.MY_EXPENSES: {
      switch (status) {
        case EXPENSE_STATUS.DRAFT:
          return "Draft";
        case EXPENSE_STATUS.SUBMITTED:
          if (derived?.manager_flow_enabled)    return "Pending manager review";
          if (derived?.accounting_flow_enabled) return "Pending accounting review";
          return "Submitted";
        case EXPENSE_STATUS.MANAGER_APPROVED:
          return derived?.accounting_flow_enabled
            ? "Manager approved — pending accounting"
            : "Approved";
        case EXPENSE_STATUS.APPROVED:
          return "Approved";
        case EXPENSE_STATUS.REJECTED:
          return "Rejected";
        default:
          return toTitleCase(status);
      }
    }

    case MODULE_IDS.MY_APPROVALS: {
      switch (status) {
        case EXPENSE_STATUS.SUBMITTED:
          return "Awaiting your review";
        case EXPENSE_STATUS.MANAGER_APPROVED:
          return "Approved by you";
        case EXPENSE_STATUS.APPROVED:
          return "Fully approved";
        case EXPENSE_STATUS.REJECTED:
          return "Rejected";
        default:
          return toTitleCase(status);
      }
    }

    case MODULE_IDS.ACCOUNTING_REVIEW: {
      switch (status) {
        case EXPENSE_STATUS.SUBMITTED:
          return "Pending accounting review";
        case EXPENSE_STATUS.MANAGER_APPROVED:
          return "Manager approved — awaiting accounting";
        case EXPENSE_STATUS.APPROVED:
          return "Approved";
        case EXPENSE_STATUS.REJECTED:
          return "Rejected";
        default:
          return toTitleCase(status);
      }
    }

    default:
      return toTitleCase(status);
  }
}

function derivePolicyNotes(policy: DecisionExpensePolicy | null): string[] {
  if (!policy) return [];
  const notes: string[] = [];

  if (policy.xml_required_mode === "always") {
    notes.push("CFDI XML required for all expenses");
  } else if (policy.xml_required_mode === "mxn_only") {
    notes.push("CFDI XML required for MXN expenses");
  }
  if (policy.pdf_pair_required_for_cfdi) {
    notes.push("Paired PDF required with CFDI documents");
  }
  if (!policy.tickets_allowed) {
    notes.push("Informal tickets not permitted by policy");
  }
  if (policy.require_justification) {
    notes.push("Justification required for this expense");
  }
  if (policy.require_proof) {
    notes.push("Proof document required");
  }
  return notes;
}

/**
 * Returns allocation dimension labels that are required but not present.
 * Only computed for the accounting module, which fetches allocationPresence
 * per expense.  Returns [] for all other modules.
 */
function deriveMissingAllocations(
  moduleId: string,
  accountingSetup: Record<string, unknown> | null,
  allocationPresence: WorkflowAllocationPresence | null,
): string[] {
  if (moduleId !== MODULE_IDS.ACCOUNTING_REVIEW) return [];
  if (!allocationPresence) return [];

  const missing: string[] = [];
  if (accountingSetup?.project_required === true && !allocationPresence.has_project) {
    missing.push("Project");
  }
  if (accountingSetup?.client_required === true && !allocationPresence.has_client) {
    missing.push("Client");
  }
  if (accountingSetup?.cost_center_required === true && !allocationPresence.has_cost_center) {
    missing.push("Cost Center");
  }
  return missing;
}

/**
 * Assembles the final blockers list.
 *
 * Sources (in priority order):
 *  1. API accounting_blockers (hard — accounting module only)
 *  2. actions.reasons when can_approve is false (derived hard blockers)
 *  3. Missing required allocation dimensions (local derivation)
 *
 * Poliza blockers are NOT included here — they appear in warnings instead
 * because they block póliza generation, not the approval step itself.
 */
function assembleBlockers(
  item: WorkItemData,
  actions: WorkflowActions | null,
  apiBlockers: WorkflowBlockers | null,
  moduleId: string,
  missingAllocations: string[],
): string[] {
  const seen = new Set<string>();
  const blockers: string[] = [];

  const add = (msg: string) => {
    if (!seen.has(msg)) { seen.add(msg); blockers.push(msg); }
  };

  if (moduleId === MODULE_IDS.ACCOUNTING_REVIEW) {
    // Hard API blockers first
    for (const b of apiBlockers?.accounting_blockers ?? []) add(b);

    // action.reasons explain why can_approve is false — treat as blockers
    if (actions && !actions.can_approve) {
      for (const r of actions.reasons) add(r);
    }
  }

  // Missing required allocations (accounting module — derived locally)
  for (const dim of missingAllocations) {
    add(`${dim} allocation required but not assigned`);
  }

  return blockers;
}

/**
 * Assembles the warnings list.
 *
 * Sources:
 *  - Poliza blockers (amber — prevent póliza, not approval)
 *  - API warnings
 *  - Low AI category confidence
 *  - Missing detected category (accounting module)
 */
function assembleWarnings(
  item: WorkItemData,
  apiBlockers: WorkflowBlockers | null,
  moduleId: string,
): string[] {
  const seen = new Set<string>();
  const warnings: string[] = [];

  const add = (msg: string) => {
    if (!seen.has(msg)) { seen.add(msg); warnings.push(msg); }
  };

  if (moduleId === MODULE_IDS.ACCOUNTING_REVIEW) {
    // Poliza blockers are warnings: they prevent export, not approval
    for (const w of apiBlockers?.poliza_blockers ?? []) add(w);
    for (const w of apiBlockers?.warnings       ?? []) add(w);
  }

  // AI confidence hint
  if (item.accounting_explanation?.confidence === "low") {
    add("AI category confidence is low — verify the suggested account code manually");
  }

  // Absent category in accounting context
  if (item.detected_category === null && moduleId === MODULE_IDS.ACCOUNTING_REVIEW) {
    add("Category could not be automatically detected — manual review recommended");
  }

  return warnings;
}

/**
 * Derives the single highest-priority action the user should take.
 *
 * Priority chain:
 *  1. Blockers present → direct user to resolve them
 *  2. Module-specific rules (see inline comments)
 */
function deriveNextAction(
  item: WorkItemData,
  actions: WorkflowActions | null,
  blockers: string[],
  moduleId: string,
  policy: DecisionExpensePolicy | null,
  missingAllocations: string[],
): string {
  // Blockers always gate the next action
  if (blockers.length > 0) {
    const n = blockers.length;
    return `Resolve ${n} blocker${n > 1 ? "s" : ""} before proceeding`;
  }

  switch (moduleId) {

    case MODULE_IDS.MY_EXPENSES: {
      const s = item.status;
      if (s === EXPENSE_STATUS.DRAFT) {
        const xmlRequired   = policy?.xml_required_mode === "always";
        const pdfPairReq    = xmlRequired && (policy?.pdf_pair_required_for_cfdi ?? false);
        const hasXml        = item.has_xml ?? false;
        const hasPdf        = item.has_pdf ?? false;
        const satErr        = item.sat_status === "error";
        const satWarn       = item.sat_status === "warning";
        const docStateKnown = item.has_xml !== undefined; // undefined = not yet loaded

        if (docStateKnown) {
          if (xmlRequired && !hasXml)              return "Upload CFDI XML to continue";
          if (hasXml && satErr)                    return "SAT validation failed — re-upload the XML";
          if (hasXml && satWarn)                   return "Review SAT warnings before submitting";
          if (hasXml && pdfPairReq && !hasPdf)     return "Upload paired PDF to complete";
          if (hasXml && (!pdfPairReq || hasPdf))   return "Ready to submit";
        } else {
          // Doc state not yet loaded — fall back to policy-based guidance
          if (xmlRequired) return "Upload CFDI XML to continue";
        }
        return "Submit this expense for review";
      }
      if (s === EXPENSE_STATUS.SUBMITTED || s === EXPENSE_STATUS.MANAGER_APPROVED) {
        return "No action needed — awaiting review";
      }
      if (s === EXPENSE_STATUS.APPROVED) {
        return "No further action required";
      }
      if (s === EXPENSE_STATUS.REJECTED) {
        return "Review feedback and resubmit";
      }
      return "No action available";
    }

    case MODULE_IDS.MY_APPROVALS: {
      if (!actions) return "Loading available actions…";
      if (actions.can_approve && actions.can_reject) return "Review and approve or reject this expense";
      if (actions.can_approve)                       return "Approve this expense";
      if (actions.can_return)                        return "Return to employee for corrections";
      if (actions.can_reject)                        return "Reject this expense";
      if (item.status === EXPENSE_STATUS.APPROVED)   return "No further action required";
      return "No action available for this item";
    }

    case MODULE_IDS.ACCOUNTING_REVIEW: {
      if (!actions) return "Loading available actions…";
      // Missing account code is the most common actionable blocker
      if (!item.account_code && actions.can_assign_account_code) {
        return "Assign an account code to proceed";
      }
      // Missing allocations (already in blockers if present — this handles
      // the case where blockers[] was empty but allocations are missing)
      if (missingAllocations.length > 0) {
        return `Add missing allocation: ${missingAllocations[0]}`;
      }
      if (actions.can_approve)                     return "Review and approve for accounting";
      if (actions.can_reject)                      return "Reject this expense";
      if (actions.can_return)                      return "Return to employee";
      if (item.status === EXPENSE_STATUS.APPROVED) return "No further action required";
      return "No action available";
    }

    default:
      return "No action available";
  }
}

/**
 * Determines which detail sections should be rendered.
 *
 * Rules:
 *   - Only sections relevant to the active module are candidates.
 *   - Config-gated sections are excluded when their feature is off.
 *   - Informational sections are excluded when there is nothing to act on.
 *   - Prefer hidden over disabled: do not emit a section that would render
 *     as grayed-out or "not available".
 */
function deriveVisibleSections(
  item: WorkItemData,
  actions: WorkflowActions | null,
  apiBlockers: WorkflowBlockers | null,
  policy: DecisionExpensePolicy | null,
  derived: DecisionDerived | null,
  moduleId: string,
  accountingSetup: Record<string, unknown> | null,
  allocationPresence: WorkflowAllocationPresence | null,
  blockers: string[],
  warnings: string[],
  missingAllocations: string[],
): SectionKey[] {
  const sections: SectionKey[] = [];

  switch (moduleId) {

    case MODULE_IDS.MY_EXPENSES: {
      // Core content — always present
      sections.push("expense_details", "status_badge");

      // Editable sections are only relevant while the item is still in draft.
      // After submission the employee cannot modify these fields, so showing
      // them would be informational noise.
      const isDraft = item.status === EXPENSE_STATUS.DRAFT;

      // Document upload: only when policy requires docs AND item is editable.
      if (policy?.xml_required_mode !== "never" && isDraft) {
        sections.push("document_upload");
      }

      // Allocations: only when dimensions are configured AND item is editable.
      if ((derived?.allocation_dimensions ?? []).length > 0 && isDraft) {
        sections.push("allocations");
      }

      // Requirements: only when policy mandates them AND item is editable.
      if (policy && (policy.require_justification || policy.require_proof) && isDraft) {
        sections.push("requirements");
      }

      // AI classification: only when data is present.
      if (item.accounting_explanation) sections.push("ai_category_explanation");
      break;
    }

    case MODULE_IDS.MY_APPROVALS: {
      // Core content — always present
      sections.push("expense_summary", "status_badge");

      const hasActions = !!(
        actions && (actions.can_approve || actions.can_reject || actions.can_return)
      );

      // Action bar: only when the manager can actually act.
      if (hasActions) sections.push("approval_actions");

      // Supporting context fields: only useful when informing a pending decision.
      // Hide them when there is nothing to decide (no available actions).
      if (hasActions) {
        if (item.detected_category !== null) sections.push("category_detail");
        if (item.account_code       !== null) sections.push("account_code_detail");
      }
      break;
    }

    case MODULE_IDS.ACCOUNTING_REVIEW: {
      // Core content — always present
      sections.push("expense_summary");

      // Readiness: only when there are blockers or warnings to address.
      // Silence is correct when all-clear — do not emit an empty section.
      if (blockers.length > 0 || warnings.length > 0) sections.push("readiness");

      // Required fields: only when there is something to assign or correct.
      // Hide when account code is already set and allocations are complete.
      const needsCode  = !item.account_code;
      const hasMissing = missingAllocations.length > 0;
      if (needsCode || hasMissing) sections.push("required_fields");

      // Action bar: only when the accountant can act.
      if (actions && (actions.can_approve || actions.can_reject || actions.can_return)) {
        sections.push("accounting_actions");
      }

      // AI classification: only when data is present.
      if (item.accounting_explanation) sections.push("ai_category_explanation");

      // Poliza: only when required by setup AND the action is available or
      // poliza blockers exist. Hide when not relevant to current state.
      if (
        accountingSetup?.poliza_required === true &&
        (
          actions?.can_generate_accounting_event === true ||
          (apiBlockers?.poliza_blockers.length ?? 0) > 0
        )
      ) {
        sections.push("poliza");
      }

      // Allocations: only when dimensions are required AND presence data is known.
      const hasRequiredDims =
        accountingSetup?.project_required     === true ||
        accountingSetup?.client_required      === true ||
        accountingSetup?.cost_center_required === true;
      if (hasRequiredDims && allocationPresence) sections.push("allocations");
      break;
    }

    default: {
      sections.push("expense_summary", "status_badge");
      break;
    }
  }

  return sections;
}

/**
 * Determines which visible sections should start expanded.
 *
 * Rule: a section is expanded only when it is actionable or contains blocking
 * content.  Purely informational sections (e.g. expense_details for reference)
 * default to collapsed so the user sees the most important content first.
 */
function deriveExpandedSections(
  visibleSections: SectionKey[],
  item: WorkItemData,
  actions: WorkflowActions | null,
  moduleId: string,
  blockers: string[],
  warnings: string[],
  missingAllocations: string[],
  policy: DecisionExpensePolicy | null,
): SectionKey[] {
  const visible  = new Set(visibleSections);
  const expanded = new Set<SectionKey>();

  const expand = (k: SectionKey) => { if (visible.has(k)) expanded.add(k); };

  // Because visibleSections is already tightly filtered — sections only appear
  // when they are actionable or contain blocking content — expansion rules are
  // simple: visible sections expand by default, with two exceptions:
  //   1. document_upload expands only when the policy mandates CFDI (primary CTA).
  //   2. ai_category_explanation expands only on low confidence (needs attention).

  switch (moduleId) {

    case MODULE_IDS.MY_EXPENSES: {
      expand("status_badge");
      // Upload: expand only when upload is the required first step
      if (policy?.xml_required_mode === "always") expand("document_upload");
      // Requirements: always expand when visible (only shown in draft when required)
      expand("requirements");
      // Allocations: expand only when incomplete
      if (missingAllocations.length > 0) expand("allocations");
      break;
    }

    case MODULE_IDS.MY_APPROVALS: {
      // Both are only visible when the manager has pending decisions
      expand("expense_summary");
      expand("approval_actions");
      break;
    }

    case MODULE_IDS.ACCOUNTING_REVIEW: {
      // All three are only visible when actionable — always expand them
      expand("readiness");
      expand("required_fields");
      expand("accounting_actions");
      // AI classification: expand only when confidence is low (needs attention)
      if (item.accounting_explanation?.confidence === "low") expand("ai_category_explanation");
      break;
    }
  }

  return Array.from(expanded);
}

// ── Empty / no-selection decision ────────────────────────────────────────────

function emptyDecision(moduleId: string, userRole: string | null): ExpenseDecision {
  const nextAction = "Select an item from the list";
  return {
    primaryStatus: "No item selected",
    nextAction,
    blockers: [],
    warnings: [],
    visibleSections: [],
    expandedSections: [],
    assistantContext: {
      expenseId: null,
      moduleId,
      userRole,
      workflowStep: "employee_draft",
      currentStatus: "",
      primaryStatus: "No item selected",
      nextAction,
      hasBlockers: false,
      blockerCount: 0,
      hasWarnings: false,
      warningCount: 0,
      missingAccountCode: false,
      missingRequiredDocuments: false,
      missingAllocations: [],
      amount: null,
      description: null,
      detectedCategory: null,
      accountCode: null,
      policyNotes: [],
      aiCategoryConfidence: null,
      canApprove: false,
      canReject: false,
      canReturn: false,
      hasXml: false,
      hasPdf: false,
      satStatus: null,
      xmlVendor: null,
      xmlUuid: null,
      xmlFecha: null,
      xmlRequired: false,
      pdfPairRequired: false,
    },
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Derive the full decision context for the currently selected work item.
 *
 * Returns `emptyDecision` (a neutral sentinel value) when `item` is null —
 * safe to render without null-checking every field downstream.
 *
 * Wrap in `useMemo()` in the host component:
 *
 * ```ts
 * const decision = useMemo(
 *   () => deriveExpenseDecision({ item: selected, actions, blockers, policy, derived, userRole, module }),
 *   [selected, actions, blockers, policy, derived, userRole, module],
 * );
 * ```
 */
export function deriveExpenseDecision(input: ExpenseDecisionInput): ExpenseDecision {
  const {
    item,
    actions,
    blockers: apiBlockers,
    policy,
    derived,
    userRole,
    module: mod,
  } = input;

  const { moduleId, accountingSetup, allocationPresence } = mod;

  if (!item) return emptyDecision(moduleId, userRole);

  // ── Derived sub-values (order matters — later values depend on earlier ones) ─

  const workflowStep       = deriveWorkflowStep(item.status, derived);
  const primaryStatus      = derivePrimaryStatus(item.status, moduleId, derived);
  const policyNotes        = derivePolicyNotes(policy);
  const missingAllocations = deriveMissingAllocations(moduleId, accountingSetup, allocationPresence);

  // Blockers are assembled before nextAction so nextAction can gate on them
  const blockers = assembleBlockers(item, actions, apiBlockers, moduleId, missingAllocations);
  const warnings = assembleWarnings(item, apiBlockers, moduleId);
  const nextAction = deriveNextAction(item, actions, blockers, moduleId, policy, missingAllocations);

  const visibleSections  = deriveVisibleSections(
    item, actions, apiBlockers, policy, derived, moduleId, accountingSetup, allocationPresence,
    blockers, warnings, missingAllocations,
  );
  const expandedSections = deriveExpandedSections(
    visibleSections, item, actions, moduleId, blockers, warnings, missingAllocations, policy,
  );

  // ── Assistant context ──────────────────────────────────────────────────────
  //
  // missingRequiredDocuments requires the caller to pass mod.hasDocuments
  // explicitly — we can only know this if the module has fetched document state.
  const xmlRequired        = policy?.xml_required_mode === "always";
  const pdfPairRequired    = xmlRequired && (policy?.pdf_pair_required_for_cfdi ?? false);
  const hasXml             = item.has_xml ?? false;
  const hasPdf             = item.has_pdf ?? false;

  const missingRequiredDocuments =
    (policy?.xml_required_mode === "always" && !hasXml) ||
    (mod.hasDocuments === false && policy?.xml_required_mode === "always");

  const assistantContext: AssistantContext = {
    expenseId:               item.id,
    moduleId,
    userRole,
    workflowStep,
    currentStatus:           item.status,
    primaryStatus,
    nextAction,
    hasBlockers:             blockers.length > 0,
    blockerCount:            blockers.length,
    hasWarnings:             warnings.length > 0,
    warningCount:            warnings.length,
    missingAccountCode:      item.account_code === null,
    missingRequiredDocuments,
    missingAllocations,
    amount:                  item.amount,
    description:             item.description,
    detectedCategory:        item.detected_category,
    accountCode:             item.account_code,
    policyNotes,
    aiCategoryConfidence:    item.accounting_explanation?.confidence ?? null,
    canApprove:              actions?.can_approve ?? false,
    canReject:               actions?.can_reject  ?? false,
    canReturn:               actions?.can_return  ?? false,
    hasXml,
    hasPdf,
    satStatus:               item.sat_status ?? null,
    xmlVendor:               item.xml_emisor ?? null,
    xmlUuid:                 item.xml_uuid   ?? null,
    xmlFecha:                item.xml_fecha  ?? null,
    xmlRequired,
    pdfPairRequired,
  };

  return {
    primaryStatus,
    nextAction,
    blockers,
    warnings,
    visibleSections,
    expandedSections,
    assistantContext,
  };
}
