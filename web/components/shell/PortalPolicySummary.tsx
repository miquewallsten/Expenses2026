"use client";

import { useTranslations } from "next-intl";

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

type Tpp = (key: string, params?: Record<string, string>) => string;

function buildTags(portalConfig: Props["portalConfig"], portalType: PortalType, tpp: Tpp): Tag[] {
  const derived: DerivedConfig | undefined = portalConfig?.derived;
  const as  = portalConfig?.accounting_setup as Record<string, unknown> | undefined;
  const aps = portalConfig?.approval_setup   as Record<string, unknown> | undefined;
  const ws  = portalConfig?.workflow_setup   as Record<string, unknown> | undefined;

  const tags: Tag[] = [];

  // ── MODULE LIST (admin only) ────────────────────────────────────────────────
  if (portalType === "admin" && derived?.enabled_modules?.length) {
    const MODULE_KEYS: Record<string, string> = {
      expenses: "moduleExpenses", time_allocation: "moduleTime",
      subcontractor: "moduleSubcontractors", reimbursements: "moduleReimbursements",
      approvals: "moduleApprovals", accounting: "moduleAccounting",
      archive: "moduleArchive", ai_copilot: "moduleAiCopilot",
    };
    const names = derived.enabled_modules.map((k) => tpp(MODULE_KEYS[k] ?? k)).join(", ");
    tags.push(label(tpp("modules", { names })));
  }

  // ── APPROVAL FLOW ───────────────────────────────────────────────────────────
  if (portalType === "manager" || portalType === "admin") {
    if (derived?.manager_flow_enabled && derived?.accounting_flow_enabled) {
      tags.push(label(tpp("managerAccounting"), "blue"));
    } else if (derived?.manager_flow_enabled) {
      tags.push(label(tpp("managerFlow"), "blue"));
    } else if (derived?.accounting_flow_enabled) {
      tags.push(label(tpp("accountingFlow"), "blue"));
    }

    const mode = aps?.approval_mode as string | undefined;
    if (mode && mode !== "none") {
      const MODE_KEYS: Record<string, string> = {
        manager_only: "modeManagerOnly", manager_then_accounting: "modeManagerThenAccounting",
        accounting_only: "modeAccountingOnly", threshold_based: "modeThresholdBased",
        auto_approve: "modeAutoApprove",
      };
      tags.push(label(tpp(MODE_KEYS[mode] ?? mode)));
    }
  }

  // ── ACCOUNTING REVIEW (accounting / admin) ──────────────────────────────────
  if (portalType === "accounting" || portalType === "admin") {
    const reviewMode = as?.accounting_review_mode as string | undefined;
    if (reviewMode && reviewMode !== "none") {
      const REVIEW_KEYS: Record<string, string> = { all: "reviewAll", threshold: "reviewThreshold" };
      tags.push(label(tpp(REVIEW_KEYS[reviewMode] ?? `reviewAll`), "indigo"));
    }
    if (as?.account_code_required === true)   tags.push(label(tpp("accountCodeRequired"), "indigo"));
    if (as?.cost_center_required === true)    tags.push(label(tpp("costCenterRequired"), "indigo"));
    if (as?.poliza_required === true)         tags.push(label(tpp("polizaRequired"), "indigo"));
    if (as?.require_final_accounting_review_before_export === true)
      tags.push(label(tpp("finalReviewRequired"), "indigo"));
  }

  // ── ALLOCATION (employee / admin) ───────────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const dims = derived?.allocation_dimensions ?? [];
    if (dims.length) {
      const DIM_KEYS: Record<string, string> = { project: "dimProject", client: "dimClient", cost: "dimCostCenter", cc: "dimCostCenter", center: "" };
      const readable = dims.map((d) => tpp(DIM_KEYS[d] ?? d)).filter(Boolean);
      if (readable.length === 1) {
        tags.push(label(tpp("allocationSingle", { dim: readable[0] })));
      } else if (readable.length > 1) {
        tags.push(label(tpp("allocationMultiple", { dims: readable.join(", ") })));
      }
    }
    if (derived?.allow_split_allocations) tags.push(label(tpp("splitAllocations")));
  }

  // ── SUBMISSION RULES (employee / admin) ────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const xmlMode = derived?.xml_required_mode;
    if (xmlMode === "always")        tags.push(label(tpp("xmlRequired"), "amber"));
    else if (xmlMode === "mxn_only") tags.push(label(tpp("xmlForMxn"), "amber"));

    if (derived?.pdf_pair_required_for_cfdi) tags.push(label(tpp("cfdiPdfRequired"), "amber"));
    if (derived?.international_expenses_allowed) tags.push(label(tpp("internationalExpenses")));
    if (derived?.tickets_allowed === false) tags.push(label(tpp("ticketsDisabled"), "red"));
  }

  // ── WORKFLOW (employee / admin) ─────────────────────────────────────────────
  if (portalType === "employee" || portalType === "admin") {
    const wfMode = derived?.workflow_mode ?? ws?.default_expense_workflow_mode as string | undefined;
    if (wfMode && wfMode !== "standard") {
      const WF_KEYS: Record<string, string> = {
        manager_then_accounting: "workflowManagerThenAccounting", manager_only: "workflowManagerOnly",
        accounting_only: "workflowAccountingOnly", auto_approve: "workflowAutoApprove",
      };
      if (WF_KEYS[wfMode]) tags.push(label(tpp(WF_KEYS[wfMode])));
    }
    if (ws?.block_submit_on_failed_validation === true) tags.push(label(tpp("blockOnValidation"), "red"));
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
  const tpp = useTranslations("archive.portalPolicy") as Tpp;
  if (!portalConfig) return null;

  const tags = buildTags(portalConfig, portalType, tpp);
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
