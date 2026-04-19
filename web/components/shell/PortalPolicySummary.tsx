"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DerivedConfig {
  enabled_modules: string[];
  allocation_dimensions: string[];
  allow_split_allocations: boolean;
  tickets_allowed: boolean;
  international_expenses_allowed: boolean;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
  manager_flow_enabled: boolean;
  accounting_flow_enabled: boolean;
  workflow_mode: string;
}

type PortalType = "employee" | "manager" | "accounting" | "admin";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalConfig: any;
  portalType: PortalType;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function label(text: string, accent?: string) {
  return { text, accent };
}

type Tag = ReturnType<typeof label>;

function buildTags(portalConfig: Props["portalConfig"], portalType: PortalType): Tag[] {
  const derived: DerivedConfig | undefined = portalConfig?.derived;
  const ep  = portalConfig?.expense_policy  as Record<string, unknown> | undefined;
  const as  = portalConfig?.accounting_setup as Record<string, unknown> | undefined;
  const aps = portalConfig?.approval_setup   as Record<string, unknown> | undefined;
  const ws  = portalConfig?.workflow_setup   as Record<string, unknown> | undefined;

  const tags: Tag[] = [];

  // ── MODULE LIST (admin only) ────────────────────────────────────────────────
  if (portalType === "admin" && derived?.enabled_modules?.length) {
    const LABELS: Record<string, string> = {
      expenses:        "Expenses",
      time_allocation: "Time",
      subcontractor:   "Subcontractors",
      reimbursements:  "Reimbursements",
      approvals:       "Approvals",
      accounting:      "Accounting",
      archive:         "Archive",
      ai_copilot:      "AI Copilot",
    };
    const names = derived.enabled_modules.map((k) => LABELS[k] ?? k).join(", ");
    tags.push(label(`Modules: ${names}`));
  }

  // ── APPROVAL FLOW ───────────────────────────────────────────────────────────
  if (portalType === "manager" || portalType === "admin") {
    if (derived?.manager_flow_enabled && derived?.accounting_flow_enabled) {
      tags.push(label("Manager + Accounting flow", "blue"));
    } else if (derived?.manager_flow_enabled) {
      tags.push(label("Manager flow", "blue"));
    } else if (derived?.accounting_flow_enabled) {
      tags.push(label("Accounting flow only", "blue"));
    }

    const mode = aps?.approval_mode as string | undefined;
    if (mode && mode !== "none") {
      const MODE_LABELS: Record<string, string> = {
        manager_only:            "Manager only",
        manager_then_accounting: "Manager → Accounting",
        accounting_only:         "Accounting only",
        threshold_based:         "Threshold-based routing",
        auto_approve:            "Auto-approve",
      };
      tags.push(label(MODE_LABELS[mode] ?? mode));
    }
  }

  // ── ACCOUNTING REVIEW (accounting / admin) ──────────────────────────────────
  if (portalType === "accounting" || portalType === "admin") {
    const reviewMode = as?.accounting_review_mode as string | undefined;
    if (reviewMode && reviewMode !== "none") {
      const REVIEW_LABELS: Record<string, string> = {
        all:       "Review: all expenses",
        threshold: "Review: above threshold",
      };
      tags.push(label(REVIEW_LABELS[reviewMode] ?? `Review: ${reviewMode}`, "indigo"));
    }
    if (as?.account_code_required === true)   tags.push(label("Account code required", "indigo"));
    if (as?.cost_center_required === true)    tags.push(label("Cost center required", "indigo"));
    if (as?.poliza_required === true)         tags.push(label("Póliza required", "indigo"));
    if (as?.require_final_accounting_review_before_export === true)
      tags.push(label("Final review before export", "indigo"));
  }

  // ── ALLOCATION (employee / admin) ───────────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const dims = derived?.allocation_dimensions ?? [];
    if (dims.length) {
      const DIM_LABELS: Record<string, string> = {
        project:     "Project",
        client:      "Client",
        cost:        "Cost Center",
        center:      "",   // fragment from underscore-split — omit
        cc:          "Cost Center",
      };
      const readable = dims
        .map((d) => DIM_LABELS[d] ?? d)
        .filter(Boolean);
      if (readable.length === 1) {
        tags.push(label(`Allocation: ${readable[0]} only`));
      } else if (readable.length > 1) {
        tags.push(label(`Allocation: ${readable.join(", ")}`));
      }
    }
    if (derived?.allow_split_allocations) tags.push(label("Split allocations"));
  }

  // ── SUBMISSION RULES (employee / admin) ────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const xmlMode = derived?.xml_required_mode;
    if (xmlMode === "always")        tags.push(label("XML required", "amber"));
    else if (xmlMode === "mxn_only") tags.push(label("XML for MXN", "amber"));

    if (derived?.pdf_pair_required_for_cfdi) tags.push(label("CFDI PDF required", "amber"));
    if (derived?.international_expenses_allowed)
      tags.push(label("International expenses"));
    if (derived?.tickets_allowed === false) tags.push(label("Tickets disabled", "red"));
  }

  // ── WORKFLOW (employee / admin) ─────────────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const wfMode = derived?.workflow_mode ?? ws?.default_expense_workflow_mode as string | undefined;
    if (wfMode && wfMode !== "standard") {
      const WF_LABELS: Record<string, string> = {
        manager_then_accounting: "Manager → Accounting",
        manager_only:            "Manager only",
        accounting_only:         "Accounting only",
        auto_approve:            "Auto-approve",
      };
      tags.push(label(`Workflow: ${WF_LABELS[wfMode] ?? wfMode}`));
    }
    if (ws?.block_submit_on_failed_validation === true) tags.push(label("Blocks on validation", "red"));
  }

  return tags;
}

// ── Accent classes ────────────────────────────────────────────────────────────

const ACCENT_CLS: Record<string, string> = {
  blue:   "border-sky-500/20 bg-sky-500/[0.06] text-sky-300/60",
  indigo: "border-indigo-500/20 bg-indigo-500/[0.06] text-indigo-300/60",
  amber:  "border-amber-500/20 bg-amber-500/[0.06] text-amber-300/60",
  red:    "border-red-500/20 bg-red-500/[0.06] text-red-300/60",
};

const DEFAULT_CLS = "border-white/[0.07] bg-white/[0.03] text-white/35";

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortalPolicySummary({ portalConfig, portalType }: Props) {
  if (!portalConfig) return null;

  const tags = buildTags(portalConfig, portalType);
  if (!tags.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {tags.map(({ text, accent }) => (
        <span
          key={text}
          className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${
            accent ? (ACCENT_CLS[accent] ?? DEFAULT_CLS) : DEFAULT_CLS
          }`}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
