"use client";

/**
 * AccountingReviewModule - accounting review queue inside the My Work portal.
 *
 * Layout: queue list  |  readiness + required fields + decision block.
 *
 * Deep diagnostics (classification explanation, póliza generation) and raw
 * document info are collapsed by default.  No accounting-portal-page
 * assumptions leak in - all config/identity comes from context.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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
import { apiCall, apiPost } from "@/lib/api/client";
import { statusClasses } from "@/lib/status-styles";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import {
  MODULE_IDS,
  deriveExpenseDecision,
  type ExpenseDecision,
} from "@/lib/my-work/expenseDecision";
import StatusNextAction from "@/components/my-work/StatusNextAction";

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
// status styles via statusClasses() from @/lib/status-styles

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
    <div className="overflow-hidden rounded-lg border border-default bg-surface-1/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-b border-subtle px-3 py-1.5 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{title}</span>
          {badge}
        </div>
        <ChevronDown className={`h-3 w-3 text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
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
  const ta = useTranslations("accounting");
  const tc = useTranslations("common");
  const tm = useTranslations("manager");

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {summary && summary.total_count > 0 && (
        <div className="shrink-0 border-b border-subtle bg-black/10 px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="text-[9px] font-semibold tabular-nums text-muted">
              {tm("queuePending", { count: summary.total_count })}
            </span>
            <span className="font-mono text-[9px] text-muted">
              ${summary.total_amount.toFixed(2)}
            </span>
            {Object.entries(summary.statuses).map(([s, n]) => (
              <span
                key={s}
                className={`rounded border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${statusClasses(s)}`}
              >
                {n} {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-muted">{tc("loading")}</div>
      ) : !expenses.length ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted">{ta("queueEmpty")}</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {expenses.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e)}
                className={`w-full border-b border-subtle px-3 py-2.5 text-left transition-colors ${
                  selectedId === e.id ? "bg-surface-2" : "hover:bg-surface-1"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-medium text-secondary">{e.description}</span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-px text-[8px] font-bold uppercase tracking-widest ${statusClasses(e.status)}`}>
                    {e.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-muted">
                    #{e.id} · {new Date(e.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="shrink-0 font-mono text-[9px] text-tertiary">${e.amount.toFixed(2)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {!e.account_code && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/20 bg-amber-500/[0.05] px-1.5 py-px text-[8px] text-warning/55">
                      <AlertTriangle className="h-2 w-2" /> {ta("noCode")}
                    </span>
                  )}
                  {e.account_code && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-default bg-surface-1 px-1.5 py-px text-[8px] text-muted">
                      <Lock className="h-2 w-2 text-muted" /> {e.account_code}
                    </span>
                  )}
                  {e.detected_category && (
                    <span className="inline-flex items-center gap-0.5 rounded border border-default bg-surface-1 px-1.5 py-px text-[8px] text-muted">
                      <ReceiptText className="h-2 w-2 text-warning/35" /> {e.detected_category}
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
  const ta = useTranslations("accounting");

  const badge = ab.length > 0
    ? <span className="inline-flex items-center gap-0.5 rounded border border-red-500/25 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-error/70"><XCircle className="h-2 w-2" /> {ta("readinessBlocked")}</span>
    : pb.length > 0
    ? <span className="inline-flex items-center gap-0.5 rounded border border-amber-500/25 bg-warning-muted px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-warning/70"><AlertTriangle className="h-2 w-2" /> {ta("readinessReview")}</span>
    : <span className="inline-flex items-center gap-0.5 rounded border border-emerald-500/25 bg-success-muted px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-emerald-300/70"><CheckCircle2 className="h-2 w-2" /> {ta("readinessReady")}</span>;

  return (
    <Collapsible title={ta("readiness")} badge={badge} defaultOpen={defaultOpen ?? !allClear}>
      <div className="space-y-1.5">
        {allClear && (
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-success/70" />
            <span className="text-[10px] font-semibold text-emerald-300/70">{ta("noBlockers")}</span>
          </div>
        )}

        {/* Hard blockers - always visible */}
        {ab.length > 0 && (
          <ul className="space-y-0.5">
            {ab.map((msg, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <XCircle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-error/55" />
                <span className="text-[9px] leading-snug text-error/60">{msg}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Póliza blockers - visible (actionable: prevent póliza generation) */}
        {pb.length > 0 && (
          <ul className={`space-y-0.5${ab.length > 0 ? " mt-1" : ""}`}>
            {pb.map((msg, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-warning/50" />
                <span className="text-[9px] leading-snug text-warning/55">{msg}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Advisory notices - collapsed info */}
        {ws.length > 0 && (
          <div className={ab.length > 0 || pb.length > 0 ? "mt-1" : ""}>
            <button
              type="button"
              onClick={() => setShowInfo((v) => !v)}
              className="flex items-center gap-1 text-[9px] text-muted hover:text-tertiary"
            >
              <ChevronDown className={`h-2.5 w-2.5 transition-transform duration-150 ${showInfo ? "rotate-180" : ""}`} />
              {showInfo ? ta("hideNotices") : ta("noticeCount", { count: ws.length })}
            </button>
            {showInfo && (
              <ul className="mt-0.5 space-y-0.5">
                {ws.map((msg, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-surface-2" />
                    <span className="text-[9px] leading-snug text-muted">{msg}</span>
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
  const ta = useTranslations("accounting");
  const tc = useTranslations("common");

  const as = accountingSetup;
  const showProject = as?.project_required === true;
  const showClient  = as?.client_required  === true;
  const showCC      = as?.cost_center_required === true;
  const showPoliza  = as?.poliza_required === true;

  const dims: { key: string; label: string; present: boolean }[] = [];
  if (showProject) dims.push({ key: "project",    label: ta("dimensions.project"),    present: allocationPresence?.has_project     ?? false });
  if (showClient)  dims.push({ key: "client",     label: ta("dimensions.client"),     present: allocationPresence?.has_client      ?? false });
  if (showCC)      dims.push({ key: "costCenter", label: ta("dimensions.costCenter"), present: allocationPresence?.has_cost_center ?? false });

  return (
    <div className="overflow-hidden rounded-lg border border-default bg-surface-1/70">
      <div className="border-b border-subtle px-3 py-1.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{ta("requiredFields")}</span>
      </div>
      <div className="space-y-2.5 px-3 py-2">

        {/* Account code */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{ta("accountCode")}</span>
            {expense.account_code
              ? <span className="font-mono text-[9px] text-emerald-300/60">{expense.account_code}</span>
              : <span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider text-warning/55">{ta("unassigned")}</span>
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
                className="min-w-0 flex-1 rounded border border-default bg-surface-2 px-2 py-2 font-mono text-xs text-secondary placeholder-white/20 outline-none transition-colors focus:border-default disabled:opacity-40 md:py-1"
              />
              <button
                type="button"
                onClick={onSaveAccountCode}
                disabled={codesSaving || !accountCodeDraft.trim()}
                className="shrink-0 rounded border border-sky-500/30 bg-accent/[0.08] px-3 text-xs font-semibold text-accent/70 transition-colors hover:bg-accent/[0.14] disabled:opacity-30 min-h-[40px] md:min-h-0 md:px-2.5 md:py-1 md:text-[10px]"
              >
                {tc("save")}
              </button>
              {(expense.account_code || accountCodeDraft) && (
                <button
                  type="button"
                  onClick={onClearAccountCode}
                  disabled={codesSaving}
                  className="shrink-0 rounded border border-default bg-surface-1 px-2.5 text-xs text-muted transition-colors hover:bg-surface-3 disabled:opacity-30 min-h-[40px] md:min-h-0 md:px-2 md:py-1 md:text-[10px]"
                >
                  {tc("clear")}
                </button>
              )}
            </div>
          )}
          {codesError && (
            <p className="mt-1 text-[9px] text-error/60">{codesError}</p>
          )}
        </div>

        {/* Allocation dimensions */}
        {dims.length > 0 && (
          <div>
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted">{ta("allocations")}</p>
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(${dims.length}, minmax(0, 1fr))` }}
            >
              {dims.map(({ key, label, present }) => (
                <div
                  key={key}
                  className={`rounded border px-2 py-1.5 ${
                    present
                      ? "border-emerald-500/20 bg-emerald-500/[0.04]"
                      : "border-subtle bg-black/10"
                  }`}
                >
                  <p className="text-[8px] font-bold uppercase tracking-widest text-muted">{label}</p>
                  <p className={`mt-0.5 text-[9px] ${present ? "text-tertiary" : "italic text-muted"}`}>
                    {present ? tc("assigned") : ta("missing")}
                  </p>
                  {present
                    ? <CheckCircle2 className="mt-0.5 h-2.5 w-2.5 text-success/55" />
                    : <AlertTriangle className="mt-0.5 h-2.5 w-2.5 text-warning/40" />
                  }
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Póliza flag */}
        {showPoliza && (
          <div className="flex items-center gap-1.5 rounded border border-subtle bg-black/10 px-2.5 py-1.5">
            <Clock className="h-2.5 w-2.5 shrink-0 text-muted" />
            <span className="text-[9px] text-muted">{ta("polizaRequiredNote")}</span>
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
  const ta = useTranslations("accounting");
  const tm = useTranslations("manager");

  if (!expense) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-4 text-[11px] text-tertiary transition-colors hover:text-secondary"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {tm("backToQueue")}
          </button>
        )}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted">{tm("selectExpense")}</p>
        </div>
      </div>
    );
  }

  const summaryRows: [string, string][] = [
    [tm("fields.description"), expense.description],
    [tm("fields.amount"),      `$${expense.amount.toFixed(2)}`],
    [tm("fields.category"),    expense.detected_category ?? " - "],
    [ta("account"),            expense.account_code ?? " - "],
    [tm("fields.created"),     new Date(expense.created_at).toLocaleString()],
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Mobile back button */}
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 shrink-0 items-center gap-2 border-b border-default px-4 text-[11px] text-tertiary transition-colors hover:text-secondary"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {tm("backToQueue")}
        </button>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-xl space-y-3 pb-8">

        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold text-primary">{expense.description}</h2>
          <p className="mt-0.5 text-xs text-muted">{tm("expenseTitle", { id: expense.id })}</p>
        </div>

        <StatusNextAction decision={decision} />

        {/* Summary table */}
        <div className="divide-y divide-subtle overflow-hidden rounded-xl border border-default bg-black/20">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-muted">{label}</span>
              <span className="truncate text-right font-mono text-xs text-secondary">{value}</span>
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
            <p className="text-[10px] leading-snug text-error/65">{actionError}</p>
          </div>
        )}

        {/* ---------------------------------------- Collapsed: deep diagnostics  */}

        {decision.visibleSections.includes("ai_category_explanation") && expense.accounting_explanation && (
          <Collapsible
            title={ta("classification")}
            defaultOpen={decision.expandedSections.includes("ai_category_explanation")}
          >
            <div className="space-y-1">
              <p className="text-[10px] leading-snug text-tertiary">{expense.accounting_explanation.category_reason}</p>
              <p className="text-[9px] leading-snug text-muted">{expense.accounting_explanation.account_reason}</p>
              <div className="flex items-center gap-1.5 pt-0.5">
                <span className={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
                  expense.accounting_explanation.source === "learning" ? "bg-accent-muted-muted bg-accent-muted text-accent/70"
                  : expense.accounting_explanation.source === "keyword"  ? "border-sky-500/25 bg-accent/10 text-accent/70"
                  : expense.accounting_explanation.source === "manual"   ? "border-violet-500/25 bg-violet-500/10 text-violet-300/70"
                  : "border-subtle bg-surface-2 text-tertiary"
                }`}>{expense.accounting_explanation.source}</span>
                <span className={`rounded border px-1.5 py-px text-[8px] font-bold uppercase tracking-wider ${
                  expense.accounting_explanation.confidence === "high"   ? "border-emerald-500/25 bg-success-muted text-emerald-300/70"
                  : expense.accounting_explanation.confidence === "medium" ? "border-amber-500/25 bg-warning-muted text-warning/70"
                  : "border-subtle bg-surface-2 text-tertiary"
                }`}>{expense.accounting_explanation.confidence}</span>
              </div>
            </div>
          </Collapsible>
        )}

        {decision.visibleSections.includes("poliza") && (
        <Collapsible title={ta("polizaGeneration")}>
          <div className="space-y-2">
            {actions?.can_generate_accounting_event ? (
              <button
                type="button"
                onClick={onGeneratePoliza}
                disabled={polizaGenerating || acting}
                className="rounded border border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 py-1 text-[10px] font-semibold text-emerald-300/70 transition-colors hover:bg-emerald-500/[0.13] disabled:opacity-30"
              >
                {polizaGenerating ? ta("generating") : ta("generatePoliza")}
              </button>
            ) : (
              <p className="text-[9px] text-muted">
                {blockers && blockers.poliza_blockers.length > 0
                  ? blockers.poliza_blockers[0]
                  : ta("polizaNotAvailable")}
              </p>
            )}
            {polizaResult && (
              <pre className="overflow-x-auto rounded border border-default bg-black/30 p-2 font-mono text-[9px] leading-relaxed text-secondary whitespace-pre-wrap break-all">
                {JSON.stringify(polizaResult, null, 2)}
              </pre>
            )}
            {polizaError && (
              <p className="text-[9px] text-error/60">{polizaError}</p>
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
  const { companyId } = useUserContext();
  const tm = useTranslations("manager");

  const cid = companyId ?? 1;

  // ---------------------------------------- State
  const [expenses,       setExpenses]       = useState<Expense[]>([]);
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
      const data = await apiCall<{ items: Expense[]; summary: QueueSummary | null }>(`/accounting/queue/${cid}`)
        .catch(() => ({ items: [], summary: null }));

      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setSummary(data.summary ?? null);
      if (items.length) setSelected((prev) => prev ?? items[0]);
    } finally {
      setListLoading(false);
    }
  }, [cid]);

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
      apiCall<{ actions: AccountingActions } | null>(`/expenses/actions/${selected.id}?portal_role=accounting`).catch(() => null),
      apiCall<BlockersResult | null>(`/expenses/blockers/${selected.id}`).catch(() => null),
      apiCall<{ presence: AllocationPresence } | null>(`/expenses/allocations-summary/${selected.id}`).catch(() => null),
    ]).then(([a, b, alloc]) => {
      if (cancelled) return;
      setActions(a?.actions ?? null);
      setBlockers(b ?? null);
      setAllocationPresence(alloc?.presence ?? null);
    });

    return () => { cancelled = true; };
  }, [selected?.id]);

  // ---------------------------------------- Post-action refresh
  const postActionRefresh = useCallback(async (actedId: number) => {
    setListLoading(true);
    try {
      const data = await apiCall<{ items: Expense[]; summary: QueueSummary | null }>(`/accounting/queue/${cid}`)
        .catch(() => ({ items: [], summary: null }));

      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setSummary(data.summary ?? null);

      if (items.length === 0) { setSelected(null); setActions(null); return; }

      if (items.some((e) => e.id === actedId)) {
        setSelected(items.find((e) => e.id === actedId)!);
        const ad = await apiCall<{ actions: AccountingActions } | null>(`/expenses/actions/${actedId}?portal_role=accounting`).catch(() => null);
        setActions(ad?.actions ?? null);
      } else {
        const oldIdx = expensesRef.current.findIndex((e) => e.id === actedId);
        const next   = items[oldIdx] ?? items[Math.max(0, oldIdx - 1)] ?? items[0];
        setSelected(next);
        const ad = await apiCall<{ actions: AccountingActions } | null>(`/expenses/actions/${next.id}?portal_role=accounting`).catch(() => null);
        setActions(ad?.actions ?? null);
      }
    } finally {
      setListLoading(false);
    }
  }, [cid]);

  // ---------------------------------------- Actions
  const handleAction = useCallback(async (endpoint: string, label: string) => {
    if (!selected) return;
    // Phase 4.5: prompt for a rejection/return comment so the reviewer's
    // reason is captured. Backend enforces a 10-char minimum on rejection.
    const isReject = endpoint === "accounting-reject";
    const isReturn = endpoint === "accounting-return";
    let comment: string | null = null;
    if (isReject || isReturn) {
      const raw = window.prompt(tm(isReject ? "bulk.rejectPrompt" : "bulk.returnPrompt"));
      if (raw === null) return;
      comment = raw.trim() || null;
      if (isReject && !comment) {
        setActionError(tm("bulk.commentRequired"));
        return;
      }
    }
    setActing(true);
    setActionError(null);
    try {
      if (comment != null) {
        await apiPost(`/expenses/review-actions/${selected.id}/${endpoint}`, { comment });
      } else {
        await apiPost(`/expenses/review-actions/${selected.id}/${endpoint}`);
      }
      await postActionRefresh(selected.id);
    } catch (e) {
      const err = e as { body?: { detail?: string }; message?: string };
      setActionError(err?.body?.detail ?? err?.message ?? `${label} failed.`);
    } finally {
      setActing(false);
    }
  }, [selected, postActionRefresh, tm]);

  const handleSaveAccountCode = useCallback(async () => {
    if (!selected) return;
    setCodesSaving(true);
    setCodesError(null);
    try {
      await apiPost(`/accounting/work/${selected.id}/assign-account-code`, { account_code: accountCodeDraft });
      await postActionRefresh(selected.id);
    } catch (e) {
      const err = e as { body?: { detail?: string }; message?: string };
      setCodesError(err?.body?.detail ?? err?.message ?? "Save failed.");
    } finally {
      setCodesSaving(false);
    }
  }, [selected, accountCodeDraft, postActionRefresh]);

  const handleClearAccountCode = useCallback(async () => {
    if (!selected) return;
    setCodesSaving(true);
    setCodesError(null);
    try {
      await apiPost(`/accounting/work/${selected.id}/clear-account-code`);
      setAccountCodeDraft("");
      await postActionRefresh(selected.id);
    } catch (e) {
      const err = e as { body?: { detail?: string }; message?: string };
      setCodesError(err?.body?.detail ?? err?.message ?? "Clear failed.");
    } finally {
      setCodesSaving(false);
    }
  }, [selected, postActionRefresh]);

  const handleGeneratePoliza = useCallback(async () => {
    if (!selected) return;
    setPolizaGenerating(true);
    setPolizaResult(null);
    setPolizaError(null);
    try {
      const result = await apiPost<PolizaResult>(`/accounting/work/${selected.id}/generate-poliza`);
      setPolizaResult(result);
    } catch (e) {
      const err = e as { body?: { detail?: string }; message?: string };
      setPolizaError(err?.body?.detail ?? err?.message ?? "Generation failed.");
    } finally {
      setPolizaGenerating(false);
    }
  }, [selected]);

  // ---------------------------------------- Render 
  return (
    <div className="flex h-full overflow-hidden">

      {/* Queue list - hidden on mobile when detail is showing */}
      <div
        className={[
          moduleIsNarrow && activeMobilePane === "detail" ? "hidden" : "flex",
          isMobile ? "w-full border-b" : "w-72 border-r",
          "shrink-0 flex-col overflow-hidden border-default",
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

      {/* Detail - hidden on mobile when list is showing */}
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
