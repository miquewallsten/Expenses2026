"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/shell/AppShell";
import AICopilotRail from "@/components/shell/AICopilotRail";
import PortalPolicySummary from "@/components/shell/PortalPolicySummary";
import { getCurrentRole, getCurrentUserId, getCurrentCompanyId } from "@/lib/session";
import { buildGlobalNav, GlobalNavItem } from "@/lib/navigation";
import { ShieldAlert, CheckCircle2, Lock, ReceiptText } from "lucide-react";
import ReviewActionBar from "@/components/review/ReviewActionBar";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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
  flagged_count: number;
}

interface ManagerActions {
  can_approve: boolean;
  can_reject: boolean;
  can_return: boolean;
  reasons: string[];
}

const STATUS_CLS: Record<string, string> = {
  draft:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  submitted: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  approved:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  rejected:  "bg-red-500/15 text-red-300 border-red-500/30",
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

function QueueSummaryBar({ summary }: { summary: QueueSummary | null }) {
  if (!summary || summary.total_count === 0) return null;
  const statusEntries = Object.entries(summary.statuses);
  return (
    <div className="shrink-0 border-b border-white/[0.05] bg-black/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[9px] font-semibold tabular-nums text-white/35">
          {summary.total_count} item{summary.total_count !== 1 ? "s" : ""}
        </span>
        <span className="font-mono text-[9px] text-white/28">
          ${summary.total_amount.toFixed(2)}
        </span>
        {statusEntries.map(([s, n]) => (
          <span key={s} className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${statusCls(s)}`}>
            {n} {s}
          </span>
        ))}
      </div>
    </div>
  );
}

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
  const as = portalConfig?.approval_setup as Record<string, unknown> | undefined;
  const approvalMode = typeof as?.approval_mode === "string" ? as.approval_mode : null;
  const guidanceLine =
    approvalMode === "manager_then_accounting"
      ? "Manager approvals are the first review stage before accounting."
      : approvalMode === "manager_only"
      ? "Manager approval is the final review stage for this workflow."
      : null;
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-2">
        <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Queue</p>
        {guidanceLine && (
          <p className="mt-0.5 text-[9px] leading-snug text-white/28">{guidanceLine}</p>
        )}
      </div>
      <QueueSummaryBar summary={summary} />
      {loading ? (
        <div className="px-4 py-6 text-center text-xs text-white/30">Loading…</div>
      ) : !expenses.length ? (
        <div className="px-4 py-6 text-center text-xs text-white/25">No expenses pending review.</div>
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
                {e.detected_category && (
                  <div className="mt-1 flex items-center gap-1">
                    <ReceiptText className="h-2.5 w-2.5 shrink-0 text-amber-400/40" />
                    <span className="text-[8px] text-amber-300/50">{e.detected_category}</span>
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {portalConfig?.derived && (
        <div className="mx-3 mt-3 shrink-0 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-white/18">Workflow</p>
          <p className="text-[9px] leading-snug text-white/28">
            {portalConfig.derived.workflow_mode === "manager_then_accounting"
              ? "Expenses route to manager, then accounting."
              : portalConfig.derived.workflow_mode === "manager_only"
              ? "Expenses route to manager only."
              : `Mode: ${portalConfig.derived.workflow_mode}`}
          </p>
          {portalConfig.derived.accounting_flow_enabled && (
            <p className="mt-0.5 text-[9px] leading-snug text-white/20">Accounting review follows your decision.</p>
          )}
        </div>
      )}
      {as?.approval_mode && as.approval_mode !== "none" && (
        <div className="mx-3 mt-2 mb-3 shrink-0 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
          <p className="mb-0.5 text-[8px] font-bold uppercase tracking-widest text-white/18">Mode</p>
          <p className="text-[9px] leading-snug text-white/28">
            {as.approval_mode === "manager_only" ? "Manager approval only."
             : as.approval_mode === "manager_then_accounting" ? "Manager, then accounting."
             : as.approval_mode === "threshold_based" ? "Threshold-based routing."
             : String(as.approval_mode)}
          </p>
        </div>
      )}
    </div>
  );
}

function ExpenseDetail({
  expense,
  onApprove,
  onReject,
  onReturn,
  acting,
  portalConfig,
  summary,
  managerActions,
  actionError,
}: {
  expense: Expense | null;
  onApprove: () => void;
  onReject: () => void;
  onReturn: () => void;
  acting: boolean;
  portalConfig: PortalConfig | null;
  summary: QueueSummary | null;
  managerActions: ManagerActions | null;
  actionError: string | null;
}) {
  const as = portalConfig?.approval_setup as Record<string, unknown> | undefined;
  if (!expense) {
    return (
      <div className="space-y-2 pb-8">
        <PortalPolicySummary portalConfig={portalConfig} portalType="manager" />
        {summary && summary.total_count > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
            <span className="text-[9px] text-white/28">
              <span className="font-semibold uppercase tracking-widest text-white/22">Queue </span>
              {summary.total_count} pending · ${summary.total_amount.toFixed(2)} total
            </span>
          </div>
        )}
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-white/20">Select an expense to review.</p>
        </div>
      </div>
    );
  }
  const modeLabels: Record<string, string> = {
    manager_only: "Manager approval only.",
    accounting_only: "Accounting review only.",
    manager_then_accounting: "Manager review, then accounting.",
    threshold_based: "Threshold-based routing.",
    none: "No approval routing configured.",
  };
  const modeLabel = typeof as?.approval_mode === "string"
    ? (modeLabels[as.approval_mode] ?? as.approval_mode)
    : null;
  const rows: [string, string][] = [
    ["Description", expense.description],
    ["Amount", `$${expense.amount.toFixed(2)} MXN`],
    ["Status", expense.status],
    ["Category", expense.detected_category ?? "—"],
    ["Account Code", expense.account_code ?? "—"],
    ["Report ID", expense.report_id != null ? String(expense.report_id) : "—"],
    ["Created", new Date(expense.created_at).toLocaleString()],
  ];
  return (
    <div className="space-y-2 pb-8">
      <PortalPolicySummary portalConfig={portalConfig} portalType="manager" />
      {modeLabel && (
        <div className="flex items-center gap-1.5 rounded border border-white/[0.05] bg-white/[0.02] px-2.5 py-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-white/18" />
          <p className="text-[9px] text-white/28">
            <span className="font-semibold uppercase tracking-widest text-white/22">Routing </span>
            {modeLabel}
            {as?.allow_resubmission_after_rejection === true && " Employees may resubmit after rejection."}
          </p>
        </div>
      )}
      <div className="max-w-lg space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">{expense.description}</h2>
            <p className="mt-0.5 text-xs text-white/35">Expense #{expense.id}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${statusCls(expense.status)}`}>
            {expense.status}
          </span>
        </div>
        <div className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-black/20">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</span>
              <span className="truncate text-right font-mono text-xs text-white/65">{value}</span>
            </div>
          ))}
        </div>
        <ReviewActionBar
          portalRole="manager"
          actions={managerActions}
          acting={acting}
          onApprove={onApprove}
          onReject={onReject}
          onReturn={onReturn}
        />
        {actionError && (
          <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.07] px-2.5 py-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400/60" />
            <p className="text-[10px] leading-snug text-red-300/65">{actionError}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AiPanel({ expense }: { expense: Expense | null }) {
  const hints: Record<string, string> = {
    submitted: "Awaiting your approval. Review amount, category, and account code before deciding.",
    approved: "Already approved and queued for accounting.",
    rejected: "Rejected. The employee will need to correct and resubmit.",
    draft: "Still in draft. Not yet submitted for review.",
  };
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">Review Guidance</div>
        {expense ? (
          <p className="text-xs leading-relaxed text-white/50">{hints[expense.status] ?? "Review this expense before taking action."}</p>
        ) : (
          <p className="text-xs text-white/35">Select an expense to see guidance.</p>
        )}
      </div>
      {expense?.detected_category && (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">Detected Category</div>
          <p className="text-xs text-white/50">
            Classified as <span className="font-medium text-white/70">{expense.detected_category}</span>.
            Verify against your approval policy before approving.
          </p>
        </div>
      )}
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-white/25">Approval Checklist</div>
        <ul className="space-y-1.5">
          {["Amount is within policy limits", "Category matches description", "Account code correctly assigned", "Fiscal document (XML/CFDI) attached"].map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-white/40">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function ManagerPage() {
  const [portalConfig, setPortalConfig]     = useState<PortalConfig | null>(null);
  const [configLoading, setConfigLoading]   = useState(true);
  const [expenses, setExpenses]             = useState<Expense[]>([]);
  const [queueSummary, setQueueSummary]     = useState<QueueSummary | null>(null);
  const [selected, setSelected]             = useState<Expense | null>(null);
  const [expLoading, setExpLoading]         = useState(false);
  const [acting, setActing]                 = useState(false);
  const [actionError, setActionError]       = useState<string | null>(null);
  const [managerActions, setManagerActions] = useState<ManagerActions | null>(null);
  const [globalNavItems, setGlobalNavItems] = useState<GlobalNavItem[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);

  useEffect(() => {
    const userId = getCurrentUserId();
    if (!userId) return;
    fetch(`${API}/roles/user-permissions/${userId}`)
      .then((r) => r.ok ? r.json() : { permission_keys: [] })
      .catch(() => ({ permission_keys: [] }))
      .then((d) => setPermissionKeys(d.permission_keys ?? []));
  }, []);

  useEffect(() => {
    const companyId = getCurrentCompanyId() ?? "1";
    setConfigLoading(true);
    fetch(`${API}/admin/portal-config/${companyId}`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((cfg) => { if (cfg) setPortalConfig(cfg); })
      .finally(() => setConfigLoading(false));
  }, []);

  useEffect(() => {
    const role = getCurrentRole();
    const enabledModules = portalConfig?.derived.enabled_modules ?? [];
    setGlobalNavItems(buildGlobalNav({ role, enabledModuleKeys: enabledModules, permissionKeys, currentPortal: "manager" }));
  }, [portalConfig, permissionKeys]);

  useEffect(() => {
    if (!selected) { setManagerActions(null); return; }
    fetch(`${API}/expenses/actions/${selected.id}?portal_role=manager`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setManagerActions(data?.actions ?? null))
      .catch(() => setManagerActions(null));
  }, [selected?.id]);

  const loadExpenses = useCallback(() => {
    const companyId = getCurrentCompanyId() ?? "1";
    setExpLoading(true);
    fetch(`${API}/manager/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : { items: [], summary: null })
      .then((data: { items: Expense[]; summary: QueueSummary }) => {
        setExpenses(data.items ?? []);
        setQueueSummary(data.summary ?? null);
        if (data.items?.length) setSelected((prev) => prev ?? data.items[0]);
      })
      .catch(() => {})
      .finally(() => setExpLoading(false));
  }, []);

  useEffect(() => {
    if (!configLoading && portalConfig?.derived.manager_flow_enabled) {
      loadExpenses();
    }
  }, [configLoading, portalConfig, loadExpenses]);

  // After a successful action: re-fetch the queue, keep item if still present,
  // otherwise advance to the neighbour that occupied the same row position.
  const postActionRefresh = useCallback(async (actedId: number) => {
    const companyId = getCurrentCompanyId() ?? "1";
    setExpLoading(true);
    try {
      const data = await fetch(`${API}/manager/queue/${companyId}`, { headers: { "X-User-Id": "1" } })
        .then((r) => r.ok ? r.json() : { items: [], summary: null })
        .catch(() => ({ items: [], summary: null })) as { items: Expense[]; summary: QueueSummary };
      const items: Expense[] = data.items ?? [];
      setExpenses(items);
      setQueueSummary(data.summary ?? null);
      if (items.some((e) => e.id === actedId)) {
        // Item stayed in queue (e.g. returned-to-draft still visible) — refresh in-place.
        const updated = items.find((e) => e.id === actedId)!;
        setSelected(updated);
        const ar = await fetch(`${API}/expenses/actions/${actedId}?portal_role=manager`, { headers: { "X-User-Id": "1" } });
        if (ar.ok) { const ad = await ar.json(); setManagerActions(ad?.actions ?? null); }
      } else if (items.length === 0) {
        setSelected(null);
        setManagerActions(null);
      } else {
        // Item left the queue — advance to the item that was in the same row position.
        const oldIndex = expenses.findIndex((e) => e.id === actedId);
        const nextItem = items[oldIndex] ?? items[Math.max(0, oldIndex - 1)] ?? items[0];
        setSelected(nextItem);
        const ar = await fetch(`${API}/expenses/actions/${nextItem.id}?portal_role=manager`, { headers: { "X-User-Id": "1" } });
        if (ar.ok) { const ad = await ar.json(); setManagerActions(ad?.actions ?? null); }
      }
    } finally {
      setExpLoading(false);
    }
  }, [expenses]);

  const handleApprove = async () => {
    if (!selected) return;
    setActing(true);
    setActionError(null);
    try {
      const r = await fetch(
        `${API}/expenses/review-actions/${selected.id}/manager-approve`,
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
        `${API}/expenses/review-actions/${selected.id}/manager-reject`,
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
        `${API}/expenses/review-actions/${selected.id}/manager-return`,
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

  if (configLoading) {
    return (
      <AppShell title="Manager" globalNavItems={globalNavItems} workListTitle="Queue"
        workList={<Centered><p className="text-xs text-white/22">Loading…</p></Centered>}
        detail={<Centered><p className="text-xs text-white/22">Loading configuration…</p></Centered>}
        aiPanel={<AICopilotRail><AiPanel expense={null} /></AICopilotRail>}
      />
    );
  }

  if (portalConfig && !portalConfig.derived.manager_flow_enabled) {
    return (
      <AppShell title="Manager" globalNavItems={globalNavItems} workListTitle="Queue"
        workList={
          <Centered>
            <Lock className="mx-auto mb-2 h-5 w-5 text-white/12" />
            <p className="text-xs text-white/22">Manager review is not enabled.</p>
          </Centered>
        }
        detail={
          <div className="space-y-2 pb-8">
            <PortalPolicySummary portalConfig={portalConfig} portalType="manager" />
            <div className="flex items-start gap-3 pt-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.03]">
                <ShieldAlert className="h-4 w-4 text-white/18" />
              </div>
              <div>
                <p className="text-[12px] font-medium text-white/30">Manager review not active</p>
                <p className="mt-0.5 text-[11px] text-white/18">
                  The current workflow does not route expenses through manager approval.
                  Contact your administrator if this is unexpected.
                </p>
              </div>
            </div>
            {(() => {
              const wf  = portalConfig?.workflow_setup  as Record<string, unknown> | undefined;
              const ap  = portalConfig?.approval_setup  as Record<string, unknown> | undefined;
              const der = portalConfig?.derived;
              if (!wf && !ap) return null;
              const wfMode  = typeof wf?.default_expense_workflow_mode === "string"
                ? wf.default_expense_workflow_mode.replace(/_/g, " ") : null;
              const apMode  = typeof ap?.approval_mode === "string"
                ? ap.approval_mode.replace(/_/g, " ") : null;
              const rows: [string, string | null][] = [
                ["Workflow mode",   wfMode],
                ["Approval mode",   apMode],
                ["Accounting review", der?.accounting_flow_enabled === true ? "Enabled" : "Disabled"],
                ["Route policy failures",
                  typeof wf?.route_policy_failures_to === "string" && wf.route_policy_failures_to !== "none"
                    ? (wf.route_policy_failures_to as string).replace(/_/g, " ") : "None"],
              ].filter(([, v]) => v != null) as [string, string][];
              if (!rows.length) return null;
              return (
                <div className="mt-4 max-w-sm overflow-hidden rounded-lg border border-white/[0.07]">
                  <div className="border-b border-white/[0.05] bg-black/20 px-3 py-1.5">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">Configured flow</p>
                  </div>
                  {rows.map(([label, val]) => (
                    <div key={label} className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2 last:border-0">
                      <span className="text-[10px] text-white/30">{label}</span>
                      <span className="text-[10px] font-medium capitalize text-white/45">{val}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        }
        aiPanel={<AICopilotRail><AiPanel expense={null} /></AICopilotRail>}
      />
    );
  }

  return (
    <AppShell title="Manager" globalNavItems={globalNavItems} workListTitle="Queue"
      workList={
        <WorkList
          expenses={expenses}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          loading={expLoading}
          portalConfig={portalConfig}
          summary={queueSummary}
        />
      }
      detail={
        <ExpenseDetail
          expense={selected}
          onApprove={handleApprove}
          onReject={handleReject}
          onReturn={handleReturn}
          acting={acting}
          portalConfig={portalConfig}
          summary={queueSummary}
          managerActions={managerActions}
          actionError={actionError}
        />
      }
      aiPanel={
        <AICopilotRail expenseContext={selected ? {
          status: selected.status,
          detected_category: selected.detected_category,
          account_code: selected.account_code,
          description: selected.description,
        } : null}>
          <AiPanel expense={selected} />
        </AICopilotRail>
      }
    />
  );
}
