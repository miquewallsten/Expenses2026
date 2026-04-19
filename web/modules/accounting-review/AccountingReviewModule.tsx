"use client";

/**
 * AccountingReviewModule — accounting review queue inside the My Work portal.
 *
 * Layout: queue list  |  readiness + required fields + decision block.
 *
 * Deep diagnostics (classification explanation, póliza generation) and raw
 * document info are collapsed by default.  No accounting-portal-page
 * assumptions leak in — all config/identity comes from context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Clock,
  Lock,
  ReceiptText,
  XCircle,
} from "lucide-react";
import ReviewActionBar from "@/components/review/ReviewActionBar";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import {
  MODULE_IDS,
  deriveExpenseDecision,
  type ExpenseDecision,
} from "@/lib/my-work/expenseDecision";
import StatusNextAction from "@/components/my-work/StatusNextAction";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ---------------------------------------- Types 
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
}

interface AccountingActions {
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  can_assign_account_code: boolean;
  can_generate_accounting_event: boolean;
  reasons: string[];
}

interface BlockersResult {
  accounting_blockers: string[];
  poliza_blockers: string[];
  warnings: string[];
}

interface AllocationPresence {
  has_any: boolean;
  has_project: boolean;
  has_client: boolean;
  has_cost_center: boolean;
}

interface PolizaResult {
  expense_id: number;
  [key: string]: unknown;
}

// ---------------------------------------- Helpers 
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

// ---------------------------------------- Collapsible 
function Collapsible({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-white/[0.05] px-3 py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">{title}</span>
          {badge}
        </div>
        <ChevronDown className={`h-3 w-3 text-white/25 transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 py-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------- Queue list 
function QueueList({
  expenses,
  selectedId,
  onSelect,
  loading,
  summary,
}: {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
  loading: boolean;
  summary: QueueSummary | null;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden">

      {summary && summary.total_count > 0 && (
        <div className="shrink-0 border-b border-white/[0.05] bg-black/10 px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="text-[9px] font-semibold tabular-nums text-white/35">
              {summary.total_count} pending
            </span>
            <span className="font-mono text-[9px] text-white/28">
              ${summary.total_amount.toFixed(2)}
            </span>
            {Object.entries(summary.statuses).map(([s, n]) => (
              <span
                key={s}
                className={`rounded border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${statusCls(s)}`}
              >
                {n} {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-white/30">Loading…</div>
      ) : !expenses.length ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-white/22">No expenses pending accounting review.</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {expenses.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e)}
                className={`w-full border-b border-white/[0.05] px-3 py-2.5 text-left transition-colors ${
                  selectedId === e.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-white/80">{e.description}</span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-widest ${statusCls(e.status)}`}>
                    {e.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-white/35">
                    #{e.id} · {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-white/45">${e.amount.toFixed(2)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {!e.account_code && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-px text-[8px] text-amber-300/55">
                      <AlertTriangle className="h-2 w-2" /> No code
                    </span>
                  )}
                  {e.account_code && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-px text-[8px] text-white/38">
                      <Lock className="h-2 w-2 text-white/22" /> {e.account_code}
                    </span>
                  )}
                  {e.detected_category && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-px text-[8px] text-white/28">
                      <ReceiptText className="h-2 w-2 text-amber-400/35" /> {e.detected_category}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------- Readiness block 
function ReadinessBlock({ blockers, defaultOpen }: { blockers: BlockersResult; defaultOpen?: boolean }) {
  const { accounting_blockers: ab, poliza_blockers: pb, warnings: ws } = blockers;
  const allClear = ab.length === 0 && pb.length === 0 && ws.length === 0;
  const [showInfo, setShowInfo] = useState(false);

  const badge = ab.length > 0
    ? <span className="inline-flex items-center gap-0.5 rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-red-300/70"><XCircle className="h-2 w-2" /> Blocked</span>
    : pb.length > 0
    ? <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-300/70"><AlertTriangle className="h-2 w-2" /> Review</span>
    : <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300/70"><CheckCircle2 className="h-2 w-2" /> Ready</span>;

  return (
    <Collapsible title="Readiness" badge={badge} defaultOpen={defaultOpen ?? !allClear}>
      <div className="space-y-1.5">
        {allClear && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400/70" />
            <span className="text-[10px] font-semibold text-emerald-300/70">No blockers</span>
          </div>
        )}

        {/* Hard blockers — always visible */}
        {ab.length > 0 && (
          <ul className="space-y-0.5">
            {ab.map((msg, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-red-400/55" />
                <span className="text-[9px] leading-snug text-red-300/60">{msg}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Póliza blockers — visible (actionable: prevent póliza generation) */}
        {pb.length > 0 && (
          <ul className={`space-y-0.5${ab.length > 0 ? " mt-1" : ""}`}>
            {pb.map((msg, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-400/50" />
                <span className="text-[9px] leading-snug text-amber-300/55">{msg}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Advisory notices — collapsed info */}
        {ws.length > 0 && (
          <div className={ab.length > 0 || pb.length > 0 ? "mt-1" : ""}>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className="flex items-center gap-1 text-[9px] text-white/22 hover:text-white/40"
            >
              <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-150 ${showInfo ? "rotate-180" : ""}`} />
              {showInfo ? "Hide notices" : `${ws.length} notice${ws.length > 1 ? "s" : ""}`}
            </button>
            {showInfo && (
              <ul className="mt-0.5 space-y-0.5">
                {ws.map((msg, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-white/22" />
                    <span className="text-[9px] leading-snug text-white/30">{msg}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Collapsible>
  );
}

// ---------------------------------------- Required fields block 
function RequiredFields({
  expense,
  actions,
  accountCodeDraft,
  onAccountCodeChange,
  onSaveAccountCode,
  onClearAccountCode,
  codesSaving,
  codesError,
  accountingSetup,
  allocationPresence,
}: {
  expense: Expense;
  actions: AccountingActions | null;
  accountCodeDraft: string;
  onAccountCodeChange: (v: string) => void;
  onSaveAccountCode: () => void;
  onClearAccountCode: () => void;
  codesSaving: boolean;
  codesError: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accountingSetup: Record<string, any> | null;
  allocationPresence: AllocationPresence | null;
}) {
  const as = accountingSetup;
  const showProject = as?.project_required === true;
  const showClient  = as?.client_required  === true;
  const showCC      = as?.cost_center_required === true;
  const showPoliza  = as?.poliza_required === true;

  const dims: { label: string; present: boolean }[] = [];
  if (showProject) dims.push({ label: "Project",     present: allocationPresence?.has_project     ?? false });
  if (showClient)  dims.push({ label: "Client",      present: allocationPresence?.has_client      ?? false });
  if (showCC)      dims.push({ label: "Cost Center", present: allocationPresence?.has_cost_center ?? false });

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-zinc-900/70">
      <div className="border-b border-white/[0.05] px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Required fields</span>
      </div>
      <div className="space-y-2.5 px-3 py-2">

        {/* Account code */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/28">Account code</span>
            {expense.account_code
              ? <span className="font-mono text-[9px] text-emerald-300/60">{expense.account_code}</span>
              : <span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-amber-300/55">Unassigned</span>
            }
          </div>
          {actions?.can_assign_account_code && (
            <div className="flex gap-1.5">
              <input
                type="text"
                value={accountCodeDraft}
                onChange={(e) => onAccountCodeChange(e.target.value)}
                placeholder="e.g. 6010"
                disabled={codesSaving}
                className="min-w-0 flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-2 font-mono text-xs text-white/80 placeholder-white/20 outline-none transition-colors focus:border-white/[0.15] disabled:opacity-40 md:py-1"
              />
              <button
                type="button"
                onClick={onSaveAccountCode}
                disabled={codesSaving || !accountCodeDraft.trim()}
                className="shrink-0 rounded border border-sky-500/30 bg-sky-500/[0.08] px-3 text-xs font-semibold text-sky-300/70 transition-colors hover:bg-sky-500/[0.14] disabled:opacity-30 min-h-[40px] md:min-h-0 md:px-2.5 md:py-1 md:text-[10px]"
              >
                Save
              </button>
              {(expense.account_code || accountCodeDraft) && (
                <button
                  type="button"
                  onClick={onClearAccountCode}
                  disabled={codesSaving}
                  className="shrink-0 rounded border border-white/[0.07] bg-white/[0.03] px-2.5 text-xs text-white/35 transition-colors hover:bg-white/[0.06] disabled:opacity-30 min-h-[40px] md:min-h-0 md:px-2 md:py-1 md:text-[10px]"
                >
                  Clear
                </button>
              )}
            </div>
          )}
          {codesError && (
            <p className="mt-1 text-[9px] text-red-300/60">{codesError}</p>
          )}
        </div>

        {/* Allocation dimensions */}
        {dims.length > 0 && (
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/28">Allocations</p>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${dims.length}, minmax(0, 1fr))` }}
            >
              {dims.map(({ label, present }) => (
                <div
                  key={label}
                  className={`rounded border px-2 py-1.5 ${
                    present
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : "border-white/[0.05] bg-black/10"
                  }`}
                >
                  <p className="text-[8px] font-bold uppercase tracking-widest text-white/22">{label}</p>
                  <p className={`mt-0.5 text-[9px] ${present ? "text-white/45" : "italic text-white/22"}`}>
                    {present ? "Assigned" : "Missing"}
                  </p>
                  {present
                    ? <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 text-emerald-400/55" />
                    : <AlertTriangle className="mt-0.5 h-2.5 w-2.5 text-amber-400/40" />
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Póliza flag */}
        {showPoliza && (
          <div className="flex items-center gap-1.5 rounded border border-white/[0.05] bg-black/10 px-2.5 py-1.5">
            <Clock className="h-2.5 w-2.5 shrink-0 text-white/22" />
            <span className="text-[9px] text-white/35">Póliza required before export.</span>
          </div>
        )}

      </div>
    </div>
  );
}

// ---------------------------------------- Detail pane 
function AccountingDetail({
  expense,
  blockers,
  actions,
  accountCodeDraft,
  onAccountCodeChange,
  onSaveAccountCode,
  onClearAccountCode,
  codesSaving,
  codesError,
  accountingSetup,
  allocationPresence,
  acting,
  actionError,
  polizaGenerating,
  polizaResult,
  polizaError,
  onBack,
  onApprove,
  onReject,
  onReturn,
  onGeneratePoliza,
  decision,
}: {
  expense: Expense | null;
  blockers: BlockersResult | null;
  actions: AccountingActions | null;
  accountCodeDraft: string;
  onAccountCodeChange: (v: string) => void;
  onSaveAccountCode: () => void;
  onClearAccountCode: () => void;
  codesSaving: boolean;
  codesError: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  accountingSetup: Record<string, any> | null;
  allocationPresence: AllocationPresence | null;
  acting: boolean;
  actionError: string | null;
  polizaGenerating: boolean;
  polizaResult: PolizaResult | null;
  polizaError: string | null;
  onBack?: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
  onGeneratePoliza: () => void;
  decision: ExpenseDecision;
}) {
  if (!expense) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 text-[11px] text-white/40 transition-colors hover:text-white/65"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to queue
          </button>
        )}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-white/22">Select an expense to review.</p>
        </div>
      </div>
    );
  }

  const summaryRows: [string, string][] = [
    ["Description", expense.description],
    ["Amount",      `$${expense.amount.toFixed(2)}`],
    ["Category",    expense.detected_category ?? "—"],
    ["Account",     expense.account_code ?? "—"],
    ["Created",     new Date(expense.created_at).toLocaleString()],
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mobile back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 shrink-0 items-center gap-2 border-b border-white/[0.07] px-4 text-[11px] text-white/40 transition-colors hover:text-white/65"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to queue
        </button>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-xl space-y-3 pb-8">

        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold text-white">{expense.description}</h2>
          <p className="mt-0.5 text-xs text-white/35">Expense #{expense.id}</p>
        </div>

        <StatusNextAction decision={decision} />

        {/* Summary table */}
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/28">{label}</span>
              <span className="truncate text-right font-mono text-xs text-white/60">{value}</span>
            </div>
          ))}
        </div>

        {/* Readiness */}
        {decision.visibleSections.includes("readiness") && blockers && (
          <ReadinessBlock
            blockers={blockers}
            defaultOpen={decision.expandedSections.includes("readiness")}
          />
        )}

        {/* Required fields */}
        {decision.visibleSections.includes("required_fields") && (
          <RequiredFields
            expense={expense}
            actions={actions}
            accountCodeDraft={accountCodeDraft}
            onAccountCodeChange={onAccountCodeChange}
            onSaveAccountCode={onSaveAccountCode}
            onClearAccountCode={onClearAccountCode}
            codesSaving={codesSaving}
            codesError={codesError}
            accountingSetup={accountingSetup}
            allocationPresence={allocationPresence}
          />
        )}

        {/* Decision block */}
        {decision.visibleSections.includes("accounting_actions") && (
          <ReviewActionBar
            portalRole="accounting"
            actions={actions ? {
              can_approve: actions.can_approve,
              can_reject:  actions.can_reject,
              can_return:  actions.can_return,
              reasons:     actions.reasons,
            } : null}
            acting={acting}
            onApprove={onApprove}
            onReject={onReject}
            onReturn={onReturn}
          />
        )}

        {actionError && (
          <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.07] px-2.5 py-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
            <p className="text-[10px] leading-snug text-red-300/65">{actionError}</p>
          </div>
        )}

        {/* ---------------------------------------- Collapsed: deep diagnostics  */}

        {decision.visibleSections.includes("ai_category_explanation") && expense.accounting_explanation && (
          <Collapsible
            title="Classification"
            defaultOpen={decision.expandedSections.includes("ai_category_explanation")}
          >
            <div className="space-y-1">
              <p className="text-[10px] leading-snug text-white/55">{expense.accounting_explanation.category_reason}</p>
              <p className="text-[9px] leading-snug text-white/35">{expense.accounting_explanation.account_reason}</p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
                  expense.accounting_explanation.source === "learning" ? "border-indigo-500/25 bg-indigo-500/10 text-indigo-300/70"
                  : expense.accounting_explanation.source === "keyword"  ? "border-sky-500/25 bg-sky-500/10 text-sky-300/70"
                  : expense.accounting_explanation.source === "manual"   ? "border-violet-500/25 bg-violet-500/10 text-violet-300/70"
                  : "border-zinc-500/25 bg-zinc-500/10 text-zinc-400/70"
                }`}>{expense.accounting_explanation.source}</span>
                <span className={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
                  expense.accounting_explanation.confidence === "high"   ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300/70"
                  : expense.accounting_explanation.confidence === "medium" ? "border-amber-500/25 bg-amber-500/10 text-amber-300/70"
                  : "border-zinc-500/25 bg-zinc-500/10 text-zinc-400/70"
                }`}>{expense.accounting_explanation.confidence}</span>
              </div>
            </div>
          </Collapsible>
        )}

        {decision.visibleSections.includes("poliza") && (
        <Collapsible title="Póliza generation">
          <div className="space-y-2">
            {actions?.can_generate_accounting_event ? (
              <button
                type="button"
                onClick={onGeneratePoliza}
                disabled={polizaGenerating || acting}
                className="rounded border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-300/70 transition-colors hover:bg-emerald-500/[0.13] disabled:opacity-30"
              >
                {polizaGenerating ? "Generating…" : "Generate Póliza"}
              </button>
            ) : (
              <p className="text-[9px] text-white/28">
                {blockers && blockers.poliza_blockers.length > 0
                  ? blockers.poliza_blockers[0]
                  : "Not available for this expense."}
              </p>
            )}
            {polizaResult && (
              <pre className="overflow-x-auto rounded border border-white/[0.07] bg-black/30 p-2 font-mono text-[9px] leading-relaxed text-white/50 whitespace-pre-wrap break-all">
                {JSON.stringify(polizaResult, null, 2)}
              </pre>
            )}
            {polizaError && (
              <p className="text-[9px] text-red-300/60">{polizaError}</p>
            )}
          </div>
        </Collapsible>
        )}

        </div>
      </div>
    </div>
  );
}

