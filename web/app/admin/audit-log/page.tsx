"use client";

export const dynamic = "force-dynamic";

/**
 * Admin audit-log viewer.
 *
 * Wraps GET /admin/audit-log/{cid} (cursor paginated) and
 * GET /admin/audit-log/{cid}/actions (distinct action strings for
 * filter pills). Dense Salesforce/SAP-style table with action filter
 * pills, infinite scroll via "Load more" button, and per-row JSON
 * detail expansion.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  Loader2,
  RefreshCw,
  ScrollText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;
const PAGE_SIZE = 50;

interface AuditRow {
  id: number;
  company_id: number | null;
  entity_type: string;
  entity_id: number;
  action: string;
  actor_user_id: number | null;
  detail_text: string;
  created_at: string;
}

interface AuditPage {
  rows: AuditRow[];
  next_cursor: number | null;
}

function actionTone(action: string): string {
  if (action.endsWith(".denied") || action.includes("rejected") || action.includes("cancelled"))
    return "bg-rose-500/15 text-rose-300";
  if (action.includes("approved") || action.includes("paid")) return "bg-emerald-500/15 text-emerald-300";
  if (action.includes("update") || action.includes("transition")) return "bg-sky-500/15 text-sky-300";
  if (action.includes("consumed") || action.includes("login")) return "bg-violet-500/15 text-violet-300";
  return "bg-white/[0.06] text-white/55";
}

export default function AuditLogPage() {
  const t = useTranslations("admin.auditLog");
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const loadActions = useCallback(async (cid: number) => {
    try {
      const res = await fetch(`${API}/admin/audit-log/${cid}/actions`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) return;
      setActions(await res.json());
    } catch {
      // non-fatal — pills just render empty
    }
  }, []);

  const loadPage = useCallback(
    async (cid: number, opts: { append?: boolean; cursor?: number | null; filter?: string | null }) => {
      const setBusy = opts.append ? setMoreLoading : setLoading;
      setBusy(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("limit", String(PAGE_SIZE));
        if (opts.cursor) qs.set("cursor", String(opts.cursor));
        if (opts.filter) qs.set("action", opts.filter);
        const res = await fetch(`${API}/admin/audit-log/${cid}?${qs.toString()}`, {
          headers: { ...getAuthHeaders() },
        });
        if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
        const body = (await res.json()) as AuditPage;
        setRows((prev) => (opts.append ? [...prev, ...body.rows] : body.rows));
        setCursor(body.next_cursor);
        setHasMore(body.next_cursor !== null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!companyId) return;
    void loadActions(companyId);
    void loadPage(companyId, { cursor: null, filter });
  }, [companyId, filter, loadActions, loadPage]);

  const onPickFilter = (a: string | null) => {
    setExpanded(null);
    setFilter(a);
  };

  const renderDetail = (row: AuditRow) => {
    const text = row.detail_text || "";
    const trimmed = text.trim();
    if (!trimmed) return <span className="text-white/30">—</span>;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return (
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-white/65">
            {JSON.stringify(JSON.parse(trimmed), null, 2)}
          </pre>
        );
      } catch {
        // fall through to plain text
      }
    }
    return <span className="break-all font-mono text-[10px] text-white/65">{text}</span>;
  };

  if (!companyId) {
    return (
      <main className="min-h-screen bg-zinc-950 text-zinc-100">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-amber-200/80">
            {t("noCompany")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-1 text-[10.5px] text-white/40 transition-colors hover:text-white/70"
            >
              <ChevronLeft className="h-3 w-3" />
              {t("back")}
            </Link>
            <span className="h-3 w-px bg-white/[0.08]" />
            <div className="flex items-center gap-1.5">
              <ScrollText className="h-3.5 w-3.5 text-slate-300/70" />
              <h1 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-white/85">
                {t("title")}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={() => companyId && void loadPage(companyId, { cursor: null, filter })}
            disabled={loading}
            className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/55 transition hover:border-white/20 hover:text-white/80 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("refresh")}
          </button>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-rose-500/30 bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Filter pills */}
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[9.5px] uppercase tracking-wide text-white/35">
            {t("filter")}
          </span>
          <button
            type="button"
            onClick={() => onPickFilter(null)}
            className={`rounded border px-2 py-0.5 text-[10px] transition ${
              filter === null
                ? "border-white/25 bg-white/[0.10] text-white/85"
                : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70"
            }`}
          >
            {t("all")}
          </button>
          {actions.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => onPickFilter(a)}
              className={`rounded border px-2 py-0.5 font-mono text-[10px] transition ${
                filter === a
                  ? "border-slate-400/50 bg-slate-500/[0.18] text-slate-100"
                  : "border-white/10 bg-white/[0.03] text-white/45 hover:border-white/20 hover:text-white/70"
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center gap-2 py-6 text-[11px] text-white/30">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded border border-white/[0.07] bg-white/[0.02] py-10 text-center text-[11px] text-white/35">
            {t("empty")}
          </div>
        ) : (
          <div className="overflow-hidden rounded border border-white/[0.07]">
            <table className="w-full text-[10.5px]">
              <thead>
                <tr className="border-b border-white/[0.07] bg-white/[0.02] text-left text-[9.5px] uppercase tracking-wide text-white/35">
                  <th className="w-7 px-1 py-1.5" />
                  <th className="px-2 py-1.5 font-medium">{t("th.when")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("th.action")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("th.entity")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("th.actor")}</th>
                  <th className="px-2 py-1.5 font-medium">{t("th.detail")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isOpen = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                        className="cursor-pointer border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]"
                      >
                        <td className="px-1 py-1.5 align-top text-white/35">
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                        </td>
                        <td className="px-2 py-1.5 align-top text-white/55 tabular-nums">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                        </td>
                        <td className="px-2 py-1.5 align-top">
                          <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${actionTone(r.action)}`}>
                            {r.action}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 align-top font-mono text-white/65">
                          {r.entity_type}#{r.entity_id}
                        </td>
                        <td className="px-2 py-1.5 align-top text-white/45">
                          {r.actor_user_id ? `user#${r.actor_user_id}` : t("system")}
                        </td>
                        <td className="px-2 py-1.5 align-top text-white/55">
                          {!isOpen && (
                            <span className="line-clamp-1 break-all font-mono text-[10px]">
                              {r.detail_text || "—"}
                            </span>
                          )}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr key={`${r.id}-detail`} className="border-b border-white/[0.04] bg-white/[0.015]">
                          <td className="px-2 py-2" colSpan={6}>
                            <div className="rounded border border-white/[0.06] bg-zinc-950/60 p-2">
                              {renderDetail(r)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() =>
                companyId && void loadPage(companyId, { append: true, cursor, filter })
              }
              disabled={moreLoading}
              className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-3 py-1 text-[10.5px] text-white/65 transition hover:border-white/20 hover:text-white/85 disabled:opacity-40"
            >
              {moreLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {t("loadMore")}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
