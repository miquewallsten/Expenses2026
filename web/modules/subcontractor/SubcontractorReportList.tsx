"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Search, FileText, ChevronRight,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Report {
  id: number;
  title: string;
  status: string;
  total_amount: string;
  total_isr_retention: string;
  total_iva_retention: string;
  total_net: string;
  invoice_count: number;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  validation_status: string | null;
}

export interface SubcontractorReportListProps {
  reports: Report[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onCreateNew: () => void;
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

const AMOUNT_FMT = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatAmount(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? AMOUNT_FMT.format(v) : "0.00";
}

// ── Date grouping ─────────────────────────────────────────────────────────────

function groupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDate.getTime() === today.getTime()) return "Hoy";
  if (itemDate.getTime() === yesterday.getTime()) return "Ayer";
  return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SubcontractorReportList({
  reports,
  selectedId,
  onSelect,
  onCreateNew,
  loading,
}: SubcontractorReportListProps) {
  const t = useTranslations("subcontractor");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        STATUS_LABEL[r.status]?.toLowerCase().includes(q)
    );
  }, [reports, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Report[]>();
    for (const r of filtered) {
      const label = groupLabel(r.created_at);
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(r);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Search ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-default px-3 py-2">
        <div className="flex items-center gap-2 rounded-lg bg-surface-1 px-2 py-1.5">
          <Search className="h-3 w-3 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchReports")}
            className="flex-1 bg-transparent text-[11px] text-primary placeholder-muted outline-none"
          />
        </div>
      </div>

      {/* ── Grouped list ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-2 h-8 w-8 text-muted" />
            <p className="text-[11px] text-tertiary">{t("noReports")}</p>
          </div>
        )}

        {groups.map(([label, items]) => (
          <div key={label}>
            <div className="sticky top-0 z-10 bg-surface-0 px-3 py-1">
              <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
                {label}
              </span>
            </div>
            <ul>
              {items.map((r) => {
                const isSel = r.id === selectedId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(r.id)}
                      className={`w-full text-left px-3 py-2 transition-colors ${
                        isSel
                          ? "bg-accent/5 ring-1 ring-inset ring-accent/15"
                          : "hover:bg-surface-1"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-[11px] font-medium ${
                          isSel ? "text-primary" : "text-secondary"
                        }`}>
                          {r.title}
                        </span>
                        <span className="shrink-0 tabular-nums text-[11px] font-semibold text-primary">
                          ${formatAmount(r.total_net)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          STATUS_PILL[r.status] ?? STATUS_PILL.draft
                        }`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                        {r.invoice_count > 0 && (
                          <span className="text-[9px] text-muted">
                            {r.invoice_count} {r.invoice_count === 1 ? t("invoiceSingular") : t("invoicePlural")}
                          </span>
                        )}
                        {r.period_start && (
                          <>
                            <span className="text-muted">·</span>
                            <span className="text-[9px] text-tertiary">
                              {new Date(r.period_start).toLocaleDateString("es-MX", { month: "short", day: "numeric" })}
                            </span>
                          </>
                        )}
                        <ChevronRight className="ml-auto h-3 w-3 text-muted" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* ── New report button ───────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-default bg-surface-0 px-3 py-2">
        <button
          type="button"
          onClick={onCreateNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[10px] font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          <Plus className="h-3 w-3" />
          {t("newReport")}
        </button>
      </div>
    </div>
  );
}
