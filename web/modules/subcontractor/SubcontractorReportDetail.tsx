"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ChevronLeft, Plus, Send, Loader2, FileText, CheckCircle2, XCircle, AlertTriangle, Clock,
} from "lucide-react";
import type { Report } from "./SubcontractorReportList";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Invoice {
  id: number;
  report_id: number;
  amount: string;
  isr_retention: string;
  iva_retention: string;
  subtotal: string;
  iva_amount: string;
  description: string | null;
  invoice_date: string | null;
  series: string | null;
  folio: string | null;
  uuid: string | null;
  sat_status: string | null;
  status: string;
  created_at: string;
}

export interface InvoiceCreateData {
  amount: number;
  description?: string;
  series?: string;
  folio?: string;
  invoice_date?: string;
  isr_retention?: number;
  iva_retention?: number;
}

export interface SubcontractorReportDetailProps {
  report: Report | null;
  invoices: Invoice[];
  onAddInvoice: (data: InvoiceCreateData) => Promise<void>;
  onSubmitReport: () => Promise<void>;
  onBack: () => void;
  loading?: boolean;
}

// ── Status pill ───────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  draft:              "bg-surface-2 text-secondary border border-default",
  submitted:           "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  validated:           "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20",
  manager_approved:    "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  accounting_approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  paid:                "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  rejected:            "bg-error/10 text-error border border-error/20",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  submitted: "Enviado",
  validated: "Validado",
  manager_approved: "Aprobado",
  accounting_approved: "Contabilidad",
  paid: "Pagado",
  rejected: "Rechazado",
};

const SAT_STATUS: Record<string, { icon: typeof CheckCircle2; color: string }> = {
  valid: { icon: CheckCircle2, color: "text-emerald-400" },
  invalid: { icon: XCircle, color: "text-error" },
  not_checked: { icon: Clock, color: "text-muted" },
  cancelled: { icon: AlertTriangle, color: "text-amber-400" },
};

