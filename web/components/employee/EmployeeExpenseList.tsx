"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Upload, Camera, FileText, FileCode, FileCheck2,
  Search, Receipt, Clock,
} from "lucide-react";

export interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  report_id: number | null;
  created_at: string;
  project?: string | null;
  client?: string | null;
  cost_center?: string | null;
}



// ── Formatters ────────────────────────────────────────────────────────────────

const AMOUNT_FMT = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatAmount(n: number | string): string {
  const v = Number(n);
  return Number.isFinite(v) ? AMOUNT_FMT.format(v) : "0.00";
}

function formatGroupDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (itemDate.getTime() === today.getTime()) return "Hoy";
  if (itemDate.getTime() === yesterday.getTime()) return "Ayer";
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  if (itemDate >= weekAgo) {
    return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "short" });
  }
  return d.toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

function needsExtraction(e: Expense): boolean {
  return e.status === "uploading";
}

function sanitizeDescriptionRaw(description: string): "xml" | "pdf" | "doc" | null {
  const trimmed = description.trimStart();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<cfdi") || trimmed.startsWith("<Comprobante")) return "xml";
  if (trimmed.startsWith("%PDF")) return "pdf";
  if (!description) return "doc";
  return null;
}

function sanitizeDescription(description: string, uploadedXml: string, uploadedPdf: string, uploadedDoc: string): string {
  const kind = sanitizeDescriptionRaw(description);
  if (kind === "xml") return uploadedXml;
  if (kind === "pdf") return uploadedPdf;
  if (kind === "doc") return uploadedDoc;
  return description;
}

function secondaryLine(e: Expense): string {
  if (e.project) return e.project;
  if (e.client) return e.client;
  if (e.cost_center) return e.cost_center;
  return "";
}

// ── Document type indicator ───────────────────────────────────────────────────

function DocTypeIcon({ type }: { type: "xml" | "pdf" | "doc" | null }) {
  if (type === "xml") return <FileCode className="h-3 w-3 text-sky-400" />;
  if (type === "pdf") return <FileCheck2 className="h-3 w-3 text-amber-400" />;
  if (type === "doc") return <FileText className="h-3 w-3 text-muted" />;
  return null;
}

// ── Status pill ──────────────────────────────────────────────────────────────

const STATUS_PILL: Record<string, string> = {
  draft: "bg-surface-2 text-secondary border border-default",
  uploading: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  submitted: "bg-sky-500/10 text-sky-400 border border-sky-500/20",
  manager_approved: "bg-violet-500/10 text-violet-400 border border-violet-500/20",
  approved: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
  rejected: "bg-error/10 text-error border border-error/20",
};



function StatusPill({ status, label }: { status: string; label?: string }) {
  const cls = STATUS_PILL[status] ?? STATUS_PILL.draft;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-medium leading-none ${cls}`}>
      {label ?? status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface EmployeeExpenseListProps {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (expense: Expense | null) => void;
  loading: boolean;
  uploading: boolean;
  onUploadFile: () => void;
  onTakePhoto?: () => void;
  onNewSimpleExpense: () => void;
}

export default function EmployeeExpenseList({
  expenses,
  selectedId,
  onSelect,
  loading,
  uploading,
  onUploadFile,
  onTakePhoto,
  onNewSimpleExpense,
}: EmployeeExpenseListProps) {
  const t = useTranslations("employee");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // ── Filtering & grouping ───────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = expenses;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.description.toLowerCase().includes(q) ||
          e.detected_category?.toLowerCase().includes(q) ||
          formatAmount(e.amount).includes(q) ||
          e.project?.toLowerCase().includes(q) ||
          e.client?.toLowerCase().includes(q) ||
          e.cost_center?.toLowerCase().includes(q),
      );
    }
    return list;
  }, [expenses, search]);

  const groups = useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of filtered) {
      const key = formatGroupDate(e.created_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [filtered]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full flex-col bg-surface-0">
      {/* Search */}
      <div className="shrink-0 px-3 pt-3 pb-1">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-default bg-surface-1 py-1.5 pl-8 pr-3 text-[11px] text-primary placeholder:text-muted/50 outline-none focus:border-accent/40"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-secondary"
            >
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Expense list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2">
        {loading && expenses.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-[11px] text-muted">Cargando...</p>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16">
            <Receipt className="h-8 w-8 text-surface-2" />
            <p className="mt-2 text-[11px] text-muted">{t("noExpenses")}</p>
          </div>
        )}

        {Array.from(groups.entries()).map(([label, items]) => (
          <div key={label} className="mb-1">
            <p className="px-1.5 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-widest text-muted">
              {label}
            </p>
            <ul className="space-y-px">
              {items.map((exp) => {
                const isSelected = exp.id === selectedId;
                const docType = sanitizeDescriptionRaw(exp.description);
                const secondary = secondaryLine(exp);
                return (
                  <li key={exp.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(exp)}
                      className={`group relative flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-accent/5 ring-1 ring-inset ring-accent/15"
                          : "hover:bg-surface-1"
                      }`}
                    >
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        isSelected ? "bg-accent/10" : "bg-surface-2 group-hover:bg-surface-3"
                      } transition-colors`}>
                        {needsExtraction(exp) ? (
                          <Clock className="h-3 w-3 animate-pulse text-amber-400" />
                        ) : (
                          <DocTypeIcon type={docType} />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-[11px] font-medium leading-tight ${
                            isSelected ? "text-primary" : "text-secondary group-hover:text-primary"
                          } transition-colors`}>
                            {sanitizeDescription(exp.description, t("uploadedXml"), t("uploadedPdf"), t("uploadedDoc"))}
                          </span>
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-primary">
                            ${formatAmount(exp.amount)}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <StatusPill status={exp.status} label={t(`status_${exp.status}` as Parameters<typeof t>[0])} />
                          {exp.detected_category && !needsExtraction(exp) && (
                            <span className="truncate text-[9px] text-muted">
                              {exp.detected_category}
                            </span>
                          )}
                          {secondary && !needsExtraction(exp) && (
                            <>
                              <span className="text-muted/40">·</span>
                              <span className="truncate text-[9px] text-tertiary">{secondary}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* New expense dropdown */}
      <div className="shrink-0 border-t border-default px-3 py-2">
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            {t("newExpense")}
          </button>

          {menuOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 z-20 overflow-hidden rounded-lg border border-default bg-surface-1 shadow-lg">
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onUploadFile(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
              >
                <Upload className="h-3 w-3 text-muted" />
                {t("uploadFile")}
              </button>
              {onTakePhoto && (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onTakePhoto(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
                >
                  <Camera className="h-3 w-3 text-muted" />
                  {t("takePhoto")}
                </button>
              )}
              {onNewSimpleExpense && (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onNewSimpleExpense(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
                >
                  <FileText className="h-3 w-3 text-muted" />
                  {t("noReceipt")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
