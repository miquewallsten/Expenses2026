"use client";

import {
  CheckCircle2,
  AlertTriangle,
  Circle,
  Building2,
  FileText,
  Calculator,
  ClipboardCheck,
  GitBranch,
} from "lucide-react";
import { getPortalConfigConflicts } from "@/lib/portal-config-conflicts";

type SetupSection =
  | "Company Setup"
  | "Expense Policy"
  | "Accounting Setup"
  | "Approval Setup"
  | "Workflow Setup";

type CardStatus = "ok" | "warn" | "unconfigured";

const SECTION_CONFLICT_CODES: Record<SetupSection, string[]> = {
  "Company Setup": [
    "MANAGER_FLOW_NO_MANAGERS",
    "MANAGER_WORKFLOW_NO_MANAGERS",
    "REQUIRE_MANAGER_ALL_NO_MANAGERS",
    "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
    "MULTI_COUNTRY_INTL_DISABLED",
  ],
  "Expense Policy": [
    "INTL_ESCALATION_INTL_DISABLED",
    "INTL_ROUTING_INTL_DISABLED",
    "PROJECT_REQUIRED_NOT_IN_DIMS",
    "CLIENT_REQUIRED_NOT_IN_DIMS",
  ],
  "Accounting Setup": [
    "PROJECT_REQUIRED_NOT_IN_DIMS",
    "CLIENT_REQUIRED_NOT_IN_DIMS",
    "COST_CENTER_REQUIRED_NOT_IN_DIMS",
  ],
  "Approval Setup": [
    "MANAGER_FLOW_NO_MANAGERS",
    "REQUIRE_MANAGER_ALL_NO_MANAGERS",
    "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
    "ESCALATE_MISSING_DOCS_NO_MANAGERS",
  ],
  "Workflow Setup": [
    "MANAGER_WORKFLOW_NO_MANAGERS",
    "ROUTE_POLICY_FAILURES_NO_MANAGERS",
    "ROUTE_MISSING_DOCS_NO_MANAGERS",
    "INTL_ROUTING_INTL_DISABLED",
  ],
};

function cardStatus(
  data: any,
  conflictCodes: Set<string>,
  sectionCodes: string[]
): CardStatus {
  if (!data || Object.keys(data).length === 0) return "unconfigured";
  if (sectionCodes.some((c) => conflictCodes.has(c))) return "warn";
  return "ok";
}

function StatusBadge({ status }: { status: CardStatus }) {
  if (status === "ok")
    return (
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400/60">
        <CheckCircle2 className="h-2.5 w-2.5" /> Configured
      </span>
    );
  if (status === "warn")
    return (
      <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-amber-400/60">
        <AlertTriangle className="h-2.5 w-2.5" /> Needs attention
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-white/20">
      <Circle className="h-2.5 w-2.5" /> Not configured
    </span>
  );
}