// ---------------------------------------- Module 
export default function AccountingReviewModule() {
  const { effectiveConfig } = useMyWorkContext();
  const { userIdStr, companyId } = useUserContext();

  const uid = userIdStr ?? "1";
  const cid = companyId ?? 1;

  // ---------------------------------------- State   const [expenses,       setExpenses]       = useState<Expense[]>([]);
  const [summary,        setSummary]        = useState<QueueSummary | null>(null);
  const [selected,       setSelected]       = useState<Expense | null>(null);
  const [listLoading,    setListLoading]    = useState(true);
  const [acting,         setActing]         = useState(false);
  const [actionError,    setActionError]    = useState<string | null>(null);
  const [actions,        setActions]        = useState<AccountingActions | null>(null);
  const [blockers,       setBlockers]       = useState<BlockersResult | null>(null);
  const [allocationPresence, setAllocationPresence] = useState<AllocationPresence | null>(null);
  const [accountCodeDraft,   setAccountCodeDraft]   = useState("");
  const [codesSaving,        setCodesSaving]        = useState(false);
  const [codesError,         setCodesError]         = useState<string | null>(null);
  const [polizaGenerating,   setPolizaGenerating]   = useState(false);
  const [polizaResult,       setPolizaResult]       = useState<PolizaResult | null>(null);
  const [polizaError,        setPolizaError]        = useState<string | null>(null);

  const expensesRef = useRef<Expense[]>([]);
  expensesRef.current = expenses;

  // ---------------------------------------- Responsive layout   // showDetail tracks explicit user navigation to the detail view on mobile.
  // activeMobilePane derives from showDetail via the hook.
  const [showDetail, setShowDetail] = useState(false);
  const { isMobile, moduleIsNarrow, activeMobilePane } = useLayoutMode({
    hasDetail: showDetail,
  });

  const as = effectiveConfig?.accounting_setup as Record<string, unknown> | null ?? null;

  // ── Decision context ──────────────────────────────────────────────────────

  const decision = useMemo(() => deriveExpenseDecision({
    item:     selected,
    actions:  actions,
    blockers: blockers,
    policy:   effectiveConfig?.expense_policy ?? null,
    derived:  effectiveConfig?.derived ?? null,
    userRole: null,
    module: {
      moduleId:           MODULE_IDS.ACCOUNTING_REVIEW,
      accountingSetup:    as,
      allocationPresence: allocationPresence,
    },
  }), [selected, actions, blockers, effectiveConfig, as, allocationPresence]);

  // ---------------------------------------- Load queue 
  const loadQueue = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await fetch(`${API}/accounting/queue/${cid}`, {
        headers: { "X-User-Id": uid },
      })
        .then((r) => r.ok ? r.json() : { items: [], summary: null })
        .catch(() => ({ items: [], summary: null })) as { items: Expense[]; summary: QueueSummary };

      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setSummary(data.summary ?? null);
      if (items.length) setSelected((prev) => prev ?? items[0]);
    } finally {
      setListLoading(false);
    }
  }, [cid, uid]);

  useEffect(() => {
    if (effectiveConfig?.derived.accounting_flow_enabled) {
      loadQueue();
    } else if (effectiveConfig) {
      setListLoading(false);
    }
  }, [effectiveConfig, loadQueue]);

  // ---------------------------------------- Per-selection side-effects 
  useEffect(() => {
    if (!selected) {
      setActions(null);
      setBlockers(null);
      setAllocationPresence(null);
      setAccountCodeDraft("");
      setCodesError(null);
      setPolizaResult(null);
      setPolizaError(null);
      return;
    }
    setAccountCodeDraft(selected.account_code ?? "");
    setCodesError(null);
    setPolizaResult(null);
    setPolizaError(null);

    let cancelled = false;

    Promise.all([
      fetch(`${API}/expenses/actions/${selected.id}?portal_role=accounting`, { headers: { "X-User-Id": uid } })
        .then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/expenses/blockers/${selected.id}`, { headers: { "X-User-Id": uid } })
        .then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API}/expenses/allocations-summary/${selected.id}`, { headers: { "X-User-Id": uid } })
        .then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([a, b, alloc]) => {
      if (cancelled) return;
      setActions(a?.actions ?? null);
      setBlockers(b ?? null);
      setAllocationPresence(alloc?.presence ?? null);
    });

    return () => { cancelled = true; };
  }, [selected?.id, uid]);

  // ---------------------------------------- Post-action refresh 
  const postActionRefresh = useCallback(async (actedId: number) => {
    setListLoading(true);
    try {
      const data = await fetch(`${API}/accounting/queue/${cid}`, {
        headers: { "X-User-Id": uid },
      })
        .then((r) => r.ok ? r.json() : { items: [], summary: null })
        .catch(() => ({ items: [], summary: null })) as { items: Expense[]; summary: QueueSummary };

      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setSummary(data.summary ?? null);

      if (items.length === 0) { setSelected(null); setActions(null); return; }

      if (items.some((e) => e.id === actedId)) {
        setSelected(items.find((e) => e.id === actedId)!);
        const ar = await fetch(`${API}/expenses/actions/${actedId}?portal_role=accounting`, { headers: { "X-User-Id": uid } });
        if (ar.ok) { const ad = await ar.json(); setActions(ad?.actions ?? null); }
      } else {
        const oldIdx = expensesRef.current.findIndex((e) => e.id === actedId);
        const next   = items[oldIdx] ?? items[Math.max(0, oldIdx - 1)] ?? items[0];
        setSelected(next);
        const ar = await fetch(`${API}/expenses/actions/${next.id}?portal_role=accounting`, { headers: { "X-User-Id": uid } });
        if (ar.ok) { const ad = await ar.json(); setActions(ad?.actions ?? null); }
      }
    } finally {
      setListLoading(false);
    }
  }, [cid, uid]);

  // ---------------------------------------- Actions 
  const handleAction = useCallback(async (endpoint: string, label: string) => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(`${API}/expenses/review-actions/${selected.id}/${endpoint}`, {
        method: "POST",
        headers: { "X-User-Id": uid },
      });
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setActionError((body as { detail?: string })?.detail ?? `${label} failed (${r.status}).`);
      }
    } catch {
      setActionError("Could not reach the server.");
    } finally {
      setActing(false);
    }
  }, [selected, uid, postActionRefresh]);

  const handleSaveAccountCode = useCallback(async () => {
    if (!selected) return;
    setCodesSaving(true);
    setCodesError(null);
    try {
      const r = await fetch(`${API}/accounting/work/${selected.id}/assign-account-code`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": uid },
        body:    JSON.stringify({ account_code: accountCodeDraft }),
      });
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setCodesError((body as { detail?: string })?.detail ?? `Save failed (${r.status}).`);
      }
    } catch {
      setCodesError("Could not reach the server.");
    } finally {
      setCodesSaving(false);
    }
  }, [selected, uid, accountCodeDraft, postActionRefresh]);

  const handleClearAccountCode = useCallback(async () => {
    if (!selected) return;
    setCodesSaving(true);
    setCodesError(null);
    try {
      const r = await fetch(`${API}/accounting/work/${selected.id}/clear-account-code`, {
        method: "POST", headers: { "X-User-Id": uid },
      });
      if (r.ok) {
        setAccountCodeDraft("");
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setCodesError((body as { detail?: string })?.detail ?? `Clear failed (${r.status}).`);
      }
    } catch {
      setCodesError("Could not reach the server.");
    } finally {
      setCodesSaving(false);
    }
  }, [selected, uid, postActionRefresh]);

  const handleGeneratePoliza = useCallback(async () => {
    if (!selected) return;
    setPolizaGenerating(true);
    setPolizaResult(null);
    setPolizaError(null);
    try {
      const r = await fetch(`${API}/accounting/work/${selected.id}/generate-poliza`, {
        method: "POST", headers: { "X-User-Id": uid },
      });
      if (r.ok) {
        setPolizaResult(await r.json());
      } else {
        const body = await r.json().catch(() => ({}));
        setPolizaError((body as { detail?: string })?.detail ?? `Generation failed (${r.status}).`);
      }
    } catch {
      setPolizaError("Could not reach the server.");
    } finally {
      setPolizaGenerating(false);
    }
  }, [selected, uid]);

  // ---------------------------------------- Render 
  return (
    <div className="flex h-full overflow-hidden">

      {/* Queue list — hidden on mobile when detail is showing */}
      <div
        className={[
          moduleIsNarrow && activeMobilePane === "detail" ? "hidden" : "flex",
          isMobile ? "w-full border-b" : "w-72 border-r",
          "shrink-0 flex-col overflow-hidden border-white/[0.07]",
        ].join(" ")}
      >
        <QueueList
          expenses={expenses}
          selectedId={selected?.id ?? null}
          onSelect={(e) => { setSelected(e); setActionError(null); if (isMobile) setShowDetail(true); }}
          loading={listLoading}
          summary={summary}
        />
      </div>

      {/* Detail — hidden on mobile when list is showing */}
      <div className={`${activeMobilePane === "list" ? "hidden" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}>
        <AccountingDetail
          expense={selected}
          blockers={blockers}
          actions={actions}
          accountCodeDraft={accountCodeDraft}
          onAccountCodeChange={setAccountCodeDraft}
          onSaveAccountCode={handleSaveAccountCode}
          onClearAccountCode={handleClearAccountCode}
          codesSaving={codesSaving}
          codesError={codesError}
          accountingSetup={as}
          allocationPresence={allocationPresence}
          acting={acting}
          actionError={actionError}
          polizaGenerating={polizaGenerating}
          polizaResult={polizaResult}
          polizaError={polizaError}
          decision={decision}
          onBack={isMobile ? () => setShowDetail(false) : undefined}
          onApprove={() => handleAction("accounting-approve", "Approve")}
          onReject={() => handleAction("accounting-reject", "Reject")}
          onReturn={() => handleAction("accounting-return", "Return")}
          onGeneratePoliza={handleGeneratePoliza}
        />
      </div>

    </div>
  );
}
