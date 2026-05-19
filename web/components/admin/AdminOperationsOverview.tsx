"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  FileText, CheckCircle2, Clock, AlertTriangle, ArrowRight,
  Loader2, ChevronDown, ChevronRight, Package, Shield, XCircle,
} from "lucide-react";
import { apiCall } from "@/lib/api/client";

interface OpsData {
  total_expenses: number;
  total_amount: number;
  by_status: Record<string, { count: number; amount: number }>;
  verified_unreported: { count: number; amount: number };
  in_reports: { count: number; amount: number };
  this_month: {
    created: { count: number; amount: number };
    approved: { count: number; amount: number };
  };
  cfdi: { verified: number; mismatch: number; missing: number };
}

interface Props {
  companyId: number;
}

const STATUS_ORDER = ["draft", "submitted", "manager_approved", "approved", "rejected"];
const STATUS_LABELS: Record<string, string> = {
  draft: "Borrador",
  
  submitted: "Enviado",
  manager_approved: "Aprob. Gerente",
  approved: "Aprobado",
  rejected: "Rechazado",
};
const STATUS_TONES: Record<string, string> = {
  draft: "text-muted",
  submitted: "text-blue-400",
  manager_approved: "text-amber-400",
  approved: "text-success",
  rejected: "text-error",
};

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

