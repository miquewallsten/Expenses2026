"use client";

export const dynamic = "force-dynamic";

/**
 * Phase 8.3 frontend — category memory inspector.
 *
 * Wraps GET/DELETE /admin/category-memory/{cid} and POST .../suggest.
 * Lets admins audit the kNN feedback corpus, probe what the suggester
 * would return for a given description, and prune bad rows.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Brain,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Wand2,
} from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { apiCall, apiPost, apiDelete } from "@/lib/api/client";

interface FeedbackRow {
  id: number;
  expense_id: number | null;
  original_category: string | null;
  corrected_category: string;
  description_text: string;
  corrected_by_user_id: number | null;
  created_at: string | null;
}

interface ListResponse {
  items: FeedbackRow[];
  total: number;
  by_category: { category: string; count: number }[];
}

interface Suggestion {
  category: string;
  confidence: number;
  votes: number;
  neighbours: { category: string; score: number; description: string }[];
}

export default function CategoryMemoryPage() {
  const t = useTranslations("admin.categoryMemory");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [probeText, setProbeText] = useState("");
  const [probing, setProbing] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null | undefined>(undefined);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const load = useCallback(async (cid: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<ListResponse>(`/admin/category-memory/${cid}?limit=100`);
      setData(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (companyId) void load(companyId);
  }, [companyId, load]);

  const remove = useCallback(
    async (row: FeedbackRow) => {
      if (!companyId) return;
      if (!window.confirm(t("confirmDelete"))) return;
      setBusyId(row.id);
      setError(null);
      try {
        await apiDelete(`/admin/category-memory/${companyId}/${row.id}`);
        setData((prev) =>
          prev
            ? {
                ...prev,
                items: prev.items.filter((r) => r.id !== row.id),
                total: prev.total - 1,
              }
            : prev,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t],
  );

  const probe = useCallback(async () => {
    if (!companyId || !probeText.trim()) return;
    setProbing(true);
    setError(null);
    setSuggestion(undefined);
    try {
      const body = await apiPost<{ suggestion: Suggestion | null }>(
        `/admin/category-memory/${companyId}/suggest`,
        { description: probeText.trim() },
      );
      setSuggestion(body.suggestion);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setProbing(false);
    }
  }, [companyId, probeText]);

  if (!companyId) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-amber-200/80">
            {t("noCompany")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400 transition hover:border-white/20 hover:text-zinc-200"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("back")}
            </Link>
            <div>
              <h1 className="flex items-center gap-2 text-[14px] font-semibold tracking-tight text-zinc-100">
                <Brain className="h-4 w-4 text-violet-300/70" />
                {t("title")}
              </h1>
              <p className="text-[10.5px] text-zinc-500">{t("subtitle")}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => companyId && void load(companyId)}
            className="flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("refresh")}
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/[0.08] p-2.5 text-[11px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Probe panel */}
        <div className="mb-5 rounded border border-violet-500/20 bg-violet-500/[0.04] p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-violet-200">
            <Wand2 className="h-3.5 w-3.5" />
            {t("probe.title")}
          </div>
          <div className="flex items-stretch gap-2">
            <input
              type="text"
              value={probeText}
              onChange={(e) => setProbeText(e.target.value)}
              placeholder={t("probe.placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !probing && probeText.trim()) void probe();
              }}
              className="flex-1 rounded border border-white/10 bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-100 placeholder:text-zinc-600 focus:border-violet-400/50 focus:outline-none"
            />
            <button
              type="button"
              disabled={probing || !probeText.trim()}
              onClick={() => void probe()}
              className="flex items-center gap-1.5 rounded border border-violet-500/30 bg-violet-500/[0.10] px-3 py-1.5 text-[11px] text-violet-200 transition hover:border-violet-500/50 hover:bg-violet-500/[0.15] disabled:opacity-50"
            >
              {probing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              {t("probe.run")}
            </button>
          </div>
          {suggestion === undefined ? null : suggestion === null ? (
            <div className="mt-2 text-[10.5px] text-zinc-500">
              {t("probe.noMatch")}
            </div>
          ) : (
            <div className="mt-2 space-y-1.5">
              <div className="flex items-baseline gap-2">
                <span className="text-[10.5px] uppercase tracking-wide text-zinc-500">
                  {t("probe.predicted")}:
                </span>
                <span className="rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10.5px] text-violet-200">
                  {suggestion.category}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {t("probe.confidence", {
                    pct: Math.round(suggestion.confidence * 100),
                  })}
                  {" · "}
                  {t("probe.votes", { count: suggestion.votes })}
                </span>
              </div>
              <div className="space-y-0.5">
                {suggestion.neighbours.map((n, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-[10px] text-zinc-500"
                  >
                    <span className="font-mono text-zinc-400">
                      {n.score.toFixed(3)}
                    </span>
                    <span className="rounded bg-zinc-800/60 px-1 text-zinc-300">
                      {n.category}
                    </span>
                    <span className="truncate text-zinc-500">{n.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Aggregates */}
        {data && data.by_category.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {data.by_category.map((b) => (
              <span
                key={b.category}
                className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-zinc-300"
              >
                {b.category}
                <span className="text-zinc-500">·</span>
                <span className="tabular-nums text-violet-300/80">{b.count}</span>
              </span>
            ))}
          </div>
        )}

        <div className="mb-3 text-[10.5px] uppercase tracking-wide text-zinc-500">
          {t("rowCount", { count: data?.total ?? 0 })}
        </div>

        {/* Rows */}
        {loading ? (
          <div className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] p-6 text-[11px] text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("loading")}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="rounded border border-white/10 bg-white/[0.02] p-8 text-center">
            <div className="text-[12px] text-zinc-300">{t("emptyTitle")}</div>
            <div className="text-[10.5px] text-zinc-500">{t("emptyBody")}</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-white/10 bg-white/[0.02]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[9.5px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">{t("th.description")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.original")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.corrected")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.created")}</th>
                  <th className="px-3 py-2 font-medium text-right">
                    {t("th.action")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2">
                      <span className="text-zinc-200">{r.description_text}</span>
                      {r.expense_id && (
                        <span className="ml-1.5 text-[9.5px] text-zinc-500">
                          (#{r.expense_id})
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                      {r.original_category ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-violet-500/10 px-1.5 py-0.5 font-mono text-[10px] text-violet-200">
                        {r.corrected_category}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[10px] text-zinc-500">
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void remove(r)}
                        className="ml-auto flex items-center gap-1 rounded border border-rose-500/20 bg-rose-500/[0.04] px-2 py-1 text-[10px] text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/[0.08] disabled:opacity-50"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        {t("delete")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
