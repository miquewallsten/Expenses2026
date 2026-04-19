"use client";

import { useCallback, useEffect, useState } from "react";
import AICopilotRail from "@/components/shell/AICopilotRail";
import AppShell from "@/components/shell/AppShell";
import { getCurrentRole, getCurrentUserId, getCurrentCompanyId } from "@/lib/session";
import { buildGlobalNav, GlobalNavItem } from "@/lib/navigation";
import {
  AlertTriangle, ShieldAlert,
  CheckCircle2, Clock, Lock, ReceiptText, Loader2, PackageCheck,
} from "lucide-react";
import ReviewActionBar from "@/components/review/ReviewActionBar";
import PortalPolicySummary from "@/components/shell/PortalPolicySummary";
import ExpenseArchivePanel from "@/components/archive/ExpenseArchivePanel";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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

interface PortalConfig {
  company_setup: Record<string, unknown>;
  expense_policy: Record<string, unknown>;
  accounting_setup: Record<string, unknown>;
  approval_setup: Record<string, unknown>;
  workflow_setup: Record<string, unknown>;
  derived: DerivedConfig;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  category_code: string | null;
  report_id: number | null;
  created_at: string;
  accounting_explanation?: {
    category_reason: string;
    account_reason: string;
    confidence: "high" | "medium" | "low";
    source: "learning" | "keyword" | "manual" | "default";
  } | null;
}

interface QueueSummary {
  total_count: number;
  total_amount: number;
  statuses: Record<string, number>;
  flagged_count: number;
}

interface AccountingActions {
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  can_assign_account_code: boolean;
  can_generate_accounting_event: boolean;
  reasons: string[];
}

interface AccountingEventResult {
  header: { expense_id: number; company_id: number; amount: number; currency: string };
  lines: Array<{ type: string; account: string; amount: number; project_id?: number | null }>;
  metadata: { settlement_type: string; category_code: string | null; tax_behavior: string | null };
}

interface BlockersResult {
  expense_id: number;
  submit_blockers: string[];
  accounting_blockers: string[];
  poliza_blockers: string[];
  warnings: string[];
}

interface TriageInfo {
  document_id: number;
  document_kind: string;
  expense_lane: string;
  confidence: "high" | "medium" | "low";
  recommended_action: string;
  reasons: string[];
  match_candidate?: {
    xml_document_id: number;
    pdf_document_id: number;
    // document_matching_service shape
    score?: number;
    match_level?: "strong" | "possible";
    // cfdi_pairing_service shape
    confidence?: "high" | "low";
    match_reason?: string;
  } | null;
}

interface ExpenseDocument {
  id: number;
  document_type: string;
  filename: string;
  validation_summary: string | null;
}

interface AllocationSummaryResult {
  expense_id: number;
  items: Array<{
    id: number;
    project_id: number | null;
    client_id: number | null;
    cost_center_id: number | null;
    percent: number;
  }>;
  presence: {
    has_any: boolean;
    has_project: boolean;
    has_client: boolean;
    has_cost_center: boolean;
    allocation_count: number;
  };
}

interface OrgUnit { id: number; name: string; code: string; }

interface AllocationRow {
  project_id: number | null;
  client_id: number | null;
  cost_center_id: number | null;
  percent: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  draft:            "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  submitted:        "bg-sky-500/15 text-sky-300 border-sky-500/30",
  manager_approved: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  approved:         "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:         "bg-red-500/15 text-red-300 border-red-500/30",
};
function statusCls(s: string) {
  return STATUS_CLS[s] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="text-center">{children}</div>
    </div>
  );
}

// ── QueueSummaryBar ───────────────────────────────────────────────────────────