function SetupCard({
  section,
  icon,
  status,
  rows,
  summary,
  onEdit,
  fullWidth = false,
}: {
  section: SetupSection;
  icon: React.ReactNode;
  status: CardStatus;
  rows: [string, string][];
  summary: string;
  onEdit: (s: SetupSection) => void;
  fullWidth?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onEdit(section)}
      className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors hover:border-white/[0.18] hover:bg-white/[0.015] ${
        status === "warn" ? "border-amber-500/20" : "border-white/[0.07]"
      } ${fullWidth ? "col-span-2" : ""}`}
    >
      <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-white/30">{icon}</span>
          <span className="text-[11px] font-semibold text-white/70">{section}</span>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="flex-1">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between border-b border-white/[0.03] px-4 py-1.5 last:border-0"
          >
            <span className="text-[10px] text-white/30">{k}</span>
            <span
              className={`text-[10px] font-medium ${
                v === "—" ? "text-white/20" : "text-white/55"
              }`}
            >
              {v}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-white/[0.04] px-4 py-2">
        <p className="min-w-0 flex-1 truncate text-[10px] text-white/22">{summary}</p>
        <span className="ml-3 shrink-0 text-[10px] font-medium text-white/30">
          Edit →
        </span>
      </div>
    </button>
  );
}

interface Props {
  portalConfig: any;
  companySetup: any;
  expensePolicy: any;
  accountingSetup: any;
  approvalSetup: any;
  workflowSetup: any;
  onNavigate: (
    section:
      | "Company Setup"
      | "Expense Policy"
      | "Accounting Setup"
      | "Approval Setup"
      | "Workflow Setup"
  ) => void;
}

export default function AdminOverviewPanel({
  portalConfig,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  workflowSetup,
  onNavigate,
}: Props) {
  const conflicts = getPortalConfigConflicts(portalConfig ?? {});
  const issueCount = conflicts.length;
  const conflictCodes = new Set(conflicts.map((c) => c.code));
  // Count sections with no data at all — distinct from conflicts.
  const unconfiguredCount = [companySetup, expensePolicy, accountingSetup, approvalSetup, workflowSetup].filter(
    (d) => !d || Object.keys(d).length === 0
  ).length;

  const b = (v: any) => (v === true ? "Yes" : v === false ? "No" : "—");
  const s = (v: any) => (v != null ? String(v).replace(/_/g, " ") : "—");

  const cs = companySetup ?? {};
  const ep = expensePolicy ?? {};
  const ac = accountingSetup ?? {};
  const ap = approvalSetup ?? {};
  const wf = workflowSetup ?? {};

  const companyStatus  = cardStatus(cs, conflictCodes, SECTION_CONFLICT_CODES["Company Setup"]);
  const expenseStatus  = cardStatus(ep, conflictCodes, SECTION_CONFLICT_CODES["Expense Policy"]);
  const accountStatus  = cardStatus(ac, conflictCodes, SECTION_CONFLICT_CODES["Accounting Setup"]);
  const approvalStatus = cardStatus(ap, conflictCodes, SECTION_CONFLICT_CODES["Approval Setup"]);
  const workflowStatus = cardStatus(wf, conflictCodes, SECTION_CONFLICT_CODES["Workflow Setup"]);

  // First section with a conflict, for the "Fix setup" button
  const fixTarget: SetupSection | null = (() => {
    const order: SetupSection[] = [
      "Company Setup",
      "Approval Setup",
      "Workflow Setup",
      "Expense Policy",
      "Accounting Setup",
    ];
    return (
      order.find((sec) =>
        SECTION_CONFLICT_CODES[sec].some((c) => conflictCodes.has(c))
      ) ?? null
    );
  })();

  const companySummary = cs.display_name
    ? [cs.display_name, cs.country_code, cs.industry].filter(Boolean).join(" · ")
    : "No company profile saved.";

  const expenseSummary = ep.xml_required_mode
    ? `XML ${s(ep.xml_required_mode)}. International: ${b(ep.international_expenses_allowed)}. Tickets: ${b(ep.tickets_allowed)}.`
    : "No expense policy saved.";

  const accountSummary = ac.accounting_review_mode
    ? `Review: ${s(ac.accounting_review_mode)}. Póliza: ${b(ac.poliza_required)}. Cost center: ${b(ac.cost_center_required)}.`
    : "No accounting setup saved.";

  const approvalSummary = ap.approval_mode
    ? `Mode: ${s(ap.approval_mode)}. Require manager: ${b(ap.require_manager_for_all_employees)}.`
    : "No approval setup saved.";

  const workflowSummary = wf.default_expense_workflow_mode
    ? `Mode: ${s(wf.default_expense_workflow_mode)}. Block on failure: ${b(wf.block_submit_on_failed_validation)}.`
    : "No workflow setup saved.";

  const cards: {
    section: SetupSection;
    icon: React.ReactNode;
    status: CardStatus;
    rows: [string, string][];
    summary: string;
  }[] = [
    {
      section: "Company Setup",
      icon: <Building2 className="h-3.5 w-3.5" />,
      status: companyStatus,
      rows: [
        ["Name",            s(cs.display_name)],
        ["Industry",        s(cs.industry)],
        ["Country",         s(cs.country_code)],
        ["Has managers",    b(cs.has_managers)],
        ["Accounting team", b(cs.has_accounting_team)],
      ],
      summary: companySummary,
    },
    {
      section: "Expense Policy",
      icon: <FileText className="h-3.5 w-3.5" />,
      status: expenseStatus,
      rows: [
        ["XML required",      s(ep.xml_required_mode)],
        ["International",     b(ep.international_expenses_allowed)],
        ["Tickets",           b(ep.tickets_allowed)],
        ["Manager approval",  b(ep.manager_approval_required)],
        ["Allocation",        s(ep.allocation_dimensions)],
      ],
      summary: expenseSummary,
    },
    {
      section: "Accounting Setup",
      icon: <Calculator className="h-3.5 w-3.5" />,
      status: accountStatus,
      rows: [
        ["Review mode",      s(ac.accounting_review_mode)],
        ["Póliza required",  b(ac.poliza_required)],
        ["Account code",     b(ac.account_code_required)],
        ["Cost center",      b(ac.cost_center_required)],
        ["Project required", b(ac.project_required)],
      ],
      summary: accountSummary,
    },
    {
      section: "Approval Setup",
      icon: <ClipboardCheck className="h-3.5 w-3.5" />,
      status: approvalStatus,
      rows: [
        ["Approval mode",         s(ap.approval_mode)],
        ["Require manager",       b(ap.require_manager_for_all_employees)],
        ["Escalate international",b(ap.escalate_international_to_accounting)],
        ["Escalate policy fails", b(ap.escalate_policy_failures_to_accounting)],
        ["Allow resubmission",    b(ap.allow_resubmission_after_rejection)],
      ],
      summary: approvalSummary,
    },
    {
      section: "Workflow Setup",
      icon: <GitBranch className="h-3.5 w-3.5" />,
      status: workflowStatus,
      rows: [
        ["Mode",              s(wf.default_expense_workflow_mode)],
        ["Block on failure",  b(wf.block_submit_on_failed_validation)],
        ["Route policy to",   s(wf.route_policy_failures_to)],
        ["Route intl to",     s(wf.route_international_expenses_to)],
        ["Allow draft save",  b(wf.allow_draft_save)],
      ],
      summary: workflowSummary,
    },
  ];

  return (
    <div className="max-w-3xl">
      {/* System health bar — 3 states: unconfigured / conflicts / all-ok */}
      <div
        className={`mb-5 flex items-center justify-between rounded border px-4 py-2.5 ${
          issueCount > 0
            ? "border-amber-500/[0.12] bg-amber-500/[0.03]"
            : unconfiguredCount > 0
            ? "border-white/[0.07] bg-white/[0.02]"
            : "border-emerald-500/[0.10] bg-emerald-500/[0.02]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          {issueCount > 0 ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400/55" />
              <span className="text-[11px] font-medium text-amber-200/55">
                {issueCount} issue{issueCount !== 1 ? "s" : ""} need attention
              </span>
            </>
          ) : unconfiguredCount > 0 ? (
            <>
              <Circle className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[11px] font-medium text-white/40">
                {unconfiguredCount} section{unconfiguredCount !== 1 ? "s" : ""} not yet configured
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/55" />
              <span className="text-[11px] font-medium text-white/50">All systems configured</span>
            </>
          )}
        </div>
        {issueCount > 0 && fixTarget && (
          <button
            type="button"
            onClick={() => onNavigate(fixTarget)}
            className="text-[10px] font-semibold text-amber-400/55 transition-colors hover:text-amber-300/80"
          >
            Fix setup →
          </button>
        )}
        {issueCount === 0 && unconfiguredCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate("Company Setup")}
            className="text-[10px] font-semibold text-white/25 transition-colors hover:text-white/50"
          >
            Start setup →
          </button>
        )}
      </div>

      {/* Setup cards — 2-column grid; last card spans full width when count is odd */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ section, icon, status, rows, summary }, idx) => (
          <SetupCard
            key={section}
            section={section}
            icon={icon}
            status={status}
            rows={rows}
            summary={summary}
            onEdit={onNavigate}
            fullWidth={cards.length % 2 !== 0 && idx === cards.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
