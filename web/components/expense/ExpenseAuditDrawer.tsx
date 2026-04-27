"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { History, X } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

// Phase 4.9 — Per-expense audit drawer. Backend: GET /audit/expense/{id}.
// Cursor-paginated, newest-first. Trigger button + slide-in right drawer.
// Self-contained: any expense detail page can drop in <ExpenseAuditDrawer
// expenseId={id} /> in its header action area.

const API_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_BASE) ||
  "http://localhost:8000";

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
        const url = new URL(`${API_BASE}/audit/expense/${expenseId}`);
        url.searchParams.set("limit", "50");
        if (afterCursor != null) url.searchParams.set("cursor", String(afterCursor));
        const r = await fetch(url.toString(), { headers: getAuthHeaders() });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const page = (await r.json()) as Page;
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
            ? "inline-flex items-center gap-1.5 rounded-md border border-white/[0.07] bg-zinc-900 px-2.5 py-1 text-[11px] text-white/70 hover:bg-zinc-800 hover:text-white"
            : "rounded p-0.5 text-white/18 hover:text-white/55"
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
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col border-l border-white/[0.07] bg-zinc-950"
          >
            <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.07] px-3">
              <div className="flex items-center gap-2">
                <History className="h-3.5 w-3.5 text-white/55" />
                <div>
                  <div className="text-[12px] font-semibold text-white">{t("title")}</div>
                  <div className="text-[10px] text-white/45">
                    {t("subtitle", { id: expenseId })}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("close")}
                className="flex h-7 w-7 items-center justify-center rounded text-white/55 hover:bg-white/[0.05] hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {error && (
                <div className="mb-2 rounded border border-red-500/20 bg-red-500/[0.06] px-2.5 py-1.5 text-[11px] text-red-300">
                  {error}
                </div>
              )}
              {!loading && items.length === 0 && !error && (
                <div className="py-8 text-center text-[11px] text-white/35">{t("empty")}</div>
              )}
              <ul className="space-y-1">
                {items.map((row) => (
                  <li
                    key={row.id}
                    className="rounded border border-white/[0.05] bg-white/[0.015] px-2.5 py-1.5"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[11px] font-semibold text-indigo-300">
                        {row.action}
                      </span>
                      <time
                        dateTime={row.created_at}
                        className="shrink-0 font-mono text-[10px] text-white/40"
                      >
                        {formatTs(row.created_at)}
                      </time>
                    </div>
                    {row.detail_text && (
                      <pre className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-white/65">
                        {row.detail_text}
                      </pre>
                    )}
                    {row.actor_user_id != null && (
                      <div className="mt-0.5 text-[10px] text-white/30">
                        {t("actor", { id: row.actor_user_id })}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div ref={sentinelRef} />
              {loading && (
                <div className="py-3 text-center text-[10px] text-white/30">{t("loading")}</div>
              )}
              {exhausted && items.length > 0 && (
                <div className="py-3 text-center text-[10px] text-white/25">{t("end")}</div>
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
