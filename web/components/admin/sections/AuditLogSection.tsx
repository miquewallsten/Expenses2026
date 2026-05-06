"use client";

/**
 * Admin audit-log viewer section.
 *
 * Wraps GET /admin/audit-log/{cid} (cursor paginated) and
 * GET /admin/audit-log/{cid}/actions (distinct action strings for
 * filter pills). Dense Salesforce/SAP-style table with action filter
 * pills, infinite scroll via "Load more" button, and per-row JSON
 * detail expansion.
 */

import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Loader2,
  RefreshCw,
  ScrollText,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Shield,
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
  if (action.startsWith("routing.")) return "bg-blue-500/15 text-accent";
  if (action.includes("update") || action.includes("transition")) return "bg-accent-muted text-accent";
  if (action.includes("consumed") || action.includes("login")) return "bg-violet-500/15 text-violet-300";
  return "bg-surface-2 text-tertiary";
}

export default function AuditLogSection() {
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
    if (!trimmed) return <span className="text-muted">—</span>;
    if (row.action === "routing.decision") {
      try {
        const p = JSON.parse(trimmed) as {
          rule_id?: string | null;
          approver_user_ids?: number[];
          approver_roles?: string[];
          sla_hours?: number | null;
          escalation_role?: string | null;
        };
        const roles = p.approver_roles ?? [];
        const userIds = p.approver_user_ids ?? [];
        return (
          <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
            {p.rule_id && (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/[0.10] px-1.5 py-[1px] font-mono text-success">
                {p.rule_id}
              </span>
            )}
            {roles.map((r) => (
              <span
                key={`r-${r}`}
                className="rounded border border-sky-500/30 bg-accent/[0.08] px-1.5 py-[1px] font-mono text-sky-200"
              >
                {r}
              </span>
            ))}
            {userIds.length > 0 && (
              <span className="rounded border border-subtle bg-surface-2 px-1.5 py-[1px] font-mono text-secondary">
                #{userIds.join(", #")}
              </span>
            )}
            {p.sla_hours != null && (
              <span className="rounded border border-amber-500/30 bg-amber-500/[0.08] px-1.5 py-[1px] font-mono text-warning">
                SLA {p.sla_hours}h
              </span>
            )}
            {p.escalation_role && (
              <span className="rounded border border-error bg-rose-500/[0.08] px-1.5 py-[1px] font-mono text-rose-200">
                → {p.escalation_role}
              </span>
            )}
          </div>
        );
      } catch {
        // fall through to JSON pretty-print
      }
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return (
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-secondary">
            {JSON.stringify(JSON.parse(trimmed), null, 2)}
          </pre>
        );
      } catch {
        // fall through to plain text
      }
    }
    return <span className="break-all font-mono text-[10px] text-secondary">{text}</span>;
  };

  if (!companyId) {
    return (
      <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
        {t("noCompany")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PremiumHeader
        section="audit-log"
        icon={<Shield className="h-4 w-4" />}
        title={t("title")}
        subtitle="System Activity Trail"
        action={
          <button
            type="button"
            onClick={() => companyId && void loadPage(companyId, { cursor: null, filter })}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] font-semibold text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            {t("refresh")}
          </button>
        }
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-[9.5px] uppercase tracking-wide text-muted">
          {t("filter")}
        </span>
        <button
          type="button"
          onClick={() => onPickFilter(null)}
          className={`rounded border px-2 py-0.5 text-[10px] transition ${
            filter === null
              ? "border-strong bg-surface-2 text-primary"
              : "border-subtle bg-surface-1 text-tertiary hover:border-strong hover:text-secondary"
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
                : "border-subtle bg-surface-1 text-tertiary hover:border-strong hover:text-secondary"
            }`}
          >
            {a}
          </button>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 py-10 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-default bg-surface-1 py-16 text-center text-[11px] text-muted">
          {t("empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-default bg-surface-1 shadow-sm">
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="border-b border-default bg-surface-2/30 text-left text-[9.5px] uppercase tracking-wide text-muted">
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">{t("th.when")}</th>
                <th className="px-2 py-2 font-medium">{t("th.action")}</th>
                <th className="px-2 py-2 font-medium">{t("th.entity")}</th>
                <th className="px-2 py-2 font-medium">{t("th.actor")}</th>
                <th className="px-2 py-2 font-medium">{t("th.detail")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : r.id)}
                      className="cursor-pointer border-b border-subtle last:border-b-0 hover:bg-surface-2/40 transition-colors"
                    >
                      <td className="px-2 py-2 align-top text-muted">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                      <td className="px-2 py-2 align-top text-tertiary tabular-nums">
                        {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${actionTone(r.action)}`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-secondary">
                        {r.entity_type}#{r.entity_id}
                      </td>
                      <td className="px-2 py-2 align-top text-tertiary">
                        {r.actor_user_id ? `user#${r.actor_user_id}` : t("system")}
                      </td>
                      <td className="px-2 py-2 align-top text-tertiary">
                        {!isOpen && (
                          <span className="line-clamp-1 break-all font-mono text-[10px] opacity-70">
                            {r.detail_text || "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.id}-detail`} className="border-b border-subtle bg-surface-2/10">
                        <td className="px-3 py-3" colSpan={6}>
                          <div className="rounded-lg border border-white/5 bg-black/20 p-3">
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

          {hasMore && (
            <div className="flex justify-center border-t border-subtle bg-surface-2/20 py-3">
              <button
                type="button"
                onClick={() =>
                  companyId && void loadPage(companyId, { append: true, cursor, filter })
                }
                disabled={moreLoading}
                className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-4 py-1.5 text-[10px] font-semibold text-secondary transition hover:border-strong hover:text-primary disabled:opacity-40"
              >
                {moreLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {t("loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
