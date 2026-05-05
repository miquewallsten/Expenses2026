"use client";

import type { ReactElement } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  AlertTriangle,
  Circle,
  Building2,
  FileText,
  Calculator,
  GitBranch,
  Puzzle,
  Sparkles,
  Lock,
} from "lucide-react";
import { getPortalConfigConflicts } from "@/lib/portal-config-conflicts";
import { StatusBadge } from "@/components/ui/StatusBadge";

type SetupSection =
  | "Company Setup"
  | "Rules"
  | "Accounting Setup"
  | "Workflow";

type CardStatus = "ok" | "warn" | "unconfigured";

const SECTION_CONFLICT_CODES: Record<SetupSection, string[]> = {
  "Company Setup": [
    "MANAGER_FLOW_NO_MANAGERS",
    "MANAGER_WORKFLOW_NO_MANAGERS",
    "REQUIRE_MANAGER_ALL_NO_MANAGERS",
    "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
    "MULTI_COUNTRY_INTL_DISABLED",
  ],
  "Rules": [
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
  "Workflow": [
    "MANAGER_FLOW_NO_MANAGERS",
    "REQUIRE_MANAGER_ALL_NO_MANAGERS",
    "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
    "ESCALATE_MISSING_DOCS_NO_MANAGERS",
    "MANAGER_WORKFLOW_NO_MANAGERS",
    "ROUTE_POLICY_FAILURES_NO_MANAGERS",
    "ROUTE_MISSING_DOCS_NO_MANAGERS",
    "INTL_ROUTING_INTL_DISABLED",
  ],
};

function cardStatus(
  data: any,
  savedMarker: unknown,
  conflictCodes: Set<string>,
  sectionCodes: string[]
): CardStatus {
  // A section is only "configured" once its signature field has been saved.
  // The GET endpoints hydrate defaults even before the admin saves, so
  // ``Object.keys(data).length`` alone is not a reliable signal.
  if (!data || savedMarker == null || savedMarker === "") return "unconfigured";
  if (sectionCodes.some((c) => conflictCodes.has(c))) return "warn";
  return "ok";
}

function CardStatusBadge({ status, labels }: { status: CardStatus; labels: { ok: string; warn: string; unconfigured: string } }): ReactElement {
  const label = labels[status];
  return <StatusBadge status={status} label={label} size="card" />;
}

function SetupCard({
  section,
  sectionLabel,
  icon,
  status,
  rows,
  summary,
  onEdit,
  editLabel,
  statusLabels,
  fullWidth = false,
}: {
  section: SetupSection;
  sectionLabel: string;
  icon: React.ReactNode;
  status: CardStatus;
  rows: [string, string][];
  summary: string;
  onEdit: (s: SetupSection) => void;
  editLabel: string;
  statusLabels: { ok: string; warn: string; unconfigured: string };
  fullWidth?: boolean;
}) {
  // Status-based styling for premium feel
  const statusStyles = {
    ok: {
      card: "border-emerald-500/20 hover:border-emerald-500/30",
      header: "bg-gradient-to-r from-emerald-500/[0.03] to-transparent",
      glow: "shadow-emerald-500/5",
    },
    warn: {
      card: "border-amber-500/25 hover:border-amber-500/35",
      header: "bg-gradient-to-r from-amber-500/[0.05] to-transparent",
      glow: "shadow-amber-500/10",
    },
    unconfigured: {
      card: "border-default hover:border-strong",
      header: "bg-surface-2",
      glow: "",
    },
  };

  const styles = statusStyles[status];

  return (
    <button
      type="button"
      onClick={() => onEdit(section)}
      className={`group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all duration-200 hover:shadow-lg ${
        styles.card
      } ${fullWidth ? "col-span-2" : ""}`}
    >
      {/* Subtle gradient overlay for depth */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-1/50 via-transparent to-transparent pointer-events-none" />

      {/* Header with gradient based on status */}
      <div className={`relative flex items-center justify-between border-b border-subtle px-4 py-2.5 ${styles.header}`}>
        <div className="flex items-center gap-2.5">
          <span className={`flex h-5 w-5 items-center justify-center rounded-md ${
            status === "ok" ? "bg-success/10 text-success" :
            status === "warn" ? "bg-warning/10 text-warning" :
            "bg-surface-2 text-muted"
          }`}>
            {icon}
          </span>
          <span className="text-[11px] font-semibold text-secondary">{sectionLabel}</span>
        </div>
        <CardStatusBadge status={status} labels={statusLabels} />
      </div>

      {/* Content rows */}
      <div className="relative flex-1">
        {rows.map(([k, v], idx) => (
          <div
            key={k}
            className={`flex items-center justify-between px-4 py-1.5 ${idx < rows.length - 1 ? "border-b border-subtle/50" : ""}`}
          >
            <span className="text-[10px] text-muted">{k}</span>
            <span
              className={`text-[10px] font-medium ${
                v === "—" ? "text-muted/50" : "text-tertiary"
              }`}
            >
              {v}
            </span>
          </div>
        ))}
      </div>

      {/* Summary footer with visual separator */}
      <div className="relative flex items-center justify-between border-t border-subtle px-4 py-2 bg-surface-0/30">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted leading-relaxed">{summary}</p>
        <span className="ml-3 flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted transition-colors group-hover:text-accent">
          {editLabel}
          <span className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all">→</span>
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
      | "Onboarding"
      | "Company Setup"
      | "Workflow"
      | "Accounting Setup"
      | "Rules"
      | "Add-Ons"
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
  const to = useTranslations("admin.overview");
  const conflicts = getPortalConfigConflicts(portalConfig ?? {});
  const issueCount = conflicts.length;
  const conflictCodes = new Set(conflicts.map((c) => c.code));

  const b = (v: any) => (v === true ? "Yes" : v === false ? "No" : "—");
  const s = (v: any) => (v != null ? String(v).replace(/_/g, " ") : "—");

  const cs = companySetup ?? {};
  const ep = expensePolicy ?? {};
  const ac = accountingSetup ?? {};
  const ap = approvalSetup ?? {};
  const wf = workflowSetup ?? {};

  // Saved-marker per section — the signature field that goes from null/"" to
  // a value the first time the admin hits Save.
  const companyMarker  = cs.display_name;
  const expenseMarker  = ep.xml_required_mode;
  const accountMarker  = ac.accounting_review_mode;
  const approvalMarker = ap.approval_mode;
  const workflowMarker = wf.default_expense_workflow_mode;

  const companyStatus  = cardStatus(cs, companyMarker,  conflictCodes, SECTION_CONFLICT_CODES["Company Setup"]);
  const expenseStatus  = cardStatus(ep, expenseMarker,  conflictCodes, SECTION_CONFLICT_CODES["Rules"]);
  const accountStatus  = cardStatus(ac, accountMarker,  conflictCodes, SECTION_CONFLICT_CODES["Accounting Setup"]);
  const approvalStatus = cardStatus(ap, approvalMarker, conflictCodes, SECTION_CONFLICT_CODES["Workflow"]);
  const workflowStatus = cardStatus(wf, workflowMarker, conflictCodes, SECTION_CONFLICT_CODES["Workflow"]);

  // Count sections with no saved marker — distinct from conflicts.
  const unconfiguredCount = [
    companyStatus, expenseStatus, accountStatus, approvalStatus, workflowStatus,
  ].filter((st) => st === "unconfigured").length;

  // First section with a conflict, for the "Fix setup" button
  const fixTarget: SetupSection | null = (() => {
    const order: SetupSection[] = [
      "Company Setup",
      "Workflow",
      "Rules",
      "Accounting Setup",
    ];
    return (
      order.find((sec) =>
        SECTION_CONFLICT_CODES[sec].some((c) => conflictCodes.has(c))
      ) ?? null
    );
  })();

  const statusLabels = { ok: to("statusConfigured"), warn: to("statusNeedsAttention"), unconfigured: to("statusNotConfigured") };

  const companySummary = cs.display_name
    ? [cs.display_name, cs.country_code, cs.industry].filter(Boolean).join(" · ")
    : to("noCompanyProfile");

  const expenseSummary = ep.xml_required_mode
    ? `XML ${s(ep.xml_required_mode)}. International: ${b(ep.international_expenses_allowed)}. Tickets: ${b(ep.tickets_allowed)}.`
    : to("noExpensePolicy");

  const accountSummary = ac.accounting_review_mode
    ? `Review: ${s(ac.accounting_review_mode)}. Póliza: ${b(ac.poliza_required)}. Cost center: ${b(ac.cost_center_required)}.`
    : to("noAccountingSetup");

  const approvalSummary = ap.approval_mode
    ? `Mode: ${s(ap.approval_mode)}. Require manager: ${b(ap.require_manager_for_all_employees)}.`
    : to("noApprovalSetup");

  const workflowSummary = wf.default_expense_workflow_mode
    ? `Mode: ${s(wf.default_expense_workflow_mode)}. Block on failure: ${b(wf.block_submit_on_failed_validation)}.`
    : to("noWorkflowSetup");

  const cards: {
    section: SetupSection;
    sectionLabel: string;
    icon: React.ReactNode;
    status: CardStatus;
    rows: [string, string][];
    summary: string;
  }[] = [
    {
      section: "Company Setup",
      sectionLabel: to("sectionCompanySetup"),
      icon: <Building2 className="h-3.5 w-3.5" />,
      status: companyStatus,
      rows: [
        [to("fieldName"),            s(cs.display_name)],
        [to("fieldIndustry"),        s(cs.industry)],
        [to("fieldCountry"),         s(cs.country_code)],
        [to("fieldHasManagers"),     b(cs.has_managers)],
        [to("fieldAccountingTeam"),  b(cs.has_accounting_team)],
      ],
      summary: companySummary,
    },
    {
      section: "Rules",
      sectionLabel: to("sectionExpensePolicy"),
      icon: <FileText className="h-3.5 w-3.5" />,
      status: expenseStatus,
      rows: [
        [to("fieldXmlRequired"),     s(ep.xml_required_mode)],
        [to("fieldInternational"),   b(ep.international_expenses_allowed)],
        [to("fieldTickets"),         b(ep.tickets_allowed)],
        [to("fieldManagerApproval"), b(ep.manager_approval_required)],
        [to("fieldAllocation"),      s(ep.allocation_dimensions)],
      ],
      summary: expenseSummary,
    },
    {
      section: "Accounting Setup",
      sectionLabel: to("sectionAccountingSetup"),
      icon: <Calculator className="h-3.5 w-3.5" />,
      status: accountStatus,
      rows: [
        [to("fieldReviewMode"),      s(ac.accounting_review_mode)],
        [to("fieldPolizaRequired"),  b(ac.poliza_required)],
        [to("fieldAccountCode"),     b(ac.account_code_required)],
        [to("fieldCostCenter"),      b(ac.cost_center_required)],
        [to("fieldProjectRequired"), b(ac.project_required)],
      ],
      summary: accountSummary,
    },
    {
      section: "Workflow",
      sectionLabel: to("sectionWorkflow"),
      icon: <GitBranch className="h-3.5 w-3.5" />,
      status: approvalStatus === "warn" || workflowStatus === "warn" ? "warn" : (approvalStatus === "unconfigured" || workflowStatus === "unconfigured" ? "unconfigured" : "ok"),
      rows: [
        [to("fieldApprovalMode"),         s(ap.approval_mode)],
        [to("fieldRequireManager"),       b(ap.require_manager_for_all_employees)],
        [to("fieldEscalateIntl"),         b(ap.escalate_international_to_accounting)],
        [to("fieldEscalatePolicyFails"),  b(ap.escalate_policy_failures_to_accounting)],
        [to("fieldMode"),                 s(wf.default_expense_workflow_mode)],
      ],
      summary: approvalSummary,
    },
  ];

  return (
    <div className="max-w-3xl space-y-5">
      {/* System health bar — Premium command center feel */}
      <div
        className={`relative overflow-hidden rounded-lg border px-4 py-3 ${
          issueCount > 0
            ? "border-amber-500/25 bg-gradient-to-r from-amber-500/[0.03] via-surface-1 to-transparent"
            : unconfiguredCount > 0
            ? "border-default bg-surface-1"
            : "border-emerald-500/20 bg-gradient-to-r from-emerald-500/[0.02] via-surface-1 to-transparent"
        }`}
      >
        {/* Subtle animated gradient for issues */}
        {issueCount > 0 && (
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.02] via-transparent to-amber-500/[0.02] animate-pulse" style={{ animationDuration: "4s" }} />
        )}
        {/* Success glow */}
        {issueCount === 0 && unconfiguredCount === 0 && (
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-transparent" />
        )}

        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            {issueCount > 0 ? (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-warning/80">
                    {to("issueCount", { count: issueCount })}
                  </span>
                  <span className="text-[9px] text-muted">Configuration needs attention</span>
                </div>
              </>
            ) : unconfiguredCount > 0 ? (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-2">
                  <Circle className="h-4 w-4 text-muted" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-secondary">
                    {to("unconfiguredCount", { count: unconfiguredCount })}
                  </span>
                  <span className="text-[9px] text-muted">Sections pending setup</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-success/80">{to("allConfigured")}</span>
                  <span className="text-[9px] text-muted">All systems operational</span>
                </div>
              </>
            )}
          </div>
          {issueCount > 0 && fixTarget && (
            <button
              type="button"
              onClick={() => onNavigate(fixTarget)}
              className="flex items-center gap-1.5 rounded-lg border border-warning/20 bg-warning/5 px-3 py-1.5 text-[10px] font-semibold text-warning/80 transition-all hover:border-warning/30 hover:bg-warning/10"
            >
              {to("fixSetup")}
              <span>→</span>
            </button>
          )}
          {issueCount === 0 && unconfiguredCount > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("Onboarding")}
              className="flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:border-accent/30 hover:bg-accent/10"
            >
              {to("startSetup")}
              <span>→</span>
            </button>
          )}
        </div>
      </div>

      {/* Setup cards — 2-column grid; last card spans full width when count is odd */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(({ section, sectionLabel, icon, status, rows, summary }, idx) => (
          <SetupCard
            key={section}
            section={section}
            sectionLabel={sectionLabel}
            icon={icon}
            status={status}
            rows={rows}
            summary={summary}
            onEdit={onNavigate}
            editLabel={to("edit")}
            statusLabels={statusLabels}
            fullWidth={cards.length % 2 !== 0 && idx === cards.length - 1}
          />
        ))}
      </div>

      {/* Add-ons summary */}
      <AddOnsTile companySetup={cs} onOpen={() => onNavigate("Add-Ons")} />
    </div>
  );
}

