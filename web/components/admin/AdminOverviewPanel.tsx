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
  | "Policies"
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
  "Policies": [
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
  return (
    <button
      type="button"
      onClick={() => onEdit(section)}
      className={`flex flex-col overflow-hidden rounded-lg border text-left transition-all hover:border-white/[0.20] hover:bg-white/[0.02] hover:shadow-lg ${
        status === "warn" ? "border-amber-500/20" : "border-white/[0.08]"
      } ${fullWidth ? "col-span-2" : ""}`}
    >
      <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-white/30">{icon}</span>
          <span className="text-[11px] font-semibold text-white/70">{sectionLabel}</span>
        </div>
        <CardStatusBadge status={status} labels={statusLabels} />
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
          {editLabel}
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
      | "Workflow"
      | "Accounting Setup"
      | "Policies"
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
  const expenseStatus  = cardStatus(ep, expenseMarker,  conflictCodes, SECTION_CONFLICT_CODES["Policies"]);
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
      "Policies",
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
      section: "Policies",
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
      sectionLabel: to("sectionApprovalSetup"),
      icon: <GitBranch className="h-3.5 w-3.5" />,
      status: approvalStatus,
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
                {to("issueCount", { count: issueCount })}
              </span>
            </>
          ) : unconfiguredCount > 0 ? (
            <>
              <Circle className="h-3.5 w-3.5 text-white/20" />
              <span className="text-[11px] font-medium text-white/40">
                {to("unconfiguredCount", { count: unconfiguredCount })}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/55" />
              <span className="text-[11px] font-medium text-white/50">{to("allConfigured")}</span>
            </>
          )}
        </div>
        {issueCount > 0 && fixTarget && (
          <button
            type="button"
            onClick={() => onNavigate(fixTarget)}
            className="text-[10px] font-semibold text-amber-400/55 transition-colors hover:text-amber-300/80"
          >
            {to("fixSetup")}
          </button>
        )}
        {issueCount === 0 && unconfiguredCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate("Company Setup")}
            className="text-[10px] font-semibold text-white/25 transition-colors hover:text-white/50"
          >
            {to("startSetup")}
          </button>
        )}
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
  label: string;
  desc: string;
  premium: boolean;
}

const ADDONS: AddOnEntry[] = [
  { key: "archive",            flag: "archive_module_enabled",               label: "Archivo",               desc: "Almacenamiento y exportación de comprobantes.",  premium: false },
  { key: "time_allocation",    flag: "time_allocation_module_enabled",       label: "Distribución de tiempo", desc: "Seguimiento y distribución de tiempo.",          premium: false },
  { key: "purchase_requests",  flag: "purchase_requests_module_enabled",     label: "Solicitudes de compra", desc: "Órdenes y solicitudes previas al gasto.",        premium: false },
  { key: "amex_reconciliation", flag: "amex_reconciliation_module_enabled",  label: "Conciliación Amex",     desc: "Conciliación de estados de cuenta American Express con CFDIs.", premium: false },
  { key: "subcontractor",      flag: "subcontractor_module_enabled",         label: "Subcontratistas",       desc: "Gestión de gastos y facturas de subcontratistas.", premium: true  },
];

function AddOnsTile({
  companySetup,
  onOpen,
}: {
  companySetup: Record<string, any>;
  onOpen: () => void;
}) {
  const installedCount = ADDONS.filter((a) => !!companySetup?.[a.flag]).length;
  const premiumCount   = ADDONS.filter((a) => a.premium).length;

  return (
    <div className="mt-5 overflow-hidden rounded-lg border border-white/[0.08]">
      <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/20 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Puzzle className="h-3.5 w-3.5 text-white/30" />
          <span className="text-[11px] font-semibold text-white/70">Add-ons</span>
          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9.5px] text-white/35">
            {installedCount}/{ADDONS.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="text-[10px] font-medium text-white/30 transition-colors hover:text-white/60"
        >
          Administrar →
        </button>
      </div>
      <ul>
        {ADDONS.map((a) => {
          const installed = !!companySetup?.[a.flag];
          const status: AddOnStatus = installed ? "installed" : a.premium ? "premium" : "available";
          return (
            <li key={a.key} className="flex items-center justify-between gap-3 border-b border-white/[0.03] px-4 py-2 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium text-white/65">{a.label}</span>
                  {a.premium && (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/[0.07] px-1 py-px text-[8.5px] font-bold uppercase tracking-widest text-amber-300/70">
                      <Sparkles className="h-2.5 w-2.5" />
                      Premium
                    </span>
                  )}
                </div>
                <p className="truncate text-[9.5px] text-white/28">{a.desc}</p>
              </div>
              <AddOnStatusPill status={status} />
            </li>
          );
        })}
      </ul>
      {premiumCount > 0 && (
        <div className="flex items-center gap-2 border-t border-white/[0.04] bg-amber-500/[0.02] px-4 py-1.5">
          <Lock className="h-3 w-3 text-amber-400/50" />
          <p className="text-[9.5px] text-amber-200/45">
            Los add-ons <span className="text-amber-200/70">Premium</span> requieren contratación adicional antes de activarse.
          </p>
        </div>
      )}
    </div>
  );
}

function AddOnStatusPill({ status }: { status: AddOnStatus }) {
  if (status === "installed") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400/80">
        <CheckCircle2 className="h-2.5 w-2.5" />
        Activo
      </span>
    );
  }
  if (status === "premium") {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-amber-500/25 bg-amber-500/[0.06] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300/70">
        <Lock className="h-2.5 w-2.5" />
        Contratar
      </span>
    );
  }
  return (
    <span className="rounded border border-white/[0.08] bg-white/[0.02] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/30">
      Disponible
    </span>
  );
}
