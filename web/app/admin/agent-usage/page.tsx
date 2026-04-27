"use client";

export const dynamic = "force-dynamic";

/**
 * Phase 8.6 frontend — agent usage rollup dashboard.
 *
 * Wraps GET /agent/usage/{cid}/rollup so admins can monitor cost,
 * latency, and tool-call mix from the operator chrome instead of
 * SSHing into the database. Read-only; no PATCH endpoints exist.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Activity,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface RollupRow<K extends string> {
  count: number;
  // remaining keys are dynamic (model, persona, tool_name, …)
  [k: string]: number | string | undefined;
  // discriminating field — typed via generics on render-time
  // (k=K is the dimension column).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}

interface Rollup {
  company_id:       number;
  since:            string;
  days:             number;
  total_calls:      number;
  total_tool_calls: number;
  total_iterations: number;
  ok_rate:          number;
  p50_latency_ms:   number;
  p95_latency_ms:   number;
  by_model:         { model: string;   count: number }[];
  by_persona:       { persona: string; count: number }[];
  tool_breakdown:   { tool_name: string; count: number }[];
}

const DAY_PRESETS = [1, 7, 30, 90] as const;

export default function AgentUsagePage() {
  const t = useTranslations("admin.agentUsage");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Rollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    setCompanyId(cid ? Number(cid) : null);
  }, []);

  const load = useCallback(async () => {
    if (companyId == null) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `${API}/agent/usage/${companyId}/rollup?days=${days}`,
        { headers: getAuthHeaders() },
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error((body as { detail?: string })?.detail ?? `HTTP ${r.status}`);
      }
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [companyId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const okPct = useMemo(
    () => (data ? Math.round(data.ok_rate * 100) : null),
    [data],
  );

  const totalToolCalls = data?.tool_breakdown.reduce((a, r) => a + r.count, 0) ?? 0;

  return (
    <main className="min-h-screen bg-zinc-950 text-white/85">
      <header className="border-b border-white/[0.07] bg-zinc-900/40">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-3">
          <Link
            href="/admin"
            className="flex h-7 items-center gap-1 rounded text-[10px] text-white/45 transition-colors hover:text-white/70"
          >
            <ChevronLeft className="h-3 w-3" />
            {t("back")}
          </Link>
          <div className="flex h-6 w-6 items-center justify-center rounded bg-amber-600/20 ring-1 ring-amber-500/25">
            <Activity className="h-3 w-3 text-amber-300/90" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-[12px] font-semibold">{t("title")}</span>
            <span className="text-[9px] uppercase tracking-widest text-white/30">
              {t("subtitle")}
            </span>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading || companyId == null}
            className="ml-auto flex h-6 items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 text-[10px] text-white/55 transition-colors hover:border-amber-500/30 hover:text-amber-300 disabled:opacity-40"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            {t("refresh")}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-5">
        {/* range selector */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-white/35">
            {t("range")}
          </span>
          {DAY_PRESETS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={[
                "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                d === days
                  ? "border border-amber-500/35 bg-amber-500/[0.10] text-amber-200"
                  : "border border-white/[0.08] bg-white/[0.03] text-white/45 hover:border-white/[0.15] hover:text-white/70",
              ].join(" ")}
            >
              {t("daysShort", { days: d })}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2 text-[11px] text-rose-300/85">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {companyId == null ? (
          <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] text-white/45">
            {t("noCompany")}
          </div>
        ) : loading && !data ? (
          <div className="flex items-center gap-2 rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] text-white/45">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
          </div>
        ) : data ? (
          <>
            {/* KPI row */}
            <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-5">
              <KpiTile
                label={t("kpis.totalCalls")}
                value={data.total_calls.toLocaleString()}
              />
              <KpiTile
                label={t("kpis.toolCalls")}
                value={data.total_tool_calls.toLocaleString()}
              />
              <KpiTile
                label={t("kpis.iterations")}
                value={data.total_iterations.toLocaleString()}
              />
              <KpiTile
                label={t("kpis.okRate")}
                value={okPct == null ? "—" : `${okPct}%`}
                tone={okPct == null ? "neutral" : okPct >= 95 ? "ok" : okPct >= 80 ? "warn" : "bad"}
              />
              <KpiTile
                label={t("kpis.latency")}
                value={`${data.p50_latency_ms}/${data.p95_latency_ms}ms`}
                hint="p50 / p95"
              />
            </div>

            {/* breakdowns */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <BreakdownCard
                title={t("breakdown.byModel")}
                rows={data.by_model.map((r) => ({ name: r.model || "—", count: r.count }))}
                total={data.total_calls}
                empty={t("breakdown.empty")}
              />
              <BreakdownCard
                title={t("breakdown.byPersona")}
                rows={data.by_persona.map((r) => ({ name: r.persona || "—", count: r.count }))}
                total={data.total_calls}
                empty={t("breakdown.empty")}
              />
              <BreakdownCard
                title={t("breakdown.tools")}
                rows={data.tool_breakdown.map((r) => ({
                  name: r.tool_name || "—",
                  count: r.count,
                }))}
                total={totalToolCalls}
                empty={t("breakdown.empty")}
              />
            </div>

            <p className="mt-4 text-[10px] text-white/28">
              {t("since", { date: new Date(data.since).toISOString().slice(0, 10) })}
            </p>
          </>
        ) : null}
      </div>
    </main>
  );
}

// ── tiles ────────────────────────────────────────────────────────────────────

type Tone = "ok" | "warn" | "bad" | "neutral";

function KpiTile({
  label, value, hint, tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}) {
  const toneCls =
    tone === "ok"   ? "text-emerald-300"
    : tone === "warn" ? "text-amber-300"
    : tone === "bad"  ? "text-rose-300"
    : "text-white/85";
  return (
    <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2">
      <div className="text-[9px] uppercase tracking-widest text-white/35">{label}</div>
      <div className={`mt-1 text-[16px] font-semibold ${toneCls}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[9px] text-white/28">{hint}</div>}
    </div>
  );
}

function BreakdownCard({
  title, rows, total, empty,
}: {
  title: string;
  rows: { name: string; count: number }[];
  total: number;
  empty: string;
}) {
  return (
    <div className="rounded border border-white/[0.07] bg-white/[0.02]">
      <div className="border-b border-white/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/45">
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-[10px] text-white/30">{empty}</div>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <li key={r.name} className="flex items-center gap-2 px-3 py-1.5">
                <div className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-white/75">
                  {r.name}
                </div>
                <div className="w-12 shrink-0 text-right text-[10px] text-white/55">
                  {r.count.toLocaleString()}
                </div>
                <div className="w-16 shrink-0">
                  <div className="h-1 overflow-hidden rounded bg-white/[0.05]">
                    <div
                      className="h-full bg-amber-400/45"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="w-8 shrink-0 text-right text-[9px] tabular-nums text-white/35">
                  {pct}%
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