function Metric({ label, value, sub, tone = "default" }: { label: string; value: string; sub?: string; tone?: string }) {
  const toneMap: Record<string, string> = {
    default: "border-default bg-surface-1",
    success: "border-emerald-500/15 bg-emerald-500/[0.03]",
    warning: "border-amber-500/15 bg-amber-500/[0.03]",
    error: "border-red-500/15 bg-red-500/[0.03]",
    info: "border-blue-500/15 bg-blue-500/[0.03]",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${toneMap[tone] || toneMap.default}`}>
      <p className="text-[8px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm font-semibold text-primary mt-0.5">{value}</p>
      {sub && <p className="text-[9px] text-muted mt-0.5">{sub}</p>}
    </div>
  );
}

function PipelineRow({ status, count, amount }: { status: string; count: number; amount: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-2 px-3 py-1.5 hover:bg-surface-1/50 transition-colors">
        {expanded ? <ChevronDown className="h-3 w-3 text-muted" /> : <ChevronRight className="h-3 w-3 text-muted" />}
        <span className={`text-[9px] font-semibold ${STATUS_TONES[status] || "text-secondary"}`}>{STATUS_LABELS[status] || status}</span>
        <span className="ml-auto text-[10px] font-mono font-semibold text-primary">{count}</span>
        <span className="text-[9px] text-muted ml-2">{fmt(amount)}</span>
      </button>
      {expanded && (
        <div className="border-t border-subtle/30 px-6 py-2">
          <p className="text-[9px] text-muted">Inline detail list coming soon — click to view individual expenses in this status.</p>
        </div>
      )}
    </div>
  );
}

export default function AdminOperationsOverview({ companyId }: Props) {
  const t = useTranslations("admin.operations");
  const [data, setData] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiCall<OpsData>(`/admin/operations/${companyId}`)
      .then(setData)
      .catch((e) => setErr(e?.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [companyId]);

  if (loading && !data) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>;
  }

  if (err) {
    return <div className="flex items-center gap-2 rounded border border-error/20 bg-error/5 px-3 py-2 text-[9px] text-error"><AlertTriangle className="h-3 w-3" />{err}</div>;
  }

  if (!data) return null;

  const pendingCount = (data.by_status["submitted"]?.count ?? 0) + (data.by_status["manager_approved"]?.count ?? 0);
  const pendingAmount = (data.by_status["submitted"]?.amount ?? 0) + (data.by_status["manager_approved"]?.amount ?? 0);

  return (
    <div className="space-y-4">
      {/* Section title */}
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-accent" />
        <span className="text-[11px] font-semibold text-secondary">{t("title")}</span>
        <span className="text-[9px] text-muted">{t("subtitle")}</span>
      </div>

      {/* Top metrics row */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Metric label={t("totalExpenses")} value={String(data.total_expenses)} sub={fmt(data.total_amount)} tone="info" />
        <Metric label={t("pendingApproval")} value={String(pendingCount)} sub={fmt(pendingAmount)} tone={pendingCount > 0 ? "warning" : "success"} />
        <Metric label={t("verifiedUnreported")} value={String(data.verified_unreported.count)} sub={fmt(data.verified_unreported.amount)} tone={data.verified_unreported.count > 0 ? "warning" : "success"} />
        <Metric label={t("inReports")} value={String(data.in_reports.count)} sub={fmt(data.in_reports.amount)} tone="info" />
        <Metric label={t("monthCreated")} value={String(data.this_month.created.count)} sub={fmt(data.this_month.created.amount)} tone="info" />
      </div>

      {/* Expense Pipeline */}
      <div className="rounded-md border border-default">
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-3 w-3 text-muted" />
            <span className="text-[10px] font-semibold text-primary">{t("pipeline")}</span>
          </div>
          <span className="text-[9px] text-muted">{STATUS_ORDER.map((s) => `${STATUS_LABELS[s]}: ${data.by_status[s]?.count ?? 0}`).join(" → ")}</span>
        </div>
        {/* Visual pipeline bar */}
        <div className="px-3 py-2">
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
            {STATUS_ORDER.map((s) => {
              const count = data.by_status[s]?.count ?? 0;
              const pct = data.total_expenses > 0 ? (count / data.total_expenses) * 100 : 0;
              const colors: Record<string, string> = {
                draft: "bg-muted/40", submitted: "bg-blue-400", manager_approved: "bg-amber-400", approved: "bg-emerald-400", rejected: "bg-red-400",
              };
              return pct > 0 ? <div key={s} className={`${colors[s]} transition-all`} style={{ width: `${pct}%` }} /> : null;
            })}
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            {STATUS_ORDER.map((s) => {
              const count = data.by_status[s]?.count ?? 0;
              return (
                <div key={s} className="flex items-center gap-1">
                  <div className={`h-1.5 w-1.5 rounded-full ${STATUS_TONES[s]?.replace("text-", "bg-") || "bg-muted"}`} />
                  <span className="text-[8px] text-muted">{STATUS_LABELS[s]}</span>
                  <span className="text-[8px] font-mono font-semibold text-secondary">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
        {/* Expandable rows */}
        <div className="border-t border-subtle/50">
          {STATUS_ORDER.map((s) => (
            <PipelineRow key={s} status={s} count={data.by_status[s]?.count ?? 0} amount={data.by_status[s]?.amount ?? 0} />
          ))}
        </div>
      </div>

      {/* CFDI Status */}
      <div className="rounded-md border border-default">
        <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
          <Shield className="h-3 w-3 text-muted" />
          <span className="text-[10px] font-semibold text-primary">{t("cfdiStatus")}</span>
        </div>
        <div className="grid grid-cols-3 divide-x divide-subtle/30">
          <div className="px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1"><CheckCircle2 className="h-3 w-3 text-success" /><span className="text-[8px] text-muted uppercase">Verified</span></div>
            <p className="text-sm font-semibold text-success mt-0.5">{data.cfdi.verified}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" /><span className="text-[8px] text-muted uppercase">Mismatch</span></div>
            <p className={`text-sm font-semibold mt-0.5 ${data.cfdi.mismatch > 0 ? "text-warning" : "text-muted"}`}>{data.cfdi.mismatch}</p>
          </div>
          <div className="px-3 py-2 text-center">
            <div className="flex items-center justify-center gap-1"><XCircle className="h-3 w-3 text-error" /><span className="text-[8px] text-muted uppercase">Missing</span></div>
            <p className={`text-sm font-semibold mt-0.5 ${data.cfdi.missing > 0 ? "text-error" : "text-muted"}`}>{data.cfdi.missing}</p>
          </div>
        </div>
      </div>

      {/* This Month */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-default px-3 py-2">
          <p className="text-[8px] font-bold uppercase tracking-widest text-muted">{t("monthCreated")}</p>
          <p className="text-sm font-semibold text-primary mt-0.5">{data.this_month.created.count}</p>
          <p className="text-[9px] text-muted">{fmt(data.this_month.created.amount)}</p>
        </div>
        <div className="rounded-md border border-emerald-500/15 bg-emerald-500/[0.03] px-3 py-2">
          <p className="text-[8px] font-bold uppercase tracking-widest text-muted">{t("monthApproved")}</p>
          <p className="text-sm font-semibold text-success mt-0.5">{data.this_month.approved.count}</p>
          <p className="text-[9px] text-muted">{fmt(data.this_month.approved.amount)}</p>
        </div>
      </div>
    </div>
  );
}
