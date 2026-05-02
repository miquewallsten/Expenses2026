"use client";

export const dynamic = "force-dynamic";

/**
 * Phase 4.8 frontend — SAT cancel watcher reversal panel.
 *
 * Wraps GET /expenses/cfdi/cancelled and POST /expenses/cfdi/recheck/{id}.
 * Read-only triage list of expenses whose CFDI flipped to Cancelado, with a
 * one-click manual recheck (in case SAT toggles back to Vigente).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  XOctagon,
  Loader2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Coins,
  PlayCircle,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";

interface CancelledRow {
  id: number;
  description: string;
  amount: number;
  status: string;
  expense_date: string | null;
  cfdi_uuid: string | null;
  cfdi_status: string | null;
  cfdi_last_checked_at: string | null;
  cfdi_amount_mismatch: boolean;
}

export default function CfdiWatcherPage() {
  const t = useTranslations("admin.cfdiWatcher");
  const [rows, setRows] = useState<CancelledRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchSummary, setBatchSummary] = useState<{
    checked: number;
    flipped: number;
    skipped: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<CancelledRow[]>("/expenses/cfdi/cancelled");
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recheck = useCallback(
    async (row: CancelledRow) => {
      setBusyId(row.id);
      setError(null);
      try {
        const body = await apiPost<{
          cfdi_status: string;
          cfdi_last_checked_at: string;
        }>(`/expenses/cfdi/recheck/${row.id}`);
        // If still Cancelado, just refresh timestamp; else drop from list.
        if (body.cfdi_status === "Cancelado") {
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, cfdi_last_checked_at: body.cfdi_last_checked_at }
                : r,
            ),
          );
        } else {
          setRows((prev) => prev.filter((r) => r.id !== row.id));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const runBatch = useCallback(async () => {
    setBatchRunning(true);
    setBatchSummary(null);
    setError(null);
    try {
      const body = await apiPost<{
        checked: number;
        flipped: number;
        skipped: number;
      }>("/expenses/cfdi/recheck-pending");
      setBatchSummary({
        checked: body.checked,
        flipped: body.flipped,
        skipped: body.skipped,
      });
      // Refresh listing in case anything flipped back to Vigente.
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBatchRunning(false);
    }
  }, [load]);

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
                <XOctagon className="h-4 w-4 text-rose-300/70" />
                {t("title")}
              </h1>
              <p className="text-[10.5px] text-zinc-500">{t("subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={batchRunning || loading}
            onClick={() => void runBatch()}
            className="flex items-center gap-1.5 rounded border border-sky-500/30 bg-sky-500/[0.10] px-2.5 py-1 text-[11px] text-sky-100 transition hover:border-sky-400/50 hover:bg-sky-500/[0.18] disabled:opacity-50"
          >
            {batchRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" />
            )}
            {t("runBatch")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
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
        </div>

        {batchSummary && (
          <div className="mb-3 flex items-center gap-3 rounded border border-sky-500/30 bg-sky-500/[0.06] p-2.5 text-[11px] text-sky-100">
            <PlayCircle className="h-3.5 w-3.5 shrink-0 text-sky-300" />
            <span className="font-mono tabular-nums">
              {t("batchChecked", { count: batchSummary.checked })} ·{" "}
              {t("batchFlipped", { count: batchSummary.flipped })} ·{" "}
              {t("batchSkipped", { count: batchSummary.skipped })}
            </span>
          </div>
        )}

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/[0.08] p-2.5 text-[11px] text-rose-200">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        <div className="mb-3 text-[10.5px] uppercase tracking-wide text-zinc-500">
          {t("count", { count: rows.length })}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 rounded border border-white/10 bg-white/[0.02] p-6 text-[11px] text-zinc-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-white/10 bg-white/[0.02] p-8 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/[0.08]">
              <XOctagon className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="text-[12px] text-zinc-300">{t("emptyTitle")}</div>
            <div className="text-[10.5px] text-zinc-500">{t("emptyBody")}</div>
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-white/10 bg-white/[0.02]">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-left text-[9.5px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 font-medium">{t("th.expense")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.amount")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.uuid")}</th>
                  <th className="px-3 py-2 font-medium">{t("th.checked")}</th>
                  <th className="px-3 py-2 font-medium text-right">{t("th.action")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5 text-zinc-200">
                        <span>#{r.id}</span>
                        <span className="text-zinc-500">·</span>
                        <span className="truncate text-zinc-300">
                          {r.description}
                        </span>
                        <Link
                          href={`/employee/expenses/${r.id}`}
                          className="text-zinc-500 transition hover:text-sky-300"
                          title={t("th.expense")}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-zinc-500">
                        <span>{r.expense_date ?? "—"}</span>
                        <span>·</span>
                        <span>{r.status}</span>
                        {r.cfdi_amount_mismatch && (
                          <span className="rounded bg-amber-500/15 px-1 py-0.5 text-[8.5px] text-amber-200">
                            {t("amountMismatch")}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 font-mono tabular-nums text-zinc-200">
                        <Coins className="h-3 w-3 text-zinc-500" />
                        {r.amount.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[10px] text-zinc-400">
                        {r.cfdi_uuid?.slice(0, 18) ?? "—"}
                        {r.cfdi_uuid && r.cfdi_uuid.length > 18 ? "…" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {r.cfdi_last_checked_at
                        ? new Date(r.cfdi_last_checked_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void recheck(r)}
                        className="ml-auto flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-50"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        {t("recheck")}
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
