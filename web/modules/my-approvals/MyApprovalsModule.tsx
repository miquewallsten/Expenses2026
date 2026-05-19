"use client";

/**
 * MyApprovalsModule — UNIFIED approval queue.
 *
 * Consolidates ALL approval types into one queue:
 *   - Expense approvals (manager queue)
 *   - Time sheet approvals (submitted weeks)
 *   - Purchase request approvals
 *   - Subcontractor invoice approvals
 *
 * Tabs at top filter by type. Each tab loads from its own API endpoint.
 * The expense detail view reuses the existing ReviewActionBar + decision flow.
 * Other types have inline approve/reject actions.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  ReceiptText, Clock, ShoppingCart, FileText, CheckSquare,
  ChevronLeft, Loader2, CheckCircle2, XCircle,
} from "lucide-react";
import ReviewActionBar from "@/components/review/ReviewActionBar";
import StatusNextAction from "@/components/my-work/StatusNextAction";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { apiCall, apiPost } from "@/lib/api/client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { statusClasses } from "@/lib/status-styles";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import {
  MODULE_IDS,
  deriveExpenseDecision,
  type ExpenseDecision,
} from "@/lib/my-work/expenseDecision";

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

interface SubmittedWeek {
  user_id: number;
  user_name: string | null;
  week_start: string;
  total_hours: string;
  entry_count: number;
  status: string;
  entry_ids: number[];
}

interface PurchaseRequest {
  id: number;
  title: string;
  status: string;
  requester_name: string | null;
  created_at: string;
  total_amount: number;
}

interface SubcontractorReport {
  id: number;
  title: string;
  status: string;
  total_net: string;
  invoice_count: number;
  created_at: string;
  subcontractor_id: number | null;
}

type ApprovalTab = "expenses" | "time" | "requests" | "subcontractors";

const TAB_CONFIG: Record<ApprovalTab, { key: string; icon: typeof ReceiptText; labelKey: string }> = {
  expenses: { key: "expenses", icon: ReceiptText, labelKey: "tabExpenses" },
  time: { key: "time", icon: Clock, labelKey: "tabTime" },
  requests: { key: "requests", icon: ShoppingCart, labelKey: "tabRequests" },
  subcontractors: { key: "subcontractors", icon: FileText, labelKey: "tabSubcontractors" },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyApprovalsModule() {
  const ctx = useMyWorkContext() as any;
  const user = useUserContext();
  const t = useTranslations("approvals");
  const tc = useTranslations("common");
  const { isMobile } = useLayoutMode();
  const companyId = user.companyId;

  const [activeTab, setActiveTab] = useState<ApprovalTab>("expenses");
  const [listLoading, setListLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState<string | null>(null);

  // ── Expense state ─────────────────────────────────────────────────────────
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selected, setSelected] = useState<Expense | null>(null);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [managerActions, setManagerActions] = useState<ManagerActions | null>(null);
  const [decision, setDecision] = useState<ExpenseDecision | null>(null);
  const [bulkIds, setBulkIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  // ── Time state ─────────────────────────────────────────────────────────────
  const [timeWeeks, setTimeWeeks] = useState<SubmittedWeek[]>([]);

  // ── Requests state ─────────────────────────────────────────────────────────
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);

  // ── Subcontractor state ────────────────────────────────────────────────────
  const [subReports, setSubReports] = useState<SubcontractorReport[]>([]);

  // ── Load data based on active tab ────────────────────────────────────────
  const loadExpenses = useCallback(async () => {
    if (!companyId) return;
    setListLoading(true);
    try {
      const data = await apiCall<{ items: Expense[]; summary: QueueSummary | null }>(
        `/manager/queue/${companyId}`
      );
      setExpenses(data.items);
      setSummary(data.summary);
    } catch (e: any) {
      console.error("Failed to load expense queue", e);
      setNetworkError(e?.message || "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo.");
    } finally {
      setListLoading(false);
    }
  }, [companyId]);

  const loadTime = useCallback(async () => {
    if (!companyId) return;
    setListLoading(true);
    try {
      const data = await apiCall<SubmittedWeek[]>(`/time/${companyId}/incoming`);
      setTimeWeeks(data);
    } catch (e: any) {
      console.error("Failed to load time entries", e);
      setNetworkError(e?.message || "No se pudo conectar con el servidor.");
    } finally {
      setListLoading(false);
    }
  }, [companyId]);

  const loadRequests = useCallback(async () => {
    if (!companyId) return;
    setListLoading(true);
    try {
      const data = await apiCall<PurchaseRequest[]>(`/requests/${companyId}/incoming`);
      setRequests(data);
    } catch (e: any) {
      console.error("Failed to load purchase requests", e);
      setNetworkError(e?.message || "No se pudo conectar con el servidor.");
    } finally {
      setListLoading(false);
    }
  }, [companyId]);

  const loadSubcontractors = useCallback(async () => {
    if (!companyId) return;
    setListLoading(true);
    try {
      const data = await apiCall<SubcontractorReport[]>(
        `/subcontractor/${companyId}/reports?status=submitted`
      );
      setSubReports(data);
    } catch (e: any) {
      console.error("Failed to load subcontractor reports", e);
      setNetworkError(e?.message || "No se pudo conectar con el servidor.");
    } finally {
      setListLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (activeTab === "expenses") loadExpenses();
    else if (activeTab === "time") loadTime();
    else if (activeTab === "requests") loadRequests();
    else if (activeTab === "subcontractors") loadSubcontractors();
  }, [activeTab, loadExpenses, loadTime, loadRequests, loadSubcontractors]);

  // ── Expense actions ────────────────────────────────────────────────────────
  const handleAction = useCallback(async (endpoint: string, _label: string) => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      await apiPost(`/expenses/review-actions/${selected.id}/${endpoint}`, { comment: "" });
      await loadExpenses();
      setSelected(null);
      setManagerActions(null);
    } catch (e: any) {
      setActionError(e?.body?.detail ?? e?.message ?? "Action failed");
    } finally {
      setActing(false);
    }
  }, [selected, loadExpenses]);

  // ── Time actions ────────────────────────────────────────────────────────────
  const handleTimeApprove = useCallback(async (week: SubmittedWeek) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiPost(`/time/${companyId}/entries/approve?reviewer_id=${user.userId}`, {
        entry_ids: week.entry_ids,
        notes: null,
      });
      await loadTime();
    } catch (e) {
      console.error("Failed to approve time", e);
    } finally {
      setActing(false);
    }
  }, [companyId, user.userId, loadTime]);

  const handleTimeReject = useCallback(async (week: SubmittedWeek) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiPost(`/time/${companyId}/entries/reject?reviewer_id=${user.userId}`, {
        entry_ids: week.entry_ids,
        rejection_reason: "Rechazado",
      });
      await loadTime();
    } catch (e) {
      console.error("Failed to reject time", e);
    } finally {
      setActing(false);
    }
  }, [companyId, user.userId, loadTime]);

  // ── Request actions ────────────────────────────────────────────────────────
  const handleRequestApprove = useCallback(async (req: PurchaseRequest) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiPost(`/requests/${companyId}/${req.id}/approve`, { notes: "" });
      await loadRequests();
    } catch (e) {
      console.error("Failed to approve request", e);
    } finally {
      setActing(false);
    }
  }, [companyId, loadRequests]);

  const handleRequestReject = useCallback(async (req: PurchaseRequest) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiPost(`/requests/${companyId}/${req.id}/reject`, { reason: "Rechazado" });
      await loadRequests();
    } catch (e) {
      console.error("Failed to reject request", e);
    } finally {
      setActing(false);
    }
  }, [companyId, loadRequests]);

  // ── Subcontractor actions ─────────────────────────────────────────────────
  const handleSubApprove = useCallback(async (report: SubcontractorReport) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiCall<SubcontractorReport>(
        `/subcontractor/${companyId}/reports/${report.id}/approve`,
        { method: "PATCH" }
      );
      await loadSubcontractors();
    } catch (e) {
      console.error("Failed to approve subcontractor report", e);
    } finally {
      setActing(false);
    }
  }, [companyId, loadSubcontractors]);

  const handleSubReject = useCallback(async (report: SubcontractorReport) => {
    if (!companyId) return;
    setActing(true);
    try {
      await apiCall<SubcontractorReport>(
        `/subcontractor/${companyId}/reports/${report.id}/reject?reason=Rechazado`,
        { method: "PATCH" }
      );
      await loadSubcontractors();
    } catch (e) {
      console.error("Failed to reject subcontractor report", e);
    } finally {
      setActing(false);
    }
  }, [companyId, loadSubcontractors]);

  // ── Count badges ──────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => ({
    expenses: expenses.length,
    time: timeWeeks.length,
    requests: requests.length,
    subcontractors: subReports.length,
  }), [expenses, timeWeeks, requests, subReports]);

  const totalCount = tabCounts.expenses + tabCounts.time + tabCounts.requests + tabCounts.subcontractors;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-default px-4 py-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-primary">{t("title")}</h2>
          {totalCount > 0 && (
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              {totalCount}
            </span>
          )}
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex border-b border-default bg-surface-0">
        {(Object.keys(TAB_CONFIG) as ApprovalTab[]).map((tab) => {
          const cfg = TAB_CONFIG[tab];
          const count = tabCounts[tab];
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => { setActiveTab(tab); setActionError(null); setNetworkError(null); }}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-[11px] font-medium transition-colors ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-secondary"
              }`}
            >
              <cfg.icon className="h-3.5 w-3.5" />
              {t(cfg.labelKey)}
              {count > 0 && (
                <span className="rounded-full bg-surface-2 px-1.5 py-px text-[9px] font-bold tabular-nums">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {listLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : activeTab === "expenses" ? (
          <ExpenseQueueList
            expenses={expenses}
            selectedId={selected?.id ?? null}
            onSelect={(e) => { setSelected(e); if (isMobile) setShowDetail(true); }}
          />
        ) : activeTab === "time" ? (
          <TimeQueueList
            weeks={timeWeeks}
            onApprove={handleTimeApprove}
            onReject={handleTimeReject}
            acting={acting}
          />
        ) : activeTab === "requests" ? (
          <RequestQueueList
            requests={requests}
            onApprove={handleRequestApprove}
            onReject={handleRequestReject}
            acting={acting}
          />
        ) : (
          <SubcontractorQueueList
            reports={subReports}
            onApprove={handleSubApprove}
            onReject={handleSubReject}
            acting={acting}
          />
        )}
      </div>

      {/* ── Network error ──────────────────────────────────────────────────────── */}
      {networkError && (
        <div className="shrink-0 border-t border-error/20 bg-error/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-error shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-error">No se pudo conectar con el servidor</p>
              <p className="text-[9px] text-error/70 mt-0.5">Verifica tu conexión e intenta de nuevo. Si el problema persiste, contacta al administrador.</p>
            </div>
            <button
              type="button"
              onClick={() => { setNetworkError(null); }}
              className="shrink-0 rounded-md border border-error/20 bg-error/10 px-2 py-1 text-[9px] font-medium text-error hover:bg-error/20"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      {/* ── Action error ────────────────────────────────────────────────────── */}
      {actionError && (
        <div className="shrink-0 border-t border-default bg-error/5 px-4 py-2">
          <p className="text-[10px] text-error">{actionError}</p>
        </div>
      )}
    </div>
  );
}

