"use client";

/**
 * Phase 4.6 — Admin onboarding wizard.
 *
 * Single-page guided flow: numbered step strip across the top + main panel
 * showing the current step's checklist item with deep-links to the relevant
 * admin page. Persists progress via PATCH /admin/company-setup/{cid}/onboarding-step.
 *
 * Style: dense enterprise — compact rows, no oversized cards, plain copy.
 */

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeft,
  ChevronRight,
  ChevronLeft as ChevronBack,
  Check,
  AlertTriangle,
  Loader2,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import { getAuthHeaders, getCurrentCompanyId } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  ok: boolean;
  label: string;
  detail: string | null;
  count?: number | null;
}

interface ChecklistResponse {
  company_id: number;
  items: Record<string, ChecklistItem>;
  passed: number;
  total: number;
  go_live_ready: boolean;
  onboarding_step: number;
  onboarding_completed_at: string | null;
}

// Step layout — order matches plan.md (4.6): Company → Legal → CoA → Approval → Users → Go-live
const STEP_KEYS = [
  "company",
  "legal_entities",
  "chart_of_accounts",
  "approval_policy",
  "users",
] as const;
type StepKey = (typeof STEP_KEYS)[number];

const STEP_LINKS: Record<StepKey, string> = {
  company: "/admin?panel=company",
  legal_entities: "/admin?panel=legal_entities",
  chart_of_accounts: "/admin?panel=chart_of_accounts",
  approval_policy: "/admin?panel=approval_setup",
  users: "/admin?panel=users",
};