function QueueSummaryBar({ summary }: { summary: QueueSummary | null }) {
  if (!summary || summary.total_count === 0) return null;
  const entries = Object.entries(summary.statuses);
  return (
    <div className="shrink-0 border-b border-white/[0.05] bg-black/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[9px] font-semibold tabular-nums text-white/35">
          {summary.total_count} item{summary.total_count !== 1 ? "s" : ""}
        </span>
        <span className="font-mono text-[9px] text-white/28">${summary.total_amount.toFixed(2)}</span>
        {entries.map(([s, n]) => (
          <span key={s} className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${statusCls(s)}`}>
            {n} {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── WorkList ──────────────────────────────────────────────────────────────────

function WorkList({
  expenses,
  selectedId,
  onSelect,
  loading,
  portalConfig,
  summary,
}: {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
  loading: boolean;
  portalConfig: PortalConfig | null;
  summary: QueueSummary | null;
}) {
  const as = portalConfig?.accounting_setup as Record<string, unknown> | undefined;
  const reviewMode = typeof as?.accounting_review_mode === "string" ? as.accounting_review_mode : null;
  const guidanceLine =
    reviewMode === "all"
      ? "Accounting reviews all routed expenses."
      : reviewMode === "exceptions_only"
      ? "Accounting reviews only flagged or exception items."
      : null;
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-2">
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Accounting Queue</p>
        {guidanceLine && (
          <p className="mt-0.5 text-[9px] leading-snug text-white/28">{guidanceLine}</p>
        )}
      </div>
      <QueueSummaryBar summary={summary} />
      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-white/30">Loading…</div>
      ) : !expenses.length ? (
        <div className="px-4 py-6 text-center text-xs text-white/25">No expenses pending accounting review.</div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {expenses.map((e) => (
            <li key={e.id}>
              <button
                onClick={() => onSelect(e)}
                className={`w-full border-b border-white/[0.05] px-4 py-3 text-left transition-colors ${
                  selectedId === e.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium text-white/80">{e.description}</span>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${statusCls(e.status)}`}>
                    {e.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-white/35">
                    #{e.id} · {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-white/45">${e.amount.toFixed(2)}</span>
                </div>
                {/* Coding/policy hint badges */}
                {(!e.account_code || !e.category_code || e.detected_category) && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {!e.account_code && !e.category_code && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-0.5 text-[8px] text-amber-300/55">
                        <AlertTriangle className="h-2 w-2" /> No account code
                      </span>
                    )}
                    {e.account_code && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-white/38">
                        <Lock className="h-2 w-2 text-white/25" /> {e.account_code}
                      </span>
                    )}
                    {e.category_code && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-white/38">
                        <ReceiptText className="h-2 w-2 text-white/25" /> {e.category_code}
                      </span>
                    )}
                    {e.detected_category && (
                      <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[8px] text-white/30">
                        <ReceiptText className="h-2 w-2 text-amber-400/40" /> {e.detected_category}
                      </span>
                    )}
                  </div>
                )}
                {(e.account_code || e.category_code) && (
                  <p className="mt-0.5 text-[8px] text-white/18">Suggested from past decisions</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {as && (
        <div className="mx-3 mt-3 mb-3 shrink-0 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-white/18">Review Mode</p>
          <p className="text-[9px] leading-snug text-white/28">
            {typeof as.accounting_review_mode === "string"
              ? as.accounting_review_mode === "all"
                ? "All expenses require accounting review."
                : as.accounting_review_mode === "exceptions_only"
                ? "Exceptions and policy failures only."
                : as.accounting_review_mode
              : "—"}
          </p>
          {as.require_final_accounting_review_before_export === true && (
            <p className="mt-0.5 text-[9px] leading-snug text-white/20">Final review required before export.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Workflow config summary ───────────────────────────────────────────────────

function b(v: unknown): string {
  return v === true ? "Yes" : v === false ? "No" : "—";
}
function sv(v: unknown): string {
  return v != null ? String(v).replace(/_/g, " ") : "—";
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2 last:border-0">
      <span className="text-[10px] text-white/30">{label}</span>
      <span className="text-[10px] font-medium text-white/50">{value}</span>
    </div>
  );
}

function ConfigCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
      <div className="border-b border-white/[0.05] bg-black/20 px-3 py-1.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">{title}</p>
      </div>
      {rows.map(([l, v]) => <ConfigRow key={l} label={l} value={v} />)}
    </div>
  );
}

function WorkflowConfigSummary({ portalConfig }: { portalConfig: PortalConfig }) {
  const ap = portalConfig.approval_setup  as Record<string, unknown>;
  const wf = portalConfig.workflow_setup  as Record<string, unknown>;
  const ac = portalConfig.accounting_setup as Record<string, unknown>;

  const approvalRows: [string, string][] = [
    ["Approval mode",          sv(ap.approval_mode)],
    ["Mgr. for all employees", b(ap.require_manager_for_all_employees)],
    ["Escalate policy fails",  b(ap.escalate_policy_failures_to_accounting)],
    ["Escalate international", b(ap.escalate_international_to_accounting)],
    ["Resubmission allowed",   b(ap.allow_resubmission_after_rejection)],
  ];

  const workflowRows: [string, string][] = [
    ["Workflow mode",         sv(wf.default_expense_workflow_mode)],
    ["Block on failure",      b(wf.block_submit_on_failed_validation)],
    ["Allow with warnings",   b(wf.allow_submit_with_warnings)],
    ["Route policy fails to", sv(wf.route_policy_failures_to)],
    ["Route intl. to",        sv(wf.route_international_expenses_to)],
  ];

  const accountingRows: [string, string][] = [
    ["Review mode",             sv(ac.accounting_review_mode)],
    ["Póliza required",         b(ac.poliza_required)],
    ["Account code req.",       b(ac.account_code_required)],
    ["Cost center req.",        b(ac.cost_center_required)],
    ["Project required",        b(ac.project_required)],
    ["Final review for export", b(ac.require_final_accounting_review_before_export)],
    ...(ac.archive_retention_years != null
      ? [[`Archive retention`, `${ac.archive_retention_years} yr`] as [string, string]]
      : []),
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      <ConfigCard title="Approval path"       rows={approvalRows} />
      <ConfigCard title="Workflow routing"    rows={workflowRows} />
      <ConfigCard title="Accounting controls" rows={accountingRows} />
    </div>
  );
}

// ── Detail ────────────────────────────────────────────────────────────────────

function AccountingFlags({ portalConfig }: { portalConfig: PortalConfig | null }) {
  const as = portalConfig?.accounting_setup as Record<string, unknown> | undefined;
  if (!as) return null;
  const flags: { label: string; cls: string }[] = [];
  if (as.account_code_required === true)
    flags.push({ label: "Account Code Required", cls: "border-sky-500/20 bg-sky-500/[0.05] text-sky-300/55" });
  if (as.cost_center_required === true)
    flags.push({ label: "Cost Center Required", cls: "border-indigo-500/20 bg-indigo-500/[0.05] text-indigo-300/55" });
  if (as.project_required === true)
    flags.push({ label: "Project Required", cls: "border-indigo-500/20 bg-indigo-500/[0.05] text-indigo-300/55" });
  if (as.client_required === true)
    flags.push({ label: "Client Required", cls: "border-indigo-500/20 bg-indigo-500/[0.05] text-indigo-300/55" });
  if (as.poliza_required === true)
    flags.push({ label: "P\u00f3liza Required", cls: "border-emerald-500/20 bg-emerald-500/[0.05] text-emerald-300/55" });
  if (as.allow_accounting_override === true)
    flags.push({ label: "Override Allowed", cls: "border-amber-500/20 bg-amber-500/[0.05] text-amber-300/55" });
  if (!flags.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(({ label, cls }) => (
        <span key={label} className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

function Detail({
  expense,
  portalConfig,
  summary,
  accountingActions,
  onApprove,
  onReject,
  onReturn,
  onAssignAccountCode,
  onGenerateEvent,
  acting,
  actionError,
  accountCodeDraft,
  onAccountCodeChange,
  onSaveAccountCode,
  onClearAccountCode,
  accountCodeSaving,
  accountCodeError,
  eventGenerating,
  eventResult,
  eventError,
  expenseBlockers,
  allocationSummary,
  allocRows,
  onAllocRowChange,
  projects,
  clients,
  costCenters,
  allocSaving,
  allocSaveError,
  onSaveAllocation,
  exportBundleBuilding,
  exportBundleResult,
  exportBundleError,
  onBuildExportBundle,
  triage,
  linkedDocs,
}: {
  expense: Expense | null;
  portalConfig: PortalConfig | null;
  summary: QueueSummary | null;
  accountingActions: AccountingActions | null;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
  onAssignAccountCode: () => void;
  onGenerateEvent: () => void;
  acting: boolean;
  actionError: string | null;
  accountCodeDraft: string;
  onAccountCodeChange: (v: string) => void;
  onSaveAccountCode: () => void;
  onClearAccountCode: () => void;
  accountCodeSaving: boolean;
  accountCodeError: string | null;
  eventGenerating: boolean;
  eventResult: AccountingEventResult | null;
  eventError: string | null;
  expenseBlockers: BlockersResult | null;
  allocationSummary: AllocationSummaryResult | null;
  allocRows: AllocationRow[];
  onAllocRowChange: (rows: AllocationRow[]) => void;
  projects: OrgUnit[];
  clients: OrgUnit[];
  costCenters: OrgUnit[];
  allocSaving: boolean;
  allocSaveError: string | null;
  onSaveAllocation: () => void;
  exportBundleBuilding: boolean;
  exportBundleResult: any | null;
  exportBundleError: string | null;
  onBuildExportBundle: () => void;
  triage: TriageInfo | null;
  linkedDocs: ExpenseDocument[];
}) {
  const derived = portalConfig?.derived;
  const as      = portalConfig?.accounting_setup as Record<string, unknown> | undefined;

  const empty = (
    <div className="space-y-2 pb-8">
      <PortalPolicySummary portalConfig={portalConfig} portalType="accounting" />
      {portalConfig && derived?.accounting_flow_enabled && (
        <WorkflowConfigSummary portalConfig={portalConfig} />
      )}
      <AccountingFlags portalConfig={portalConfig} />
      {summary && summary.total_count > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
          <span className="text-[9px] text-white/28">
            <span className="font-semibold uppercase tracking-widest text-white/22">Queue </span>
            {summary.total_count} pending · ${summary.total_amount.toFixed(2)} total
          </span>
        </div>
      )}
      <ExportBundlePanel
        building={exportBundleBuilding}
        result={exportBundleResult}
        error={exportBundleError}
        onBuild={onBuildExportBundle}
      />
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-white/20">Select an expense to review.</p>
      </div>
    </div>
  );

  if (!expense) return empty;

  const rows: [string, string][] = [
    ["Description",  expense.description],
    ["Amount",       `$${expense.amount.toFixed(2)} MXN`],
    ["Status",       expense.status],
    ["Category",     expense.detected_category ?? "—"],
    ["Account Code", expense.account_code ?? "—"],
    ["Report ID",    expense.report_id != null ? String(expense.report_id) : "—"],
    ["Created",      new Date(expense.created_at).toLocaleString()],
  ];

  const needsCoding = !expense.account_code;

  return (
    <div className="space-y-2 pb-8">
      <PortalPolicySummary portalConfig={portalConfig} portalType="accounting" />
      <AccountingFlags portalConfig={portalConfig} />

      {/* Accounting readiness panel */}
      {expenseBlockers && (() => {
        const acctBlockers  = expenseBlockers.accounting_blockers;
        const polizaBlockers = expenseBlockers.poliza_blockers;
        const warnings       = expenseBlockers.warnings;
        const allClear       = acctBlockers.length === 0 && polizaBlockers.length === 0 && warnings.length === 0;
        return (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
            <div className="border-b border-white/[0.05] px-3 py-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Accounting readiness</span>
            </div>
            <div className="px-3 py-2 space-y-1.5">
              {allClear && (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400/70" />
                  <span className="text-[10px] font-semibold text-emerald-300/70">No accounting blockers</span>
                </div>
              )}
              {acctBlockers.length > 0 && (
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-red-400/50">Accounting</p>
                  <ul className="space-y-0.5">
                    {acctBlockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-red-400/55" />
                        <span className="text-[9px] leading-snug text-red-300/60">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {polizaBlockers.length > 0 && (
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-amber-400/45">Póliza</p>
                  <ul className="space-y-0.5">
                    {polizaBlockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-400/50" />
                        <span className="text-[9px] leading-snug text-amber-300/55">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {warnings.length > 0 && (
                <div>
                  <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/22">Warnings</p>
                  <ul className="space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/25" />
                        <span className="text-[9px] leading-snug text-white/35">{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Allocation summary + correction */}
      {(() => {
        const showProject = as?.project_required === true;
        const showClient  = as?.client_required  === true;
        const showCC      = as?.cost_center_required === true;
        if (!showProject && !showClient && !showCC) return null;
        const presence = allocationSummary?.presence;
        const allocBlockers = expenseBlockers
          ? [...expenseBlockers.accounting_blockers, ...expenseBlockers.poliza_blockers].filter(
              (msg) => /allocation/i.test(msg),
            )
          : [];
        const hasAllocBlockers = allocBlockers.length > 0;
        type DimKey = "project_id" | "client_id" | "cost_center_id";
        const activeDims: Array<{ key: DimKey; label: string; hasFlag: boolean; units: OrgUnit[] }> = [];
        if (showProject) activeDims.push({ key: "project_id",     label: "Project",     hasFlag: presence?.has_project     ?? false, units: projects });
        if (showClient)  activeDims.push({ key: "client_id",      label: "Client",      hasFlag: presence?.has_client      ?? false, units: clients });
        if (showCC)      activeDims.push({ key: "cost_center_id", label: "Cost Center", hasFlag: presence?.has_cost_center ?? false, units: costCenters });
        return (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-1.5">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Allocations</span>
              {(presence?.allocation_count ?? 0) > 1 && (
                <span className="text-[8px] text-white/22">{presence!.allocation_count} splits</span>
              )}
            </div>
            <div className="space-y-2 px-3 py-2">
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${activeDims.length}, minmax(0, 1fr))` }}
              >
                {activeDims.map(({ key, label, hasFlag }) => (
                  <div
                    key={key}
                    className={`rounded border px-2 py-1.5 ${
                      hasFlag ? "border-emerald-500/20 bg-emerald-500/[0.04]" : "border-white/[0.05] bg-black/10"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-[8px] font-bold uppercase tracking-widest text-white/22">{label}</p>
                      {hasFlag
                        ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-400/60" />
                        : <span className="text-[8px] text-white/18">—</span>
                      }
                    </div>
                    <p className={`mt-0.5 text-[10px] ${hasFlag ? "text-white/45" : "italic text-white/22"}`}>
                      {hasFlag ? "Assigned" : "Not assigned"}
                    </p>
                  </div>
                ))}
              </div>
              {hasAllocBlockers && (
                <div className="border-t border-white/[0.05] pt-2">
                  <p className="mb-1.5 text-[9px] font-semibold text-amber-300/50">Correct allocation</p>
                  <div
                    className="grid gap-1 rounded border border-white/[0.06] bg-black/10 px-2 py-1.5"
                    style={{ gridTemplateColumns: `repeat(${activeDims.length}, minmax(0, 1fr))` }}
                  >
                    {activeDims.map(({ key, label, units }) => {
                      const rowVal = allocRows[0]?.[key] ?? null;
                      return (
                        <div key={key}>
                          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-white/22">{label}</p>
                          <select
                            value={rowVal ?? ""}
                            onChange={(e) =>
                              onAllocRowChange([{
                                ...(allocRows[0] ?? { project_id: null, client_id: null, cost_center_id: null, percent: "100" }),
                                [key]: e.target.value === "" ? null : Number(e.target.value),
                              }])
                            }
                            className="w-full rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/55 outline-none focus:border-indigo-500/40"
                          >
                            <option value="">—</option>
                            {units.map((o) => (
                              <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  {allocSaveError && (
                    <p className="mt-1 text-[9px] text-red-300/60">{allocSaveError}</p>
                  )}
                  <div className="mt-1.5 flex justify-end">
                    <button
                      onClick={onSaveAllocation}
                      disabled={allocSaving}
                      className="rounded border border-indigo-500/30 bg-indigo-600/[0.15] px-2.5 py-1 text-[10px] font-semibold text-indigo-300/80 transition-colors hover:bg-indigo-600/[0.25] disabled:opacity-40"
                    >
                      {allocSaving ? "Saving…" : "Save Allocation"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Coding / policy issue banner */}
      {needsCoding && (
        <div className="flex items-center gap-1.5 rounded border border-amber-500/[0.12] bg-amber-500/[0.04] px-2.5 py-1.5">
          <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-amber-400/60" />
          <p className="text-[9px] text-amber-300/55">Account code not assigned. Coding required before export.</p>
        </div>
      )}

      {/* Why this classification? */}
      {expense.accounting_explanation && (
        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
          <div className="border-b border-white/[0.05] px-3 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Why this classification?</span>
          </div>
          <div className="space-y-1 px-3 py-2">
            <p className="text-[10px] leading-snug text-white/55">{expense.accounting_explanation.category_reason}</p>
            <p className="text-[9px] leading-snug text-white/35">{expense.accounting_explanation.account_reason}</p>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                expense.accounting_explanation.source === "learning" ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-300/70"
                : expense.accounting_explanation.source === "keyword"  ? "border-sky-500/25 bg-sky-500/10 text-sky-300/70"
                : expense.accounting_explanation.source === "manual"   ? "border-violet-500/25 bg-violet-500/10 text-violet-300/70"
                : "border-zinc-500/25 bg-zinc-500/10 text-zinc-400/70"
              }`}>{expense.accounting_explanation.source}</span>
              <span className={`rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${
                expense.accounting_explanation.confidence === "high"   ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/70"
                : expense.accounting_explanation.confidence === "medium" ? "border-amber-500/25 bg-amber-500/10 text-amber-300/70"
                : "border-zinc-500/25 bg-zinc-500/10 text-zinc-400/70"
              }`}>{expense.accounting_explanation.confidence} confidence</span>
            </div>
          </div>
        </div>
      )}

      {/* Expense header */}
      <div className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.09] bg-zinc-900/80 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[12px] font-semibold leading-snug text-white">{expense.description}</h2>
          <p className="mt-0.5 text-[10px] text-white/28">Expense #{expense.id}</p>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest ${statusCls(expense.status)}`}>
          {expense.status}
        </span>
      </div>

      {/* Field table */}
      <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</span>
            <span className="truncate text-right font-mono text-xs text-white/65">{value}</span>
          </div>
        ))}
      </div>

      {/* Accounting work summary */}
      {accountingActions && (() => {
        const canEvent = accountingActions.can_generate_accounting_event;
        const eventBlockReason = !canEvent
          ? (expenseBlockers?.accounting_blockers[0] ??
             accountingActions.reasons.find((r) =>
               r.toLowerCase().includes("account") ||
               r.toLowerCase().includes("classif")
             ) ?? null)
          : null;
        return (
          <div className="divide-y divide-white/[0.04] overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
            <div className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/22">Account Code</span>
              {expense.account_code
                ? <span className="font-mono text-[10px] text-white/65">{expense.account_code}</span>
                : <span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider text-amber-300/55">Unassigned</span>
              }
            </div>
            <div className="flex items-start justify-between gap-3 px-3 py-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-white/22">Event Available</span>
              <div className="flex flex-col items-end gap-0.5">
                {canEvent
                  ? <span className="text-[9px] text-emerald-300/60">Yes</span>
                  : <span className="text-[9px] text-white/28">No</span>
                }
                {eventBlockReason && (
                  <span className="text-right text-[8px] leading-snug text-amber-300/45">{eventBlockReason}</span>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Account code panel */}
      {accountingActions?.can_assign_account_code && (
        <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">Account Code</p>
          <div className="flex gap-1.5">
            <input
              type="text"
              value={accountCodeDraft}
              onChange={(e) => onAccountCodeChange(e.target.value)}
              placeholder="e.g. 1010-expenses"
              disabled={accountCodeSaving}
              className="min-w-0 flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 font-mono text-xs text-white/80 placeholder-white/20 focus:border-white/[0.15] focus:outline-none disabled:opacity-40"
            />
            <button
              onClick={onSaveAccountCode}
              disabled={accountCodeSaving || !accountCodeDraft.trim()}
              className="shrink-0 rounded border border-sky-500/30 bg-sky-500/[0.08] px-2.5 py-1 text-[10px] font-semibold text-sky-300/70 transition-colors hover:bg-sky-500/[0.14] disabled:opacity-30"
            >
              Save
            </button>
            {(expense.account_code || accountCodeDraft) && (
              <button
                onClick={onClearAccountCode}
                disabled={accountCodeSaving}
                className="shrink-0 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/35 transition-colors hover:bg-white/[0.06] disabled:opacity-30"
              >
                Clear
              </button>
            )}
          </div>
          {accountCodeError && (
            <p className="mt-1.5 text-[9px] text-red-300/60">{accountCodeError}</p>
          )}
        </div>
      )}

      {/* Póliza panel — shown whenever póliza is configured for this company */}
      {/* Accounting event panel */}
      <div className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2.5">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">Accounting Event</p>
        {accountingActions?.can_generate_accounting_event ? (
          <button
            onClick={onGenerateEvent}
            disabled={eventGenerating || acting}
            className="rounded border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-300/70 transition-colors hover:bg-emerald-500/[0.13] disabled:opacity-30"
          >
            {eventGenerating ? "Generating…" : "Generate Event"}
          </button>
        ) : (
          <button
            disabled
            className="cursor-not-allowed rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10px] font-semibold text-white/25"
          >
            Generate Event
          </button>
        )}
        {eventResult && (
          <pre className="mt-2 overflow-x-auto rounded border border-white/[0.07] bg-black/30 p-2 font-mono text-[9px] leading-relaxed text-white/55 whitespace-pre-wrap break-all">
            {JSON.stringify(eventResult, null, 2)}
          </pre>
        )}
        {eventError && (
          <p className="mt-1.5 text-[9px] text-red-300/60">{eventError}</p>
        )}
      </div>

      {/* Accounting actions */}
      <ReviewActionBar
        portalRole="accounting"
        actions={accountingActions}
        acting={acting}
        onApprove={onApprove}
        onReject={onReject}
        onReturn={onReturn}
        onAssignAccountCode={onAssignAccountCode}
        onGeneratePoliza={onGenerateEvent as () => void}
      />
      {actionError && (
        <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.07] px-2.5 py-2">
          <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
          <p className="text-[10px] leading-snug text-red-300/65">{actionError}</p>
        </div>
      )}

      {/* Archive */}
      <ExpenseArchivePanel expenseId={expense?.id} />

      {/* Documents — all linked docs (submission + internal types visible to accounting) */}
      {linkedDocs.length > 0 && (() => {
        const cfdiDocs = linkedDocs.filter((d) =>
          d.document_type === "cfdi_xml" || d.document_type === "cfdi_pdf"
        );

        // CFDI pair state — only relevant when CFDI docs are present
        const matchState: "matched" | "possible" | "waiting" | "ask" | null = (() => {
          if (!triage || !cfdiDocs.length) return null;
          const k = triage.document_kind;
          if (k !== "cfdi_xml" && k !== "cfdi_pdf") return null;
          if (triage.match_candidate) {
            const mc = triage.match_candidate;
            const isHigh = mc.confidence === "high" || mc.match_level === "strong";
            return isHigh ? "matched" : "possible";
          }
          if (triage.recommended_action === "wait_for_pair") return "waiting";
          if (triage.recommended_action === "ask_user") return "ask";
          return null;
        })();

        // Non-CFDI docs — includes supporting_document, unknown (internal types)
        const genericDocs = linkedDocs.filter((d) =>
          d.document_type !== "cfdi_xml" && d.document_type !== "cfdi_pdf"
        );
        const GENERIC_LABEL: Record<string, string> = {
          receipt_pdf:         "Receipt PDF",
          pdf_unclassified:    "PDF",
          supporting_document: "Supporting doc",
          ticket:              "Ticket",
          receipt:             "Receipt",
          receipt_pdf:         "Receipt PDF",
          justification:       "Justification",
          proof:               "Proof",
          unknown:             "Unclassified",
        };

        return (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
            <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Documents</span>
                <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-px text-[8px] text-white/25">
                  {linkedDocs.length}
                </span>
              </div>
              {matchState === "matched" && (
                <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300/60">
                  <CheckCircle2 className="h-2 w-2" /> Paired
                </span>
              )}
              {matchState === "possible" && (
                <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300/55">
                  <AlertTriangle className="h-2 w-2" /> Possible pair
                </span>
              )}
              {matchState === "waiting" && (
                <span className="inline-flex items-center gap-0.5 rounded border border-zinc-500/20 bg-zinc-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-zinc-400/45">
                  <Clock className="h-2 w-2" /> Waiting
                </span>
              )}
              {matchState === "ask" && (
                <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300/55">
                  <AlertTriangle className="h-2 w-2" /> Review
                </span>
              )}
            </div>

            <div className="divide-y divide-white/[0.04]">
              {/* CFDI docs with internal pairing/classification interpretation */}
              {cfdiDocs.map((d) => {
                const isXml     = d.document_type === "cfdi_xml";
                const isPrimary = triage != null && d.id === triage.document_id;
                return (
                  <div key={d.id} className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      {isXml ? (
                        <span className="shrink-0 rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-sky-300/70">
                          XML
                        </span>
                      ) : (
                        <span className="shrink-0 rounded border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-violet-300/70">
                          CFDI PDF
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-white/35">{d.filename}</span>
                    </div>
                    {d.validation_summary ? (
                      <p className="mt-0.5 text-[9px] leading-snug text-white/38">{d.validation_summary}</p>
                    ) : (
                      <p className="mt-0.5 text-[9px] italic text-white/18">Processing…</p>
                    )}
                    {isPrimary && triage!.match_candidate && (() => {
                      const mc     = triage!.match_candidate!;
                      const isHigh = mc.confidence === "high" || mc.match_level === "strong";
                      const other  = isXml ? "PDF" : "XML";
                      const docId  = isXml ? mc.pdf_document_id : mc.xml_document_id;
                      const reason = mc.match_reason ?? null;
                      return (
                        <div className="mt-1 flex items-center gap-1">
                          <CheckCircle2 className={`h-2.5 w-2.5 shrink-0 ${isHigh ? "text-emerald-400/60" : "text-amber-400/50"}`} />
                          <span className={`text-[9px] ${isHigh ? "text-emerald-300/55" : "text-amber-300/45"}`}>
                            {isHigh ? `Exact ${other} match` : `Possible ${other} match`}
                            {docId != null && <span className="ml-1 font-mono text-white/22">#{docId}</span>}
                            {reason && <span className="ml-1 text-white/20">· {reason.split(" ").slice(0, 5).join(" ")}</span>}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}

              {/* Non-CFDI docs — receipts, supporting evidence, and internal classification types */}
              {genericDocs.map((d) => (
                <div key={d.id} className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8px] uppercase tracking-wide ${
                      d.document_type === "supporting_document" || d.document_type === "unknown"
                        ? "border-zinc-500/20 bg-zinc-500/[0.05] text-zinc-400/45"
                        : "border-zinc-500/20 bg-zinc-500/[0.06] text-zinc-400/50"
                    }`}>
                      {GENERIC_LABEL[d.document_type ?? ""] ?? (d.document_type ?? "File")}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-white/28">{d.filename}</span>
                  </div>
                  {d.validation_summary && (
                    <p className="mt-0.5 text-[9px] leading-snug text-white/28">{d.validation_summary}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Archive retention note */}
      {as?.archive_retention_years != null && (
        <div className="flex items-center gap-1.5 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-white/18" />
          <p className="text-[9px] text-white/28">
            Archive retention: {String(as.archive_retention_years)} years per company policy.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Export Bundle Panel ───────────────────────────────────────────────────────

function ExportBundlePanel({
  building,
  result,
  error,
  onBuild,
}: {
  building: boolean;
  result: any | null;
  error: string | null;
  onBuild: () => void;
}) {
  const manifest = result?.manifest;
  const erroredExpenses: { expense_id: number; error: string }[] = manifest
    ? manifest.expenses.filter((e: any) => !!e.error)
    : [];

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
      <div className="flex items-center justify-between border-b border-white/[0.05] px-3 py-1.5">
        <div className="flex items-center gap-1.5">
          <PackageCheck className="h-3 w-3 text-white/25" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Export Bundle</span>
        </div>
        <button
          type="button"
          onClick={onBuild}
          disabled={building}
          className="inline-flex items-center gap-1 rounded border border-sky-500/25 bg-sky-500/[0.09] px-2.5 py-1 text-[10px] font-semibold text-sky-300/70 transition-colors hover:bg-sky-500/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {building ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Building…</>
          ) : (
            "Build Export Bundle"
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-1.5 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-400/55" />
          <p className="text-[10px] text-red-300/65">{error}</p>
        </div>
      )}

      {result && (
        <div className="divide-y divide-white/[0.04]">
          {/* Summary row */}
          <div className="grid grid-cols-4 divide-x divide-white/[0.04] px-0 py-0">
            {([
              ["Bundle",   result.bundle_name ?? "—",            true],
              ["Expenses", String(result.expense_count ?? 0),    false],
              ["Events",   String(result.manifest?.event_count ?? 0), false],
              ["Archives", String(result.manifest?.archive_file_count ?? 0), false],
            ] as [string, string, boolean][]).map(([label, val, wide]) => (
              wide ? null : (
                <div key={label} className="px-3 py-2 text-center">
                  <p className="font-mono text-sm font-bold text-white/70">{val}</p>
                  <p className="text-[8px] uppercase tracking-widest text-white/22">{label}</p>
                </div>
              )
            ))}
          </div>
          <div className="px-3 py-2">
            <p className="text-[8px] font-bold uppercase tracking-widest text-white/22">Bundle name</p>
            <p className="mt-0.5 font-mono text-[10px] text-emerald-300/55 break-all">{result.bundle_name}</p>
          </div>

          {/* Errors / skipped expenses */}
          {erroredExpenses.length > 0 && (
            <div className="px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <AlertTriangle className="h-2.5 w-2.5 text-amber-400/55" />
                <p className="text-[9px] font-bold uppercase tracking-widest text-amber-400/55">
                  {erroredExpenses.length} expense{erroredExpenses.length !== 1 ? "s" : ""} skipped
                </p>
              </div>
              <ul className="space-y-0.5">
                {erroredExpenses.map((e: any) => (
                  <li key={e.expense_id} className="flex items-start gap-2">
                    <span className="shrink-0 font-mono text-[9px] text-white/30">#{e.expense_id}</span>
                    <span className="text-[9px] leading-snug text-amber-300/50">{e.error}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && !error && !building && (
        <div className="px-3 py-2">
          <p className="text-[10px] text-white/22">
            Generates a bundle of accounting events and archive metadata for all approved expenses.
          </p>
        </div>
      )}
    </div>
  );
}

// ── AI panel ──────────────────────────────────────────────────────────────────

function AiPanel({
  portalConfig,
  expense,
}: {
  portalConfig: PortalConfig | null;
  expense: Expense | null;
}) {
  const as = portalConfig?.accounting_setup as Record<string, unknown> | undefined;
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">Accounting Copilot</div>
        {expense ? (
          <p className="text-xs text-white/35">
            Reviewing expense #{expense.id}.
            {!expense.account_code ? " Account code is missing — assign before approving." : " Account code is present."}
          </p>
        ) : (
          <p className="text-xs text-white/35">Select an expense from the queue to get AI coding and review guidance.</p>
        )}
      </div>
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">Period Close Checklist</div>
        <ul className="space-y-1.5">
          {[
            "All submitted reports approved",
            "P\u00f3lizas generated for approved reports",
            "Draft p\u00f3lizas reviewed and posted",
            "XML export completed for SAT filing",
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-white/40">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      {as?.ai_accounting_assist_enabled === true && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">AI Assist</div>
          <p className="text-xs text-white/35">AI account code suggestion and auto-coding is enabled for this company.</p>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const [portalConfig, setPortalConfig]     = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading]   = useState(true);
  const [expenses, setExpenses]             = useState<Expense[]>([]);
  const [queueSummary, setQueueSummary]     = useState<QueueSummary | null>(null);
  const [selected, setSelected]             = useState<Expense | null>(null);
  const [queueLoading, setQueueLoading]     = useState(false);
  const [acting, setActing]                 = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [accountingActions, setAccountingActions] = useState<AccountingActions | null>(null);
  const [accountCodeDraft, setAccountCodeDraft]     = useState<string>("");
  const [accountCodeSaving, setAccountCodeSaving]   = useState(false);
  const [accountCodeError, setAccountCodeError]     = useState<string | null>(null);
  const [eventGenerating, setEventGenerating]       = useState(false);
  const [eventResult, setEventResult]               = useState<AccountingEventResult | null>(null);
  const [eventError, setEventError]                 = useState<string | null>(null);
  const [expenseBlockers, setExpenseBlockers]       = useState<BlockersResult | null>(null);
  const [allocationSummary, setAllocationSummary]   = useState<AllocationSummaryResult | null>(null);
  const [allocRows, setAllocRows]                   = useState<AllocationRow[]>([
    { project_id: null, client_id: null, cost_center_id: null, percent: "100" },
  ]);
  const [allocSaving, setAllocSaving]               = useState(false);
  const [allocSaveError, setAllocSaveError]         = useState<string | null>(null);
  const [projects, setProjects]                     = useState<OrgUnit[]>([]);
  const [clients, setClients]                       = useState<OrgUnit[]>([]);
  const [costCenters, setCostCenters]               = useState<OrgUnit[]>([]);

  const [exportBundleBuilding, setExportBundleBuilding] = useState(false);
  const [exportBundleResult,   setExportBundleResult]   = useState<any | null>(null);
  const [exportBundleError,    setExportBundleError]    = useState<string | null>(null);

  const [triage,     setTriage]     = useState<TriageInfo | null>(null);
  const [linkedDocs, setLinkedDocs] = useState<ExpenseDocument[]>([]);

  const [globalNavItems, setGlobalNavItems] = useState<GlobalNavItem[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);

  // ── Permission fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    const userId = getCurrentUserId();
    if (!userId) return;
    fetch(`${API}/roles/user-permissions/${userId}`)
      .then((r) => r.ok ? r.json() : { permission_keys: [] })
      .catch(() => ({ permission_keys: [] }))
      .then((d) => setPermissionKeys(d.permission_keys ?? []));
  }, []);

  // ── Portal config ─────────────────────────────────────────────────────────
  useEffect(() => {
    const companyId = getCurrentCompanyId() ?? "1";
    setConfigLoading(true);
    fetch(`${API}/admin/portal-config/${companyId}`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((cfg) => { if (cfg) setPortalConfig(cfg); })
      .finally(() => setConfigLoading(false));
  }, []);

  // ── Nav ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const role = getCurrentRole();
    const enabledModules = portalConfig?.derived.enabled_modules ?? [];
    setGlobalNavItems(
      buildGlobalNav({
        role,
        enabledModuleKeys: enabledModules,
        permissionKeys,
        currentPortal: "accounting",
      })
    );
  }, [portalConfig, permissionKeys]);

  // ── Accounting queue ──────────────────────────────────────────────────────
  const loadQueue = useCallback(() => {
    const companyId = getCurrentCompanyId() ?? "1";
    setQueueLoading(true);
    fetch(`${API}/accounting/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : { items: [], summary: null })
      .then((data: { items: Expense[]; summary: QueueSummary }) => {
        setExpenses(data.items ?? []);
        setQueueSummary(data.summary ?? null);
        if (data.items?.length) setSelected((prev) => prev ?? data.items[0]);
      })
      .catch(() => {})
      .finally(() => setQueueLoading(false));
  }, []);

  useEffect(() => {
    if (!configLoading && portalConfig?.derived.accounting_flow_enabled) {
      loadQueue();
    }
  }, [configLoading, portalConfig, loadQueue]);

  // ── Accounting actions fetch ────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) { setAccountingActions(null); return; }
    fetch(`${API}/expenses/actions/${selected.id}?portal_role=accounting`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setAccountingActions(data?.actions ?? null))
      .catch(() => setAccountingActions(null));
  }, [selected?.id]);

  // ── Accounting blockers fetch ─────────────────────────────────────────────
  useEffect(() => {
    if (!selected) { setExpenseBlockers(null); return; }
    fetch(`${API}/expenses/blockers/${selected.id}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : null)
      .then(setExpenseBlockers)
      .catch(() => setExpenseBlockers(null));
  }, [selected?.id]);

  // ── Document triage fetch ─────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) { setTriage(null); setLinkedDocs([]); return; }
    fetch(`${API}/expenses/documents/by-expense/${selected.id}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : [])
      .then((docs: ExpenseDocument[]) => {
        setLinkedDocs(docs);
        if (!docs.length) { setTriage(null); return Promise.resolve(null); }
        // Prefer XML doc for triage; fall back to first
        const primary = docs.find((d) => d.document_type === "cfdi_xml") ?? docs[0];
        return fetch(`${API}/expenses/document-triage/${primary.id}?company_id=1`, { headers: { "X-User-Id": "1" } })
          .then((r) => r.ok ? r.json() : null);
      })
      .then((t) => setTriage(t ?? null))
      .catch(() => { setTriage(null); setLinkedDocs([]); });
  }, [selected?.id]);

  // ── Allocation summary fetch ──────────────────────────────────────────────
  useEffect(() => {
    if (!selected) {
      setAllocationSummary(null);
      setAllocRows([{ project_id: null, client_id: null, cost_center_id: null, percent: "100" }]);
      setAllocSaveError(null);
      return;
    }
    fetch(`${API}/expenses/allocations-summary/${selected.id}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : null)
      .then((data: AllocationSummaryResult | null) => {
        if (!data) return;
        setAllocationSummary(data);
        setAllocRows(
          data.items.length > 0
            ? data.items.map((a) => ({
                project_id:     a.project_id,
                client_id:      a.client_id,
                cost_center_id: a.cost_center_id,
                percent:        String(a.percent),
              }))
            : [{ project_id: null, client_id: null, cost_center_id: null, percent: "100" }],
        );
      })
      .catch(() => {});
  }, [selected?.id]);

  // ── Org units for allocation selectors ────────────────────────────────────
  useEffect(() => {
    const cid = getCurrentCompanyId() ?? "1";
    const h = { "X-User-Id": "1" };
    Promise.all([
      fetch(`${API}/expenses/projects?company_id=${cid}`,     { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/clients?company_id=${cid}`,      { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/cost-centers?company_id=${cid}`, { headers: h }).then((r) => r.ok ? r.json() : []),
    ])
      .then(([p, c, cc]) => { setProjects(p); setClients(c); setCostCenters(cc); })
      .catch(() => {});
  }, []);

  // ── Account code draft sync ───────────────────────────────────────────────
  useEffect(() => {
    setAccountCodeDraft(selected?.account_code ?? "");
    setAccountCodeError(null);
    setPolizaResult(null);
    setPolizaError(null);
    setAllocSaveError(null);
    setLinkedDocs([]);
  }, [selected?.id]);

  // ── Post-action refresh ────────────────────────────────────────────────────
  // Re-fetches the queue and advances selection if the acted item left the queue.
  const postActionRefresh = useCallback(async (actedId: number) => {
    const companyId = getCurrentCompanyId() ?? "1";
    setQueueLoading(true);
    try {
      const data = await fetch(`${API}/accounting/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
        .then((r) => r.ok ? r.json() : { items: [], summary: null })
        .catch(() => ({ items: [], summary: null })) as { items: Expense[]; summary: QueueSummary };
      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setQueueSummary(data.summary ?? null);
      if (items.some((e) => e.id === actedId)) {
        const updated = items.find((e) => e.id === actedId)!;
        setSelected(updated);
        const ar = await fetch(`${API}/expenses/actions/${actedId}?portal_role=accounting`, { headers: { "X-User-Id": "1" } });
        if (ar.ok) { const ad = await ar.json(); setAccountingActions(ad?.actions ?? null); }
      } else if (items.length === 0) {
        setSelected(null);
        setAccountingActions(null);
      } else {
        const oldIndex = expenses.findIndex((e) => e.id === actedId);
        const nextItem = items[oldIndex] ?? items[Math.max(0, oldIndex - 1)] ?? items[0];
        setSelected(nextItem);
        const ar = await fetch(`${API}/expenses/actions/${nextItem.id}?portal_role=accounting`, { headers: { "X-User-Id": "1" } });
        if (ar.ok) { const ad = await ar.json(); setAccountingActions(ad?.actions ?? null); }
      }
    } finally {
      setQueueLoading(false);
    }
  }, [expenses]);

  // ── Action handlers ────────────────────────────────────────────────────────
  const handleApprove = async () => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(
        `${API}/expenses/review-actions/${selected.id}/accounting-approve`,
        { method: "POST", headers: { "X-User-Id": "1" } },
      );
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.detail ?? `Approve failed (${r.status}).`);
      }
    } catch { setActionError("Could not reach the server."); }
    finally { setActing(false); }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(
        `${API}/expenses/review-actions/${selected.id}/accounting-reject`,
        { method: "POST", headers: { "X-User-Id": "1" } },
      );
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.detail ?? `Reject failed (${r.status}).`);
      }
    } catch { setActionError("Could not reach the server."); }
    finally { setActing(false); }
  };

  const handleReturn = async () => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(
        `${API}/expenses/review-actions/${selected.id}/accounting-return`,
        { method: "POST", headers: { "X-User-Id": "1" } },
      );
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setActionError(body?.detail ?? `Return failed (${r.status}).`);
      }
    } catch { setActionError("Could not reach the server."); }
    finally { setActing(false); }
  };

  // handleAssignAccountCode is wired to the action bar button; the inline
  // account code panel handles actual code entry — this is a no-op stub.
  const handleAssignAccountCode = () => {};

  const handleGenerateEvent = async () => {
    if (!selected) return;
    setEventGenerating(true);
    setEventResult(null);
    setEventError(null);
    try {
      const r = await fetch(
        `${API}/accounting/work/${selected.id}/generate-poliza`,
        { method: "POST", headers: { "X-User-Id": "1" } },
      );
      if (r.ok) {
        const body: PolizaResult = await r.json();
        setPolizaResult(body);
      } else {
        const body = await r.json().catch(() => ({}));
        setPolizaError(body?.detail ?? `P\u00f3liza generation failed (${r.status}).`);
      }
    } catch { setPolizaError("Could not reach the server."); }
    finally { setPolizaGenerating(false); }
  };

  const handleSaveAccountCode = async () => {
    if (!selected) return;
    setAccountCodeSaving(true);
    setAccountCodeError(null);
    try {
      const r = await fetch(
        `${API}/accounting/work/${selected.id}/assign-account-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-User-Id": "1" },
          body: JSON.stringify({ account_code: accountCodeDraft }),
        },
      );
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setAccountCodeError(body?.detail ?? `Save failed (${r.status}).`);
      }
    } catch { setAccountCodeError("Could not reach the server."); }
    finally { setAccountCodeSaving(false); }
  };

  const handleClearAccountCode = async () => {
    if (!selected) return;
    setAccountCodeSaving(true);
    setAccountCodeError(null);
    try {
      const r = await fetch(
        `${API}/accounting/work/${selected.id}/clear-account-code`,
        { method: "POST", headers: { "X-User-Id": "1" } },
      );
      if (r.ok) {
        setAccountCodeDraft("");
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setAccountCodeError(body?.detail ?? `Clear failed (${r.status}).`);
      }
    } catch { setAccountCodeError("Could not reach the server."); }
    finally { setAccountCodeSaving(false); }
  };

  // ── Save allocations (accounting correction) ──────────────────────────────
  const handleSaveAllocation = async () => {
    if (!selected) return;
    setAllocSaving(true);
    setAllocSaveError(null);
    try {
      const items = allocRows
        .filter((row) => row.project_id || row.client_id || row.cost_center_id)
        .map((row) => ({
          project_id:     row.project_id,
          client_id:      row.client_id,
          cost_center_id: row.cost_center_id,
          percent:        parseFloat(row.percent) || 100,
        }));
      if (items.length === 0) {
        setAllocSaveError("Select at least one allocation dimension before saving.");
        return;
      }
      const r = await fetch(`${API}/expenses/allocation-edit/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setAllocSaveError(body?.detail ?? `Save failed (${r.status}).`);
        return;
      }
      // Parallel refresh: summary + blockers + actions
      const [sr, br, ar] = await Promise.all([
        fetch(`${API}/expenses/allocations-summary/${selected.id}`, { headers: { "X-User-Id": "1" } }),
        fetch(`${API}/expenses/blockers/${selected.id}`,             { headers: { "X-User-Id": "1" } }),
        fetch(`${API}/expenses/actions/${selected.id}?portal_role=accounting`, { headers: { "X-User-Id": "1" } }),
      ]);
      if (sr.ok) {
        const sd: AllocationSummaryResult = await sr.json();
        setAllocationSummary(sd);
        setAllocRows(
          sd.items.length > 0
            ? sd.items.map((a) => ({
                project_id:     a.project_id,
                client_id:      a.client_id,
                cost_center_id: a.cost_center_id,
                percent:        String(a.percent),
              }))
            : [{ project_id: null, client_id: null, cost_center_id: null, percent: "100" }],
        );
      }
      if (br.ok) setExpenseBlockers(await br.json());
      if (ar.ok) { const ad = await ar.json(); setAccountingActions(ad?.actions ?? null); }
      // Refresh queue in case status changed
      await postActionRefresh(selected.id);
    } finally {
      setAllocSaving(false);
    }
  };

  // ── Build export bundle ───────────────────────────────────────────────────
  const handleBuildExportBundle = async () => {
    setExportBundleBuilding(true);
    setExportBundleResult(null);
    setExportBundleError(null);
    try {
      const r = await fetch(`${API}/accounting/export-bundles/1`, {
        method: "POST",
        headers: { "X-User-Id": "1" },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        setExportBundleError(body?.detail ?? `Build failed (${r.status}).`);
      } else {
        setExportBundleResult(await r.json());
      }
    } catch {
      setExportBundleError("Could not reach the server.");
    } finally {
      setExportBundleBuilding(false);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (configLoading) {
    return (
      <AppShell
        title="Accounting"
        globalNavItems={globalNavItems}
        workListTitle="Accounting Queue"
        workList={<Centered><p className="text-xs text-white/22">Loading…</p></Centered>}
        detail={<Centered><p className="text-xs text-white/22">Loading configuration…</p></Centered>}
        aiPanel={<AICopilotRail><AiPanel portalConfig={null} expense={null} /></AICopilotRail>}
      />
    );
  }

  // ── Accounting flow disabled ──────────────────────────────────────────────
  if (portalConfig && !portalConfig.derived.accounting_flow_enabled) {
    return (
      <AppShell
        title="Accounting"
        globalNavItems={globalNavItems}
        workListTitle="Accounting Queue"
        workList={
          <Centered>
            <Lock className="mx-auto mb-2 h-5 w-5 text-white/12" />
            <p className="text-xs text-white/22">Accounting review is not enabled.</p>
          </Centered>
        }
        detail={
          <div className="space-y-2 pb-8">
            <PortalPolicySummary portalConfig={portalConfig} portalType="accounting" />
            <div className="flex items-start gap-3 pt-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                <ShieldAlert className="h-4 w-4 text-white/18" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-white/30">
                  Accounting review is not enabled for this company configuration.
                </p>
                <p className="mt-0.5 text-[11px] text-white/18">
                  The current workflow does not route expenses through accounting review.
                  Contact your administrator if this is unexpected.
                </p>
              </div>
            </div>
          </div>
        }
        aiPanel={<AICopilotRail><AiPanel portalConfig={portalConfig} expense={null} /></AICopilotRail>}
      />
    );
  }

  // ── Main layout ───────────────────────────────────────────────────────────
  return (
    <AppShell
      title="Accounting"
      globalNavItems={globalNavItems}
      workListTitle="Accounting Queue"
      workList={
        <WorkList
          expenses={expenses}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          loading={queueLoading}
          portalConfig={portalConfig}
          summary={queueSummary}
        />
      }
      detail={
        <Detail
          expense={selected}
          portalConfig={portalConfig}
          summary={queueSummary}
          accountingActions={accountingActions}
          onApprove={handleApprove}
          onReject={handleReject}
          onReturn={handleReturn}
          onAssignAccountCode={handleAssignAccountCode}
          onGeneratePoliza={handleGenerateEvent}
          acting={acting}
          actionError={actionError}
          accountCodeDraft={accountCodeDraft}
          onAccountCodeChange={setAccountCodeDraft}
          onSaveAccountCode={handleSaveAccountCode}
          onClearAccountCode={handleClearAccountCode}
          accountCodeSaving={accountCodeSaving}
          accountCodeError={accountCodeError}
          polizaGenerating={polizaGenerating}
          polizaResult={polizaResult}
          polizaError={polizaError}
          expenseBlockers={expenseBlockers}
          allocationSummary={allocationSummary}
          allocRows={allocRows}
          onAllocRowChange={setAllocRows}
          projects={projects}
          clients={clients}
          costCenters={costCenters}
          allocSaving={allocSaving}
          allocSaveError={allocSaveError}
          onSaveAllocation={handleSaveAllocation}
          exportBundleBuilding={exportBundleBuilding}
          exportBundleResult={exportBundleResult}
          exportBundleError={exportBundleError}
          onBuildExportBundle={handleBuildExportBundle}
          triage={triage}
          linkedDocs={linkedDocs}
        />
      }
      aiPanel={
        <AICopilotRail expenseContext={selected ? {
          status: selected.status,
          detected_category: selected.detected_category,
          account_code: selected.account_code,
          description: selected.description,
        } : null}>
          <AiPanel portalConfig={portalConfig} expense={selected} />
        </AICopilotRail>
      }
    />
  );
}