// ── Expense Queue List ────────────────────────────────────────────────────────

function ExpenseQueueList({
  expenses,
  selectedId,
  onSelect,
}: {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
}) {
  const t = useTranslations("manager");

  if (!expenses.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <CheckSquare className="mb-2 h-8 w-8 text-muted" />
        <p className="text-[11px] text-tertiary">{t("queueEmpty")}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-subtle">
      {expenses.map((e) => {
        const isSel = e.id === selectedId;
        const cls = statusClasses(e.status);
        return (
          <li key={e.id}>
            <button
              type="button"
              onClick={() => onSelect(e)}
              className={`w-full text-left px-3 py-2 transition-colors ${
                isSel ? "bg-accent/5 ring-1 ring-inset ring-accent/15" : "hover:bg-surface-1"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-[11px] font-medium ${isSel ? "text-primary" : "text-secondary"}`}>
                  {e.description || `Gasto #${e.id}`}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] font-semibold text-primary">
                  ${Number(e.amount).toFixed(2)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${cls}`}>
                  {e.status}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ── Time Queue List ────────────────────────────────────────────────────────────

function TimeQueueList({
  weeks,
  onApprove,
  onReject,
  acting,
}: {
  weeks: SubmittedWeek[];
  onApprove: (w: SubmittedWeek) => Promise<void>;
  onReject: (w: SubmittedWeek) => Promise<void>;
  acting: boolean;
}) {
  const t = useTranslations("approvals");

  if (!weeks.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="mb-2 h-8 w-8 text-muted" />
        <p className="text-[11px] text-tertiary">{t("noTimePending")}</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-subtle">
      {weeks.map((w) => (
        <li key={`${w.user_id}-${w.week_start}`} className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-medium text-primary">{w.user_name || `Usuario ${w.user_id}`}</span>
              <div className="mt-0.5 text-[9px] text-tertiary">
                Semana del {new Date(w.week_start + "T00:00:00").toLocaleDateString("es-MX", { month: "short", day: "numeric" })}
                {" · "}{Number(w.total_hours).toFixed(1)}h
                {" · "}{w.entry_count} {w.entry_count === 1 ? "entrada" : "entradas"}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onApprove(w)}
                disabled={acting}
                className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
              >
                <CheckCircle2 className="h-2.5 w-2.5" />
                {t("approve")}
              </button>
              <button
                type="button"
                onClick={() => onReject(w)}
                disabled={acting}
                className="inline-flex items-center gap-0.5 rounded bg-error/10 px-1.5 py-0.5 text-[9px] font-semibold text-error hover:bg-error/20 disabled:opacity-40"
              >
                <XCircle className="h-2.5 w-2.5" />
                {t("reject")}
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Request Queue List ─────────────────────────────────────────────────────────

function RequestQueueList({
  requests,
  onApprove,
  onReject,
  acting,
}: {
  requests: PurchaseRequest[];
  onApprove: (r: PurchaseRequest) => Promise<void>;
  onReject: (r: PurchaseRequest) => Promise<void>;
  acting: boolean;
}) {
  const t = useTranslations("approvals");

  if (!requests.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ShoppingCart className="mb-2 h-8 w-8 text-muted" />
        <p className="text-[11px] text-tertiary">{t("noRequestsPending")}</p>
      </div>
    );
  }

  const STATUS_PILL: Record<string, string> = {
    draft: "bg-surface-2 text-secondary",
    submitted: "bg-sky-500/10 text-sky-400",
    in_review: "bg-amber-500/10 text-amber-400",
    approved: "bg-emerald-500/10 text-emerald-400",
    rejected: "bg-error/10 text-error",
    cancelled: "bg-surface-2 text-muted",
  };

  return (
    <ul className="divide-y divide-subtle">
      {requests.map((r) => (
        <li key={r.id} className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-primary truncate block">{r.title}</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_PILL[r.status] ?? STATUS_PILL.draft}`}>
                  {r.status}
                </span>
                {r.requester_name && (
                  <span className="text-[9px] text-tertiary">{r.requester_name}</span>
                )}
              </div>
            </div>
            {r.status === "submitted" && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onApprove(r)}
                  disabled={acting}
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {t("approve")}
                </button>
                <button
                  type="button"
                  onClick={() => onReject(r)}
                  disabled={acting}
                  className="inline-flex items-center gap-0.5 rounded bg-error/10 px-1.5 py-0.5 text-[9px] font-semibold text-error hover:bg-error/20 disabled:opacity-40"
                >
                  <XCircle className="h-2.5 w-2.5" />
                  {t("reject")}
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Subcontractor Queue List ──────────────────────────────────────────────────

function SubcontractorQueueList({
  reports,
  onApprove,
  onReject,
  acting,
}: {
  reports: SubcontractorReport[];
  onApprove: (r: SubcontractorReport) => Promise<void>;
  onReject: (r: SubcontractorReport) => Promise<void>;
  acting: boolean;
}) {
  const t = useTranslations("approvals");

  if (!reports.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="mb-2 h-8 w-8 text-muted" />
        <p className="text-[11px] text-tertiary">{t("noSubcontractorPending")}</p>
      </div>
    );
  }

  const STATUS_PILL: Record<string, string> = {
    draft: "bg-surface-2 text-secondary",
    submitted: "bg-sky-500/10 text-sky-400",
    validated: "bg-indigo-500/10 text-indigo-400",
    manager_approved: "bg-violet-500/10 text-violet-400",
    paid: "bg-emerald-500/10 text-emerald-400",
    rejected: "bg-error/10 text-error",
  };

  const STATUS_LABEL: Record<string, string> = {
    draft: "Borrador", submitted: "Enviado", validated: "Validado",
    manager_approved: "Aprobado", paid: "Pagado", rejected: "Rechazado",
  };

  return (
    <ul className="divide-y divide-subtle">
      {reports.map((r) => (
        <li key={r.id} className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <span className="text-[11px] font-medium text-primary truncate block">{r.title}</span>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_PILL[r.status] ?? STATUS_PILL.submitted}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
                <span className="text-[9px] text-muted">{r.invoice_count} {r.invoice_count === 1 ? "factura" : "facturas"}</span>
              </div>
            </div>
            {r.status === "submitted" && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onApprove(r)}
                  disabled={acting}
                  className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  {t("approve")}
                </button>
                <button
                  type="button"
                  onClick={() => onReject(r)}
                  disabled={acting}
                  className="inline-flex items-center gap-0.5 rounded bg-error/10 px-1.5 py-0.5 text-[9px] font-semibold text-error hover:bg-error/20 disabled:opacity-40"
                >
                  <XCircle className="h-2.5 w-2.5" />
                  {t("reject")}
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