// ── Page ─────────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const t = useTranslations("admin.onboarding");
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const r = await fetch(`${API}/admin/company-setup/${companyId}/checklist`, {
        headers: getAuthHeaders(),
      });
      if (!r.ok) throw new Error(`${r.status}`);
      const body: ChecklistResponse = await r.json();
      setData(body);
      // jump to first incomplete step (or last viewed step if all done)
      const firstIncomplete = STEP_KEYS.findIndex((k) => !body.items[k]?.ok);
      setActiveStep(firstIncomplete === -1 ? STEP_KEYS.length : firstIncomplete);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistStep = useCallback(
    async (step: number) => {
      if (companyId == null) return;
      setSaving(true);
      try {
        await fetch(
          `${API}/admin/company-setup/${companyId}/onboarding-step`,
          {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ onboarding_step: step }),
          },
        );
      } catch {
        // non-blocking: progress will recompute on reload
      } finally {
        setSaving(false);
      }
    },
    [companyId],
  );

  function goTo(step: number) {
    setActiveStep(step);
    void persistStep(step);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="rounded border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-[12px] text-red-200/85">
          <AlertTriangle className="mr-2 inline h-3.5 w-3.5" />
          {error ?? t("errorLoad")}
        </div>
      </div>
    );
  }

  const isGoLive = activeStep === STEP_KEYS.length;
  const currentKey = STEP_KEYS[activeStep] as StepKey | undefined;
  const currentItem = currentKey ? data.items[currentKey] : null;
  const progressPct = (data.passed / data.total) * 100;

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="border-b border-white/[0.06] bg-zinc-950/90 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-[10.5px] text-white/40 hover:text-white/65"
          >
            <ChevronBack className="h-3.5 w-3.5" />
            {t("backToAdmin")}
          </Link>
          <div className="flex items-center gap-1.5 text-[10.5px] text-white/45">
            <Sparkles className="h-3 w-3" />
            {t("subtitle")}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Title + progress */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[15px] font-semibold text-white/85">{t("title")}</h1>
            <p className="mt-0.5 text-[11px] text-white/40">{t("intro")}</p>
          </div>
          <div className="text-right">
            <div className="text-[18px] font-semibold tabular-nums text-white/85">
              {data.passed}
              <span className="text-[12px] text-white/35">/{data.total}</span>
            </div>
            <div className="text-[9.5px] uppercase tracking-wider text-white/35">
              {t("complete")}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1 overflow-hidden rounded bg-white/[0.04]">
          <div
            className="h-1 bg-emerald-500/65 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Step strip */}
        <ol className="mt-5 grid grid-cols-6 gap-1.5">
          {STEP_KEYS.map((key, i) => {
            const item = data.items[key];
            const isActive = i === activeStep;
            const ok = item?.ok ?? false;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => goTo(i)}
                  className={`group flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left text-[10.5px] transition-colors ${
                    isActive
                      ? "border-indigo-500/50 bg-indigo-500/[0.08] text-white/85"
                      : ok
                        ? "border-emerald-500/20 bg-emerald-500/[0.04] text-emerald-200/70 hover:border-emerald-500/35"
                        : "border-white/[0.06] bg-white/[0.02] text-white/45 hover:border-white/[0.12] hover:text-white/65"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                      ok
                        ? "bg-emerald-500/30 text-emerald-200"
                        : isActive
                          ? "bg-indigo-500/35 text-indigo-100"
                          : "bg-white/[0.06] text-white/45"
                    }`}
                  >
                    {ok ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  <span className="truncate">{t(`steps.${key}.label`)}</span>
                </button>
              </li>
            );
          })}
          {/* Go-live tile */}
          <li>
            <button
              type="button"
              onClick={() => goTo(STEP_KEYS.length)}
              disabled={!data.go_live_ready}
              className={`group flex w-full items-center gap-1.5 rounded border px-2 py-1.5 text-left text-[10.5px] transition-colors ${
                isGoLive
                  ? "border-indigo-500/50 bg-indigo-500/[0.08] text-white/85"
                  : data.go_live_ready
                    ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200/80 hover:border-emerald-500/50"
                    : "border-white/[0.05] bg-white/[0.015] text-white/30"
              } disabled:cursor-not-allowed`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${
                  data.go_live_ready
                    ? "bg-emerald-500/35 text-emerald-100"
                    : "bg-white/[0.04] text-white/30"
                }`}
              >
                {data.go_live_ready ? <Check className="h-2.5 w-2.5" /> : "✓"}
              </span>
              <span className="truncate">{t("steps.go_live.label")}</span>
            </button>
          </li>
        </ol>

        {/* Active step body */}
        <section className="mt-6 rounded-md border border-white/[0.06] bg-white/[0.015]">
          {isGoLive ? (
            <GoLivePanel data={data} t={t} />
          ) : currentItem && currentKey ? (
            <StepPanel
              stepKey={currentKey}
              item={currentItem}
              t={t}
              link={STEP_LINKS[currentKey]}
              index={activeStep}
              total={STEP_KEYS.length}
            />
          ) : null}

          {/* Step nav */}
          <footer className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2">
            <button
              type="button"
              onClick={() => goTo(Math.max(0, activeStep - 1))}
              disabled={activeStep === 0}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10.5px] text-white/55 hover:bg-white/[0.05] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("nav.prev")}
            </button>
            <span className="text-[9.5px] text-white/30">
              {saving ? t("nav.saving") : ""}
            </span>
            <button
              type="button"
              onClick={() => goTo(Math.min(STEP_KEYS.length, activeStep + 1))}
              disabled={activeStep >= STEP_KEYS.length}
              className="flex items-center gap-1 rounded px-2 py-1 text-[10.5px] text-white/55 hover:bg-white/[0.05] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {t("nav.next")}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </footer>
        </section>

        {/* Re-check */}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void load()}
            className="text-[10px] text-white/35 hover:text-white/65"
          >
            {t("recheck")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StepPanel({
  stepKey,
  item,
  link,
  index,
  total,
  t,
}: {
  stepKey: StepKey;
  item: ChecklistItem;
  link: string;
  index: number;
  total: number;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] uppercase tracking-wider text-white/35">
          {t("nav.stepOf", { current: index + 1, total })}
        </span>
        {item.ok ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-200/85">
            <Check className="h-2.5 w-2.5" />
            {t("statusComplete")}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-200/85">
            <AlertTriangle className="h-2.5 w-2.5" />
            {t("statusPending")}
          </span>
        )}
      </div>

      <h2 className="mt-2 text-[14px] font-semibold text-white/85">
        {t(`steps.${stepKey}.title`)}
      </h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
        {t(`steps.${stepKey}.body`)}
      </p>

      {item.detail && !item.ok && (
        <p className="mt-2 rounded border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-1.5 text-[10.5px] text-amber-200/85">
          {item.detail}
        </p>
      )}

      {item.count !== null && item.count !== undefined && (
        <p className="mt-2 font-mono text-[10px] text-white/40">
          {t("countLabel", { count: item.count })}
        </p>
      )}

      <Link
        href={link}
        className="mt-3 inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/[0.08] px-2.5 py-1 text-[10.5px] text-indigo-200/85 hover:border-indigo-500/50 hover:bg-indigo-500/[0.14]"
      >
        {t(`steps.${stepKey}.cta`)}
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function GoLivePanel({
  data,
  t,
}: {
  data: ChecklistResponse;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] uppercase tracking-wider text-white/35">
          {t("steps.go_live.label")}
        </span>
        {data.go_live_ready ? (
          <span className="flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-emerald-200/85">
            <Check className="h-2.5 w-2.5" />
            {t("ready")}
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-200/85">
            <AlertTriangle className="h-2.5 w-2.5" />
            {t("notReady")}
          </span>
        )}
      </div>

      <h2 className="mt-2 text-[14px] font-semibold text-white/85">
        {t("steps.go_live.title")}
      </h2>
      <p className="mt-1 text-[11.5px] leading-relaxed text-white/55">
        {data.go_live_ready
          ? t("steps.go_live.bodyReady")
          : t("steps.go_live.bodyNotReady")}
      </p>

      <ul className="mt-3 divide-y divide-white/[0.04] rounded border border-white/[0.06]">
        {STEP_KEYS.map((key) => {
          const it = data.items[key];
          return (
            <li
              key={key}
              className="flex items-center gap-2 px-2.5 py-1.5 text-[10.5px]"
            >
              {it?.ok ? (
                <Check className="h-3.5 w-3.5 text-emerald-300/85" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-amber-500/40" />
              )}
              <span className="flex-1 text-white/75">
                {t(`steps.${key}.label`)}
              </span>
              {it?.detail && !it.ok && (
                <span className="text-[9.5px] text-amber-200/65">{it.detail}</span>
              )}
            </li>
          );
        })}
      </ul>

      {data.onboarding_completed_at && (
        <p className="mt-3 text-[9.5px] text-white/35">
          {t("completedAt", { ts: data.onboarding_completed_at.slice(0, 10) })}
        </p>
      )}
    </div>
  );
}
