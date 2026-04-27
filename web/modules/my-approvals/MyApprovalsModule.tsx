"use client";

/**
 * MyApprovalsModule — manager approval queue inside the My Work portal.
 *
 * Layout: list (queue) | detail (summary + decision block).
 * All identity / config comes from context — no portal-specific page assumptions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, ChevronLeft, ReceiptText, Loader2 } from "lucide-react";
import ReviewActionBar from "@/components/review/ReviewActionBar";
import StatusNextAction from "@/components/my-work/StatusNextAction";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { getAuthHeaders } from "@/lib/session";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import {
  MODULE_IDS,
  deriveExpenseDecision,
  type ExpenseDecision,
} from "@/lib/my-work/expenseDecision";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  report_id: number | null;
  created_at: string;
}

interface QueueSummary {
  total_count: number;
  total_amount: number;
  statuses: Record<string, number>;
}

interface ManagerActions {
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  reasons: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  draft:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  submitted: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  approved:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:  "bg-red-500/15 text-red-300 border-red-500/30",
};
function statusCls(s: string) {
  return STATUS_CLS[s] ?? "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";
}

// ── Queue list ─────────────────────────────────────────────────────────────────

function QueueList({
  expenses,
  selectedId,
  onSelect,
  loading,
  summary,
  bulkIds,
  onToggleBulk,
  onToggleAll,
}: {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
  loading: boolean;
  summary: QueueSummary | null;
  bulkIds: Set<number>;
  onToggleBulk: (id: number) => void;
  onToggleAll: (ids: number[]) => void;
}) {
  const t = useTranslations("manager");
  const tc = useTranslations("common");

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Summary strip */}
      {summary && summary.total_count > 0 && (
        <div className="shrink-0 border-b border-white/[0.05] bg-black/10 px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="text-[9px] font-semibold tabular-nums text-white/35">
              {t("queuePending", { count: summary.total_count })}
            </span>
            <span className="font-mono text-[9px] text-white/28">
              ${summary.total_amount.toFixed(2)}
            </span>
            {Object.entries(summary.statuses).map(([s, n]) => (
              <span key={s} className={`rounded border px-1.5 py-px text-[8px] font-semibold uppercase tracking-wider ${statusCls(s)}`}>
                {n} {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-white/30">{tc("loading")}</div>
      ) : !expenses.length ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-white/22">{t("queueEmpty")}</p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto">
          {expenses.length > 0 && (
            <li className="flex items-center gap-2 border-b border-white/[0.05] bg-black/10 px-3 py-1.5">
              <input
                type="checkbox"
                aria-label={t("bulk.selectAll")}
                checked={bulkIds.size > 0 && bulkIds.size === expenses.length}
                ref={(el) => {
                  if (el) el.indeterminate = bulkIds.size > 0 && bulkIds.size < expenses.length;
                }}
                onChange={() => onToggleAll(expenses.map((e) => e.id))}
                className="h-3 w-3 cursor-pointer accent-indigo-500"
              />
              <span className="text-[9px] uppercase tracking-widest text-white/30">
                {bulkIds.size > 0 ? t("bulk.selectedCount", { count: bulkIds.size }) : t("bulk.selectAll")}
              </span>
            </li>
          )}
          {expenses.map((e) => (
            <li key={e.id} className="flex items-stretch">
              <label
                className={`flex shrink-0 cursor-pointer items-center border-b border-white/[0.05] pl-3 pr-1 ${
                  bulkIds.has(e.id) ? "bg-indigo-500/[0.08]" : ""
                }`}
                onClick={(ev) => ev.stopPropagation()}
              >
                <input
                  type="checkbox"
                  checked={bulkIds.has(e.id)}
                  onChange={() => onToggleBulk(e.id)}
                  className="h-3 w-3 cursor-pointer accent-indigo-500"
                  aria-label={t("bulk.selectRow", { id: e.id })}
                />
              </label>
              <button
                type="button"
                onClick={() => onSelect(e)}
                className={`flex-1 border-b border-white/[0.05] px-3 py-2.5 text-left transition-colors ${
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
                {e.detected_category && (
                  <div className="mt-0.5 flex items-center gap-1">
                    <ReceiptText className="h-2.5 w-2.5 shrink-0 text-amber-400/40" />
                    <span className="text-[8px] text-amber-300/50">{e.detected_category}</span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Detail + decision panel ────────────────────────────────────────────────────

function ApprovalDetail({
  expense,
  managerActions,
  acting,
  actionError,
  decision,
  onBack,
  onApprove,
  onReject,
  onReturn,
}: {
  expense: Expense | null;
  managerActions: ManagerActions | null;
  acting: boolean;
  actionError: string | null;
  decision: ExpenseDecision;
  onBack?: () => void;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
}) {
  const t = useTranslations("manager");

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
            {t("backToQueue")}
          </button>
        )}
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-white/22">{t("selectExpense")}</p>
        </div>
      </div>
    );
  }

  const { visibleSections } = decision;
  const rows: [string, string][] = [
    [t("fields.description"), expense.description],
    [t("fields.amount"),      `$${expense.amount.toFixed(2)}`],
    [t("fields.created"),     new Date(expense.created_at).toLocaleString()],
    ...(visibleSections.includes("category_detail")     ? [[t("fields.category"),    expense.detected_category ?? "—"] as [string, string]] : []),
    ...(visibleSections.includes("account_code_detail") ? [[t("fields.accountCode"), expense.account_code       ?? "—"] as [string, string]] : []),
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
          {t("backToQueue")}
        </button>
      )}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="max-w-lg space-y-4">

        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold text-white">{expense.description}</h2>
          <p className="mt-0.5 text-xs text-white/35">{t("expenseTitle", { id: expense.id })}</p>
        </div>

        <StatusNextAction decision={decision} />

        {/* Summary table */}
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/28">{label}</span>
              <span className="truncate text-right font-mono text-xs text-white/60">{value}</span>
            </div>
          ))}
        </div>

        {/* Decision block */}
        {visibleSections.includes("approval_actions") && (
          <ReviewActionBar
            portalRole="manager"
            actions={managerActions}
            acting={acting}
            onApprove={onApprove}
            onReject={onReject}
            onReturn={onReturn}
          />
        )}

        {/* Inline error */}
        {actionError && (
          <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.07] px-2.5 py-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
            <p className="text-[10px] leading-snug text-red-300/65">{actionError}</p>
          </div>
        )}

        </div>
      </div>
    </div>
  );
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function MyApprovalsModule() {
  const { effectiveConfig } = useMyWorkContext();
  const { companyId } = useUserContext();
  const t = useTranslations("manager");

  const [expenses,       setExpenses]       = useState<Expense[]>([]);
  const [summary,        setSummary]        = useState<QueueSummary | null>(null);
  const [selected,       setSelected]       = useState<Expense | null>(null);
  const [listLoading,    setListLoading]    = useState(true);
  const [acting,         setActing]         = useState(false);
  const [actionError,    setActionError]    = useState<string | null>(null);
  const [managerActions, setManagerActions] = useState<ManagerActions | null>(null);

  // ── Bulk-select state ─────────────────────────────────────────────────────
  const [bulkIds, setBulkIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const expensesRef = useRef<Expense[]>([]);
  expensesRef.current = expenses;

  // ── Responsive layout ──────────────────────────────────────────────────────────────
  // showDetail tracks whether the user has explicitly navigated to the detail
  // view on mobile (the queue auto-selects items so selected !== null is not
  // sufficient).  activeMobilePane derives from showDetail via the hook.
  const [showDetail, setShowDetail] = useState(false);
  const { isMobile, moduleIsNarrow, activeMobilePane } = useLayoutMode({
    hasDetail: showDetail,
  });

  const cid = companyId ?? 1;

  // ── Decision context ──────────────────────────────────────────────────────

  const decision = useMemo(() => deriveExpenseDecision({
    item:     selected,
    actions:  managerActions,
    blockers: null,
    policy:   effectiveConfig?.expense_policy ?? null,
    derived:  effectiveConfig?.derived ?? null,
    userRole: null,
    module: {
      moduleId:           MODULE_IDS.MY_APPROVALS,
      accountingSetup:    null,
      allocationPresence: null,
    },
  }), [selected, managerActions, effectiveConfig]);

  // ── Load queue ─────────────────────────────────────────────────────────────

  const loadQueue = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await fetch(`${API}/manager/queue/${cid}`, {
        headers: { ...getAuthHeaders() },
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
  }, [cid]);

  useEffect(() => {
    if (effectiveConfig?.derived.manager_flow_enabled) {
      loadQueue();
    } else if (effectiveConfig) {
      // Config loaded but manager flow off — show empty state without loading.
      setListLoading(false);
    }
  }, [effectiveConfig, loadQueue]);

  // ── Fetch available actions for selected expense ───────────────────────────

  useEffect(() => {
    if (!selected) { setManagerActions(null); return; }
    let cancelled = false;
    fetch(`${API}/expenses/actions/${selected.id}?portal_role=manager`, {
      headers: { ...getAuthHeaders() },
    })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) setManagerActions(d?.actions ?? null); })
      .catch(() => { if (!cancelled) setManagerActions(null); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  // ── Post-action refresh ────────────────────────────────────────────────────
  //
  // After approve/reject/return: re-fetch queue.  If the acted item left the
  // queue, advance to the neighbour that was in the same row position.

  const postActionRefresh = useCallback(async (actedId: number) => {
    setListLoading(true);
    try {
      const data = await fetch(`${API}/manager/queue/${cid}`, {
        headers: { ...getAuthHeaders() },
      })
        .then((r) => r.ok ? r.json() : { items: [], summary: null })
        .catch(() => ({ items: [], summary: null })) as { items: Expense[]; summary: QueueSummary };

      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setSummary(data.summary ?? null);

      if (items.length === 0) {
        setSelected(null);
        setManagerActions(null);
        return;
      }

      if (items.some((e) => e.id === actedId)) {
        // Still in queue (returned-to-draft, etc.) — refresh in-place.
        setSelected(items.find((e) => e.id === actedId)!);
        const ar = await fetch(`${API}/expenses/actions/${actedId}?portal_role=manager`, {
          headers: { ...getAuthHeaders() },
        });
        if (ar.ok) { const ad = await ar.json(); setManagerActions(ad?.actions ?? null); }
      } else {
        // Left the queue — advance to the neighbour.
        const oldIdx = expensesRef.current.findIndex((e) => e.id === actedId);
        const next   = items[oldIdx] ?? items[Math.max(0, oldIdx - 1)] ?? items[0];
        setSelected(next);
        const ar = await fetch(`${API}/expenses/actions/${next.id}?portal_role=manager`, {
          headers: { ...getAuthHeaders() },
        });
        if (ar.ok) { const ad = await ar.json(); setManagerActions(ad?.actions ?? null); }
      }
    } finally {
      setListLoading(false);
    }
  }, [cid]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleAction = useCallback(async (endpoint: string, label: string) => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(`${API}/expenses/review-actions/${selected.id}/${endpoint}`, {
        method: "POST",
        headers: { ...getAuthHeaders() },
      });
      if (r.ok) {
        await postActionRefresh(selected.id);
      } else {
        const body = await r.json().catch(() => ({}));
        setActionError((body as { detail?: string })?.detail ?? `${label} failed (${r.status}).`);
      }
    } catch {
      setActionError(t("serverError"));
    } finally {
      setActing(false);
    }
  }, [selected, postActionRefresh]);

  // ── Bulk handlers ──────────────────────────────────────────────────────────

  const toggleBulk = useCallback((id: number) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: number[]) => {
    setBulkIds((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
  }, []);

  const runBulk = useCallback(
    async (action: "manager_approve" | "manager_reject" | "manager_return") => {
      if (bulkIds.size === 0) return;
      let comment: string | null = null;
      if (action === "manager_reject" || action === "manager_return") {
        comment = window.prompt(
          action === "manager_reject" ? t("bulk.rejectPrompt") : t("bulk.returnPrompt"),
        );
        if (comment === null) return; // user cancelled
        comment = comment.trim() || null;
        if (action === "manager_reject" && !comment) {
          setBulkError(t("bulk.commentRequired"));
          return;
        }
      }
      setBulkBusy(true);
      setBulkError(null);
      try {
        const r = await fetch(`${API}/expenses/review-actions/bulk-transition`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            expense_ids: Array.from(bulkIds),
            comment,
          }),
        });
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { detail?: string };
          setBulkError(body.detail ?? `Bulk action failed (${r.status})`);
          return;
        }
        const data = (await r.json()) as {
          succeeded: number;
          failed: number;
          results: { expense_id: number; ok: boolean; error?: string }[];
        };
        if (data.failed > 0) {
          const firstErr = data.results.find((x) => !x.ok)?.error;
          setBulkError(
            t("bulk.partialFailure", { ok: data.succeeded, failed: data.failed }) +
              (firstErr ? ` — ${firstErr}` : ""),
          );
        }
        setBulkIds(new Set());
        await loadQueue();
      } catch {
        setBulkError(t("serverError"));
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkIds, loadQueue, t],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
        {bulkIds.size > 0 && (
          <div className="shrink-0 border-b border-indigo-500/20 bg-indigo-500/[0.06] px-2.5 py-1.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-300/80">
                {t("bulk.selectedCount", { count: bulkIds.size })}
              </span>
              <button
                type="button"
                onClick={() => setBulkIds(new Set())}
                disabled={bulkBusy}
                className="text-[9px] text-white/40 hover:text-white/65 disabled:opacity-40"
              >
                {t("bulk.clear")}
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => runBulk("manager_approve")}
                disabled={bulkBusy}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.08] px-2 py-1 text-[10px] font-semibold text-emerald-300/80 hover:bg-emerald-500/[0.14] disabled:opacity-40"
              >
                {bulkBusy && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                {t("bulk.approve")}
              </button>
              <button
                type="button"
                onClick={() => runBulk("manager_return")}
                disabled={bulkBusy}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-amber-500/25 bg-amber-500/[0.08] px-2 py-1 text-[10px] font-semibold text-amber-300/80 hover:bg-amber-500/[0.14] disabled:opacity-40"
              >
                {t("bulk.return")}
              </button>
              <button
                type="button"
                onClick={() => runBulk("manager_reject")}
                disabled={bulkBusy}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-red-500/25 bg-red-500/[0.08] px-2 py-1 text-[10px] font-semibold text-red-300/80 hover:bg-red-500/[0.14] disabled:opacity-40"
              >
                {t("bulk.reject")}
              </button>
            </div>
            {bulkError && (
              <p className="mt-1 text-[9px] leading-snug text-red-300/70">{bulkError}</p>
            )}
          </div>
        )}
        <QueueList
          expenses={expenses}
          selectedId={selected?.id ?? null}
          onSelect={(e) => { setSelected(e); setActionError(null); if (isMobile) setShowDetail(true); }}
          loading={listLoading}
          summary={summary}
          bulkIds={bulkIds}
          onToggleBulk={toggleBulk}
          onToggleAll={toggleAll}
        />
      </div>

      {/* Detail + decision — hidden on mobile when list is showing */}
      <div className={`${activeMobilePane === "list" ? "hidden" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}>
        <ApprovalDetail
          expense={selected}
          managerActions={managerActions}
          acting={acting}
          actionError={actionError}
          decision={decision}
          onBack={isMobile ? () => setShowDetail(false) : undefined}
          onApprove={() => handleAction("manager-approve", "Approve")}
          onReject={() => handleAction("manager-reject", "Reject")}
          onReturn={() => handleAction("manager-return", "Return")}
        />
      </div>

    </div>
  );
}