const AMOUNT_FMT = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? AMOUNT_FMT.format(v) : "0.00";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubcontractorReportDetail({
  report,
  invoices,
  onAddInvoice,
  onSubmitReport,
  onBack,
  loading,
}: SubcontractorReportDetailProps) {
  const t = useTranslations("subcontractor");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<InvoiceCreateData>({
    amount: 0,
    description: "",
    series: "",
    folio: "",
    invoice_date: "",
    isr_retention: 0,
    iva_retention: 0,
  });

  if (!report) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px] text-muted">{t("selectReport")}</p>
      </div>
    );
  }

  const canSubmit = report.status === "draft" && invoices.length > 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try { await onSubmitReport(); } finally { setSubmitting(false); }
  };

  const handleAdd = async () => {
    if (!form.amount || form.amount <= 0) return;
    setAdding(true);
    try {
      await onAddInvoice({
        ...form,
        amount: form.amount,
        isr_retention: form.isr_retention ?? 0,
        iva_retention: form.iva_retention ?? 0,
      });
      setForm({ amount: 0, description: "", series: "", folio: "", invoice_date: "", isr_retention: 0, iva_retention: 0 });
      setShowForm(false);
    } finally {
      setAdding(false);
    }
  };

  const statusPill = STATUS_PILL[report.status] ?? STATUS_PILL.draft;
  const statusLabel = STATUS_LABEL[report.status] ?? report.status;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-default px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="mb-2 flex items-center gap-1 text-[10px] text-muted hover:text-primary transition-colors"
        >
          <ChevronLeft className="h-3 w-3" />
          {t("backToList")}
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-primary truncate">{report.title}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${statusPill}`}>
                {statusLabel}
              </span>
              {report.period_start && (
                <span className="text-[9px] text-tertiary">
                  {new Date(report.period_start).toLocaleDateString("es-MX", { month: "short", day: "numeric" })}
                  {report.period_end && (
                    <> - {new Date(report.period_end).toLocaleDateString("es-MX", { month: "short", day: "numeric" })}</>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] text-muted uppercase tracking-widest">{t("netTotal")}</p>
            <p className="text-lg font-bold text-primary tabular-nums">${fmt(report.total_net)}</p>
          </div>
        </div>

        {/* ── Totals strip ──────────────────────────────────────────────── */}
        <div className="mt-2 flex gap-4 text-[9px] text-tertiary">
          <span>Subtotal: <span className="font-medium text-secondary">${fmt(report.total_amount)}</span></span>
          <span>ISR: <span className="font-medium text-secondary">${fmt(report.total_isr_retention)}</span></span>
          <span>IVA: <span className="font-medium text-secondary">${fmt(report.total_iva_retention)}</span></span>
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-2 border-b border-default px-4 py-2">
        {report.status === "draft" && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] font-medium text-secondary hover:text-primary transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("addInvoice")}
          </button>
        )}
        {canSubmit && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {t("submitReport")}
          </button>
        )}
      </div>

      {/* ── Add invoice form ────────────────────────────────────────────── */}
      {showForm && (
        <div className="shrink-0 border-b border-default bg-surface-1 px-4 py-3 space-y-2">
          <p className="text-[10px] font-semibold text-secondary">{t("newInvoice")}</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="text-[9px] text-muted">{t("amount")} *</label>
              <input
                type="number"
                value={form.amount || ""}
                onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted">{t("series")}</label>
              <input
                type="text"
                value={form.series}
                onChange={(e) => setForm({ ...form, series: e.target.value })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
                placeholder="A"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted">{t("folio")}</label>
              <input
                type="text"
                value={form.folio}
                onChange={(e) => setForm({ ...form, folio: e.target.value })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
                placeholder="123"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[9px] text-muted">{t("invoiceDate")}</label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted">ISR</label>
              <input
                type="number"
                value={form.isr_retention || ""}
                onChange={(e) => setForm({ ...form, isr_retention: parseFloat(e.target.value) || 0 })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-[9px] text-muted">IVA</label>
              <input
                type="number"
                value={form.iva_retention || ""}
                onChange={(e) => setForm({ ...form, iva_retention: parseFloat(e.target.value) || 0 })}
                className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
                placeholder="0.00"
              />
            </div>
          </div>
          <div>
            <label className="text-[9px] text-muted">{t("description")}</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
              placeholder={t("invoiceDescription")}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleAdd}
              disabled={adding || !form.amount || form.amount <= 0}
              className="inline-flex items-center gap-1 rounded bg-accent px-3 py-1 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {t("addInvoice")}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-default px-3 py-1 text-[10px] text-secondary hover:text-primary"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ── Invoice list ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-2 h-8 w-8 text-muted" />
            <p className="text-[11px] text-tertiary">{t("noInvoices")}</p>
          </div>
        ) : (
          <ul className="divide-y divide-subtle">
            {invoices.map((inv) => {
              const sat = inv.sat_status ? SAT_STATUS[inv.sat_status] : null;
              const SatIcon = sat?.icon ?? Clock;
              const satColor = sat?.color ?? "text-muted";
              return (
                <li key={inv.id} className="px-4 py-2.5 hover:bg-surface-1 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {inv.series && <span className="text-[10px] font-mono text-tertiary">{inv.series}-</span>}
                        {inv.folio && <span className="text-[11px] font-medium text-primary">{inv.folio}</span>}
                        {!inv.series && !inv.folio && (
                          <span className="text-[11px] text-tertiary italic">{t("noFolio")}</span>
                        )}
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          STATUS_PILL[inv.status] ?? STATUS_PILL.draft
                        }`}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                      </div>
                      {inv.description && (
                        <p className="mt-0.5 truncate text-[10px] text-tertiary">{inv.description}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-[11px] font-semibold text-primary">${fmt(inv.amount)}</p>
                      <div className="flex items-center justify-end gap-2 text-[9px] text-tertiary">
                        {Number(inv.isr_retention) > 0 && <span>ISR: ${fmt(inv.isr_retention)}</span>}
                        {Number(inv.iva_retention) > 0 && <span>IVA: ${fmt(inv.iva_retention)}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[9px] text-tertiary">
                    {inv.invoice_date && (
                      <span>{new Date(inv.invoice_date).toLocaleDateString("es-MX", { month: "short", day: "numeric" })}</span>
                    )}
                    {inv.sat_status && (
                      <span className="inline-flex items-center gap-0.5">
                        <SatIcon className={`h-2.5 w-2.5 ${satColor}`} />
                        SAT: {inv.sat_status === "valid" ? "Vigente" : inv.sat_status === "cancelled" ? "Cancelado" : inv.sat_status === "invalid" ? "Invalido" : "Sin verificar"}
                      </span>
                    )}
                    {inv.uuid && (
                      <span className="font-mono text-[8px]">{inv.uuid.slice(0, 8)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── Accounting Actions Component ───────────────────────────────────────────────
// Used by accounting/admin users to validate, approve, reject, and mark as paid.

export interface AccountingActionsProps {
  report: Report;
  onValidate: () => Promise<void>;
  onApprove: () => Promise<void>;
  onReject: (reason?: string) => Promise<void>;
  onMarkPaid: (reference?: string) => Promise<void>;
}

export function AccountingActions({
  report,
  onValidate,
  onApprove,
  onReject,
  onMarkPaid,
}: AccountingActionsProps) {
  const t = useTranslations("subcontractor");
  const [loading, setLoading] = useState(false);
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPayInput, setShowPayInput] = useState(false);
  const [payRef, setPayRef] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setLoading(true);
    try { await fn(); } finally { setLoading(false); }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-default px-4 py-2">
      {report.status === "submitted" && (
        <button
          type="button"
          onClick={() => run(onValidate)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-indigo-500/10 px-2 py-1 text-[10px] font-semibold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {t("validate")}
        </button>
      )}
      {report.status === "validated" && (
        <button
          type="button"
          onClick={() => run(onApprove)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-violet-500/10 px-2 py-1 text-[10px] font-semibold text-violet-400 hover:bg-violet-500/20 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {t("approveManager")}
        </button>
      )}
      {report.status === "manager_approved" && (
        <button
          type="button"
          onClick={() => run(onApprove)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {t("approveAccounting")}
        </button>
      )}
      {report.status === "accounting_approved" && (
        <button
          type="button"
          onClick={() => setShowPayInput(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors"
        >
          {t("markPaid")}
        </button>
      )}
      {["submitted", "validated", "manager_approved"].includes(report.status) && (
        <button
          type="button"
          onClick={() => setShowRejectInput(true)}
          disabled={loading}
          className="inline-flex items-center gap-1 rounded bg-error/10 px-2 py-1 text-[10px] font-semibold text-error hover:bg-error/20 disabled:opacity-40 transition-colors"
        >
          <XCircle className="h-3 w-3" />
          {t("reject")}
        </button>
      )}

      {showRejectInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder={t("rejectReason")}
            className="rounded border border-default bg-surface-0 px-2 py-1 text-[10px] text-primary"
          />
          <button
            type="button"
            onClick={() => run(() => onReject(rejectReason || undefined))}
            className="rounded bg-error px-2 py-1 text-[10px] font-semibold text-white hover:bg-error/80"
          >
            {t("confirm")}
          </button>
          <button
            type="button"
            onClick={() => { setShowRejectInput(false); setRejectReason(""); }}
            className="rounded border border-default px-2 py-1 text-[10px] text-secondary"
          >
            {t("cancel")}
          </button>
        </div>
      )}

      {showPayInput && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            placeholder={t("paymentReference")}
            className="rounded border border-default bg-surface-0 px-2 py-1 text-[10px] text-primary"
          />
          <button
            type="button"
            onClick={() => run(() => onMarkPaid(payRef || undefined))}
            className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500/80"
          >
            {t("confirm")}
          </button>
          <button
            type="button"
            onClick={() => { setShowPayInput(false); setPayRef(""); }}
            className="rounded border border-default px-2 py-1 text-[10px] text-secondary"
          >
            {t("cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
