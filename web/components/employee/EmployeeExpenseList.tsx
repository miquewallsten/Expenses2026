"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";

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

type FilterTab = string; // legacy compat

const STATUS_DOT: Record<string, string> = {
  draft:     "bg-zinc-500/50",
  submitted: "bg-sky-400/60",
  approved:  "bg-emerald-400/60",
  rejected:  "bg-red-400/60",
  uploading: "bg-indigo-400/60",
};

const STATUS_TEXT: Record<string, string> = {
  draft:     "text-zinc-400/55",
  submitted: "text-sky-300/55",
  approved:  "text-emerald-300/55",
  rejected:  "text-red-300/55",
  uploading: "text-indigo-300/55",
};


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
      {/* Top bar: new + search */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <button
          onClick={onNewExpense}
          disabled={uploading}
          className="shrink-0 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? t("uploadingDoc") : t("newExpense")}
        </button>
        {onNewSimpleExpense && (
          <button
            onClick={onNewSimpleExpense}
            disabled={uploading}
            className="shrink-0 rounded border border-indigo-500/40 px-2.5 py-1.5 text-xs text-indigo-300/80 transition-colors hover:border-indigo-500/70 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("quickExpense")}
          </button>
        )}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="min-w-0 flex-1 rounded border border-white/[0.07] bg-transparent px-2.5 py-1.5 text-xs text-white/70 placeholder-white/20 outline-none transition-colors focus:border-white/[0.15]"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex shrink-0 items-center gap-4 overflow-x-auto border-b border-white/[0.05] px-3 pb-2">
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`shrink-0 pb-px text-[10px] transition-colors ${
              activeFilter === key
                ? "border-b border-indigo-500/50 text-indigo-300/75"
                : "text-white/28 hover:text-white/50"
            }`}
          >
            {t(`filters.${key}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      {/* Scrollable list */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="py-10 text-center text-xs text-white/25">{tc("loading")}</div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-10 text-center text-xs text-white/20">
            {t("noExpenses")}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <ul>
            {filtered.map((exp) => {
              const isSelected = selectedId === exp.id;
              const dotCls  = STATUS_DOT[exp.status]  ?? "bg-zinc-500/50";
              const txtCls  = STATUS_TEXT[exp.status] ?? "text-zinc-400/55";
              const secondary = needsExtraction(exp) ? tc("loading") : secondaryLine(exp);

              return (
                <li key={exp.id}>
                  <button
                    onClick={() => onSelect(exp)}
                    className={`w-full border-b py-3 pl-3 pr-3 text-left transition-all ${
                      isSelected
                        ? "border-b-indigo-500/20 bg-indigo-950/50 shadow-[inset_2px_0_0_0_theme(colors.indigo.500/60%)]"
                        : "border-b-white/[0.04] hover:bg-white/[0.025]"
                    }`}
                  >
                    {/* Row 1: description + amount */}
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`truncate text-[11px] font-medium leading-snug ${isSelected ? "text-white" : "text-white/75"}`}>
                        {sanitizeDescription(exp.description, t("uploadedXml"), t("uploadedPdf"), t("uploadedDoc"))}
                      </span>
                      <span className={`shrink-0 tabular-nums text-[11px] font-semibold ${isSelected ? "text-white" : "text-white/60"}`}>
                        ${Number(exp.amount).toFixed(2)}
                      </span>
                    </div>

                    {/* Row 2: status dot + status + secondary + date */}
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
                      <span className={`text-[10px] ${txtCls}`}>{exp.status}</span>
                      {secondary && (
                        <>
                          <span className="text-white/12">·</span>
                          <span className={`truncate text-[10px] ${needsExtraction(exp) ? "italic text-amber-400/40" : "text-white/22"}`}>
                            {secondary}
                          </span>
                        </>
                      )}
                      <span className="ml-auto shrink-0 tabular-nums text-[10px] text-white/18">
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
