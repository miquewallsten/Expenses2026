"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles, CheckCircle2, Loader2, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";

interface Suggestion {
  expense_id: number;
  suggested_category_code: string | null;
  suggested_account_code: string | null;
  confidence: string;
  source: string;
  reasoning: string;
  available_categories: { code: string; name: string }[];
}

interface Props {
  companyId: number;
}

export default function AdminAutoCategorizePanel({ companyId }: Props) {
  const t = useTranslations("admin.autoCategorize");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [accepting, setAccepting] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const runSuggest = async () => {
    setLoading(true);
    setErr(null);
    try {
      const result = await apiPost<Suggestion[]>(`/accounting/auto-categorize/${companyId}/suggest`, { limit: 50 });
      setSuggestions(result);
    } catch (e: any) {
      setErr(e?.message ?? "suggest failed");
    } finally {
      setLoading(false);
    }
  };

  const acceptOne = async (s: Suggestion) => {
    if (!s.suggested_category_code) return;
    setAccepting((prev) => new Set(prev).add(s.expense_id));
    try {
      await apiPost(`/accounting/auto-categorize/${companyId}/accept`, {
        expense_id: s.expense_id,
        category_code: s.suggested_category_code,
        account_code: s.suggested_account_code,
      });
      setAccepted((prev) => new Set(prev).add(s.expense_id));
    } catch (e: any) {
      setErr(e?.message ?? "accept failed");
    } finally {
      setAccepting((prev) => {
        const n = new Set(prev);
        n.delete(s.expense_id);
        return n;
      });
    }
  };

  const acceptAll = async () => {
    const batch = suggestions
      .filter((s) => s.suggested_category_code && !accepted.has(s.expense_id) && s.confidence !== "low")
      .map((s) => ({
        expense_id: s.expense_id,
        category_code: s.suggested_category_code!,
        account_code: s.suggested_account_code,
      }));
    if (batch.length === 0) return;
    setLoading(true);
    try {
      await apiPost(`/accounting/auto-categorize/${companyId}/accept-bulk`, { items: batch });
      setAccepted((prev) => {
        const n = new Set(prev);
        batch.forEach((b) => n.add(b.expense_id));
        return n;
      });
    } catch (e: any) {
      setErr(e?.message ?? "bulk accept failed");
    } finally {
      setLoading(false);
    }
  };

  const confidenceColor: Record<string, string> = {
    high: "text-emerald-400",
    medium: "text-amber-400",
    low: "text-red-400",
  };
  const confidenceBg: Record<string, string> = {
    high: "border-emerald-500/20 bg-emerald-950/20",
    medium: "border-amber-500/20 bg-amber-950/20",
    low: "border-red-500/20 bg-red-950/20",
  };

  const highConf = suggestions.filter((s) => s.suggested_category_code && s.confidence === "high");
  const medConf = suggestions.filter((s) => s.suggested_category_code && s.confidence === "medium");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-secondary">{t("title")}</h2>
        <p className="mt-0.5 text-[11px] text-muted">{t("subtitle")}</p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={runSuggest}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded border bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent-muted/80 disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {t("runSuggest")}
        </button>
        {suggestions.length > 0 && (
          <button
            type="button"
            onClick={acceptAll}
            disabled={loading || (highConf.length + medConf.length) === 0}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-950/20 px-3 py-1 text-[10px] font-semibold text-emerald-400 transition-colors hover:bg-emerald-950/30 disabled:opacity-40"
          >
            <CheckCircle2 className="h-3 w-3" />
            {t("acceptAll", { count: highConf.length + medConf.length })}
          </button>
        )}
      </div>

      {err && (
        <div className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/20 px-3 py-1.5 text-[10px] text-error/70">
          <AlertCircle className="h-3 w-3" /> {err}
        </div>
      )}

      {/* Results */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const isAccepted = accepted.has(s.expense_id);
            const isExpanded = expanded === s.expense_id;
            const hasCode = !!s.suggested_category_code;
            return (
              <div
                key={s.expense_id}
                className={`rounded-lg border ${hasCode ? confidenceBg[s.confidence] || "border-default bg-surface-1" : "border-default bg-surface-1"}`}
              >
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  onClick={() => setExpanded(isExpanded ? null : s.expense_id)}
                >
                  {isAccepted ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : hasCode ? (
                    <Sparkles className={`h-3.5 w-3.5 ${confidenceColor[s.confidence] || "text-muted"}`} />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  )}
                  <span className="text-[11px] text-secondary">Expense #{s.expense_id}</span>
                  {hasCode && (
                    <span className={`text-[10px] font-mono font-semibold ${confidenceColor[s.confidence]}`}>
                      → {s.suggested_category_code}
                    </span>
                  )}
                  <span className="ml-auto text-[9px] text-muted uppercase">{s.source} · {s.confidence}</span>
                  {isExpanded ? <ChevronUp className="h-3 w-3 text-muted" /> : <ChevronDown className="h-3 w-3 text-muted" />}
                </div>
                {isExpanded && (
                  <div className="border-t border-subtle px-3 py-2 space-y-1">
                    <p className="text-[10px] text-muted">{s.reasoning}</p>
                    {s.suggested_account_code && (
                      <p className="text-[10px] text-muted">Account: {s.suggested_account_code}</p>
                    )}
                    {hasCode && !isAccepted && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); acceptOne(s); }}
                        disabled={accepting.has(s.expense_id)}
                        className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-500/20 bg-emerald-950/20 px-2 py-0.5 text-[9px] font-semibold text-emerald-400 disabled:opacity-40"
                      >
                        {accepting.has(s.expense_id) ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                        Accept
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
