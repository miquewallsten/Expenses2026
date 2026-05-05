"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { History, X } from "lucide-react";
import { apiCall } from "@/lib/api/client";

// Phase 4.9 — Per-expense audit drawer. Backend: GET /audit/expense/{id}.
// Cursor-paginated, newest-first. Trigger button + slide-in right drawer.
// Self-contained: any expense detail page can drop in <ExpenseAuditDrawer
// expenseId={id} /> in its header action area.

type AuditEntry = {
  id: number;
  action: string;
  actor_user_id: number | null;
  detail_text: string;
  created_at: string;
};

type Page = { items: AuditEntry[]; next_cursor: number | null };

type Props = {
  expenseId: number;
  /** Render-mode: "icon" (compact button) or "text" (label + icon). */
  variant?: "icon" | "text";
};

export default function ExpenseAuditDrawer({ expenseId, variant = "icon" }: Props) {
  const t = useTranslations("expense.audit");
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset when drawer is reopened on a different expense.
  const reset = useCallback(() => {
    setItems([]);
    setCursor(null);
    setExhausted(false);
    setError(null);
  }, []);

  const fetchPage = useCallback(
    async (afterCursor: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("limit", "50");
        if (afterCursor != null) params.set("cursor", String(afterCursor));
        const page = await apiCall<Page>(`/audit/expense/${expenseId}?${params.toString()}`);
        setItems((prev) => (afterCursor == null ? page.items : [...prev, ...page.items]));
        setCursor(page.next_cursor);
        if (page.next_cursor == null) setExhausted(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [expenseId]
  );

  // First load when opened.
  useEffect(() => {
    if (!open) return;
    reset();
    void fetchPage(null);
  }, [open, expenseId, fetchPage, reset]);

  // Escape closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Infinite scroll.
  useEffect(() => {
    if (!open || exhausted || cursor == null || loading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void fetchPage(cursor);
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [open, cursor, exhausted, loading, fetchPage]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("openTitle")}
        aria-label={t("openTitle")}
        className={
          variant === "text"
            ? "inline-flex items-center gap-1.5 rounded-md border border-default bg-surface-1 px-2.5 py-1 text-[11px] text-secondary hover:bg-surface-2 hover:text-primary"
            : "rounded p-0.5 text-muted hover:text-tertiary"
        }
      >
        <History className={variant === "text" ? "h-3.5 w-3.5" : "h-3.5 w-3.5"} />
        {variant === "text" && <span>{t("openLabel")}</span>}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            role="dialog"
            aria-label={t("title")}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-default bg-surface-0"
          >
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-default px-3">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-tertiary" />
                <div>
                  <div className="text-[12px] font-semibold text-primary">{t("title")}</div>
                  <div className="text-[10px] text-tertiary">
                    {t("subtitle", { id: expenseId })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-7 w-7 items-center justify-center rounded text-tertiary hover:bg-surface-2 hover:text-primary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {error && (
                <div className="mb-2 rounded border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[11px] text-error">
                  {error}
                </div>
              )}
              {!loading && items.length === 0 && !error && (
                <div className="py-8 text-center text-[11px] text-muted">{t("empty")}</div>
              )}
              <ul className="space-y-1">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="rounded border border-subtle bg-surface-1 px-2.5 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-accent">
                        {row.action}
                      </span>
                      <time
                        dateTime={row.created_at}
                        className="shrink-0 font-mono text-[10px] text-tertiary"
                      >
                        {formatTs(row.created_at)}
                      </time>
                    </div>
                    {row.action === "routing.decision" && row.detail_text ? (
                      <RoutingDecision detail={row.detail_text} t={t} />
                    ) : row.detail_text ? (
                      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-secondary">
                        {row.detail_text}
                      </pre>
                    ) : null}
                    {row.actor_user_id != null && (
                      <div className="mt-0.5 text-[10px] text-muted">
                        {t("actor", { id: row.actor_user_id })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div ref={sentinelRef} />
              {loading && (
                <div className="py-3 text-center text-[10px] text-muted">{t("loading")}</div>
              )}
              {exhausted && items.length > 0 && (
                <div className="py-3 text-center text-[10px] text-muted">{t("end")}</div>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type RoutingPayload = {
  rule_id?: string | null;
  approver_user_ids?: number[];
  approver_roles?: string[];
  sla_hours?: number | null;
  escalation_role?: string | null;
};

function RoutingDecision({
  detail,
  t,
}: {
  detail: string;
  t: ReturnType<typeof useTranslations>;
}) {
  let p: RoutingPayload | null = null;
  try {
    p = JSON.parse(detail) as RoutingPayload;
  } catch {
    p = null;
  }
  if (!p || typeof p !== "object") {
    return (
      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-secondary">
        {detail}
      </pre>
    );
  }
  const roles = p.approver_roles ?? [];
  const userIds = p.approver_user_ids ?? [];
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10.5px]">
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
          {t("routing.sla", { hours: p.sla_hours })}
        </span>
      )}
      {p.escalation_role && (
        <span className="rounded border border-error bg-rose-500/[0.08] px-1.5 py-[1px] font-mono text-rose-200">
          {t("routing.escalates", { role: p.escalation_role })}
        </span>
      )}
    </div>
  );
}
