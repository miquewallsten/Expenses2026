"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { StatusDot, StatusText } from "@/components/ui/StatusBadge";
import { Plus, Upload, Camera, FileText } from "lucide-react";

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

const FILTER_KEYS = ["all", "draft", "submitted", "approved", "needsAttention"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function matchesFilterKey(expense: { status: string }, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "needsAttention") return expense.status === "rejected";
  return expense.status.toLowerCase() === filter.toLowerCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function needsExtraction(e: Expense): boolean {
  return e.status === "uploading";
}

const _AMOUNT_FMT = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatAmount(n: number | string): string {
  const v = Number(n);
  return Number.isFinite(v) ? _AMOUNT_FMT.format(v) : "0.00";
}

const _GARBAGE_PREFIXES = ["<?xml", "<cfdi", "<Comprobante", "%PDF"];

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
void _GARBAGE_PREFIXES;

function secondaryLine(e: Expense): string {
  if (e.project) return e.project;
  if (e.client) return e.client;
  if (e.cost_center) return e.cost_center;
  return "";
}

function SkeletonRow({ delay = 0 }: { delay?: number }) {
  return (
    <li className="border-b border-subtle px-3 py-3" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="skeleton h-2.5 w-2/3 rounded" />
        <div className="skeleton h-2.5 w-12 rounded" />
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <div className="skeleton h-1.5 w-1.5 rounded-full" />
        <div className="skeleton h-2 w-16 rounded" />
        <div className="skeleton ml-auto h-2 w-10 rounded" />
      </div>
    </li>
  );
}

interface Props {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
  loading: boolean;
  uploading?: boolean;
  onUploadFile: () => void;
  onTakePhoto?: () => void;
  onNewSimpleExpense?: () => void;
}

export default function EmployeeExpenseList({
  expenses,
  selectedId,
  onSelect,
  loading,
  uploading = false,
  onUploadFile,
  onTakePhoto,
  onNewSimpleExpense,
}: Props) {
  const t = useTranslations("employee.expenseList");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const filtered = useMemo(() => {
    if (!Array.isArray(expenses)) return [];
    return expenses.filter((e) => {
      if (!matchesFilterKey(e, activeFilter)) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          e.description.toLowerCase().includes(q) ||
          (e.detected_category?.toLowerCase().includes(q) ?? false) ||
          (e.account_code?.toLowerCase().includes(q) ?? false)
        );
      }
      return true;
    });
  }, [expenses, query, activeFilter]);

  return (
    <div className="flex h-full flex-col overflow-hidden">

      <div className="flex shrink-0 items-center gap-2 border-b border-subtle px-3 py-2">
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            disabled={uploading}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="btn btn-primary"
          >
            <Plus className="h-3 w-3" />
            {uploading ? t("uploadingDoc") : t("newExpense")}
          </button>
          {menuOpen && !uploading && (
            <div
              role="menu"
              className="absolute left-0 top-full z-30 mt-1 w-48 overflow-hidden rounded-md border border-default bg-surface-2 shadow-lg"
            >
              <button
                role="menuitem"
                onClick={() => { setMenuOpen(false); onUploadFile(); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
              >
                <Upload className="h-3 w-3 text-muted" />
                {t("uploadFile")}
              </button>
              {onTakePhoto && (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onTakePhoto(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
                >
                  <Camera className="h-3 w-3 text-muted" />
                  {t("takePhoto")}
                </button>
              )}
              {onNewSimpleExpense && (
                <button
                  role="menuitem"
                  onClick={() => { setMenuOpen(false); onNewSimpleExpense(); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
                >
                  <FileText className="h-3 w-3 text-muted" />
                  {t("noReceipt")}
                </button>
              )}
            </div>
          )}
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="input h-7 text-xs"
        />
      </div>

      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 py-2">
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              activeFilter === key
                ? "bg-accent-muted text-accent"
                : "text-secondary hover:bg-surface-2 hover:text-primary"
            }`}
          >
            {t(`filters.${key}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">

        {loading && (
          <ul>
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonRow key={i} delay={i * 60} />
            ))}
          </ul>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-2">
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-muted">
                <path d="M4 5h12M4 10h8M4 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-muted">{t("noExpenses")}</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul>
            {filtered.map((exp) => {
              const isSelected = selectedId === exp.id;
              const secondary = needsExtraction(exp) ? tc("loading") : secondaryLine(exp);

              return (
                <li key={exp.id}>
                  <button
                    onClick={() => onSelect(exp)}
                    className={`group w-full border-b py-3 pl-3 pr-3 text-left transition-all ${
                      isSelected
                        ? "border-b-subtle bg-accent-muted"
                        : "border-b-subtle hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-xs font-medium leading-snug ${isSelected ? "text-primary" : "text-secondary group-hover:text-primary"}`}>
                        {sanitizeDescription(exp.description, t("uploadedXml"), t("uploadedPdf"), t("uploadedDoc"))}
                      </span>
                      <span className={`shrink-0 tabular-nums text-xs font-semibold ${isSelected ? "text-primary" : "text-primary"}`}>
                        ${formatAmount(exp.amount)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5">
                      <StatusDot status={exp.status} />
                      <StatusText status={exp.status} className="text-[10px]" />
                      {secondary && (
                        <>
                          <span className="text-muted">·</span>
                          <span className={`truncate text-[10px] ${needsExtraction(exp) ? "italic text-warning" : "text-tertiary"}`}>
                            {secondary}
                          </span>
                        </>
                      )}
                      <span className="ml-auto shrink-0 tabular-nums text-[10px] text-muted">
                        {formatDate(exp.created_at)}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}