// ── Add-ons tile ──────────────────────────────────────────────────────────────

type AddOnStatus = "installed" | "available" | "premium";

interface AddOnEntry {
  key: string;
  flag: string;
  i18nKey: string;
  premium: boolean;
}

const ADDONS: AddOnEntry[] = [
  { key: "archive",            flag: "archive_module_enabled",               i18nKey: "archive",           premium: false },
  { key: "time_allocation",    flag: "time_allocation_module_enabled",       i18nKey: "timeAllocation",    premium: false },
  { key: "purchase_requests",  flag: "purchase_requests_module_enabled",     i18nKey: "purchaseRequests",  premium: false },
  { key: "amex_reconciliation", flag: "amex_reconciliation_module_enabled",  i18nKey: "amexReconciliation", premium: false },
  { key: "subcontractor",      flag: "subcontractor_module_enabled",         i18nKey: "subcontractor",     premium: true  },
];

function AddOnsTile({
  companySetup,
  onOpen,
}: {
  companySetup: Record<string, any>;
  onOpen: () => void;
}) {
  const tt = useTranslations("admin.overview.addOnsTile");
  const tm = useTranslations("admin.modules.addons");
  const installedCount = ADDONS.filter((a) => !!companySetup?.[a.flag]).length;
  const premiumCount   = ADDONS.filter((a) => a.premium).length;

  return (
    <div className="relative overflow-hidden rounded-lg border border-default">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-surface-1 via-transparent to-ai/[0.02] pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between border-b border-subtle bg-surface-2/50 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-ai/10">
            <Puzzle className="h-3.5 w-3.5 text-ai" />
          </div>
          <span className="text-[11px] font-semibold text-primary">{tt("title")}</span>
          <span className="rounded-full border border-ai/20 bg-ai/5 px-2 py-0.5 font-mono text-[9px] text-ai">
            {installedCount}/{ADDONS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 text-[10px] font-medium text-muted transition-colors hover:text-accent"
        >
          {tt("manage")}
          <span className="opacity-0 group-hover:opacity-100 transition-opacity">→</span>
        </button>
      </div>

      {/* Module list */}
      <ul className="relative">
        {ADDONS.map((a, idx) => {
          const installed = !!companySetup?.[a.flag];
          const status: AddOnStatus = installed ? "installed" : a.premium ? "premium" : "available";
          return (
            <li
              key={a.key}
              className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                idx < ADDONS.length - 1 ? "border-b border-subtle/50" : ""
              } ${installed ? "bg-success/[0.01]" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-medium text-secondary">{tm(`${a.i18nKey}Name`)}</span>
                  {a.premium && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-warning/60">
                      <Sparkles className="h-2 w-2" />
                      Premium
                    </span>
                  )}
                </div>
                <p className="truncate text-[9px] text-muted mt-0.5">{tm(`${a.i18nKey}Desc`)}</p>
              </div>
              <AddOnStatusPill status={status} />
            </li>
          );
        })}
      </ul>

      {/* Premium footer notice */}
      {premiumCount > 0 && (
        <div className="relative flex items-center gap-2 border-t border-subtle bg-gradient-to-r from-amber-500/[0.02] to-transparent px-4 py-2">
          <Lock className="h-3.5 w-3.5 text-warning/40" />
          <p className="text-[9px] text-muted">
            {tt.rich("premiumNotice", {
              accent: (chunks) => <span className="text-warning/60 font-medium">{chunks}</span>,
            })}
          </p>
        </div>
      )}
    </div>
  );
}

function AddOnStatusPill({ status }: { status: AddOnStatus }) {
  const tt = useTranslations("admin.overview.addOnsTile");
  if (status === "installed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-success/80">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {tt("installed")}
      </span>
    );
  }
  if (status === "premium") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-warning/15 bg-warning/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-warning/60">
        <Lock className="h-2.5 w-2.5" />
        {tt("premium")}
      </span>
    );
  }
  return (
    <span className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted">
      {tt("available")}
    </span>
  );
}
