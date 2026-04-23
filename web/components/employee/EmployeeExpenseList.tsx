"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { StatusDot, StatusText } from "@/components/ui/StatusBadge";
import { Plus } from "lucide-react";

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
  return Number(e.amount) === 0 && !e.detected_category && e.status !== "uploading";
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

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ delay = 0 }: { delay?: number }) {
  return (
    <li className="border-b border-white/[0.04] px-3 py-3" style={{ animationDelay: `${delay}ms` }}>
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

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  expenses: Expense[];
  selectedId: number | null;
  onSelect: (e: Expense) => void;
  loading: boolean;
  uploading?: boolean;
  onNewExpense: () => void;
  onNewSimpleExpense?: () => void;
}

export default function EmployeeExpenseList({
  expenses,
  selectedId,
  onSelect,
  loading,
  uploading = false,
  onNewExpense,
  onNewSimpleExpense,
}: Props) {
  const t = useTranslations("employee");
  const tc = useTranslations("common");
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const filtered = useMemo(() => {
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

      {/* ── Top bar: new + search ─────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.05] px-3 py-2.5">
        <button
          onClick={onNewExpense}
          disabled={uploading}
          className="shrink-0 flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3 w-3" />
          {uploading ? t("uploadingDoc") : t("newExpense")}
        </button>
        {onNewSimpleExpense && (
          <button
            onClick={onNewSimpleExpense}
            disabled={uploading}
            className="shrink-0 rounded-md border border-indigo-500/35 px-2.5 py-1.5 text-xs text-indigo-300/80 transition-colors hover:border-indigo-500/60 hover:bg-indigo-500/[0.08] hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("quickExpense")}
          </button>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-transparent px-2.5 py-1.5 text-xs text-white/75 placeholder-white/28 outline-none transition-colors focus:border-white/[0.18]"
        />
      </div>

      {/* ── Pill filter tabs ──────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-3 py-2">
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
              activeFilter === key
                ? "bg-indigo-500/20 text-indigo-300/90 ring-1 ring-indigo-500/30"
                : "text-white/38 hover:bg-white/[0.06] hover:text-white/65"
            }`}
          >
            {t(`filters.${key}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* ── Scrollable list ───────────────────────────────────────────────── */}
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.04]">
              <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5 text-white/20">
                <path d="M4 5h12M4 10h8M4 15h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="text-xs text-white/30">{t("noExpenses")}</p>
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
                    className={`w-full border-b py-3 pl-3 pr-3 text-left transition-all ${
                      isSelected
                        ? "border-b-indigo-500/20 bg-indigo-950/50 shadow-[inset_2px_0_0_0_theme(colors.indigo.500/60%)]"
                        : "border-b-white/[0.05] hover:bg-white/[0.05]"
                    }`}
                  >
                    {/* Row 1: description + amount */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[11px] font-medium leading-snug ${isSelected ? "text-white" : "text-white/80"}`}>
                        {sanitizeDescription(exp.description, t("uploadedXml"), t("uploadedPdf"), t("uploadedDoc"))}
                      </span>
                      <span className={`shrink-0 tabular-nums text-[11px] font-semibold ${isSelected ? "text-white" : "text-white/65"}`}>
                        ${Number(exp.amount).toFixed(2)}
                      </span>
                    </div>

                    {/* Row 2: status + secondary + date */}
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <StatusDot status={exp.status} />
                      <StatusText status={exp.status} className="text-[10px]" />
                      {secondary && (
                        <>
                          <span className="text-white/18">·</span>
                          <span className={`truncate text-[10px] ${needsExtraction(exp) ? "italic text-amber-400/50" : "text-white/32"}`}>
                            {secondary}
                          </span>
                        </>
                      )}
                      <span className="ml-auto shrink-0 tabular-nums text-[10px] text-white/25">
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
