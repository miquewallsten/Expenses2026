"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Zap, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface CycleSettings {
  id: number;
  company_id: number;
  enabled: boolean;
  frequency: "weekly" | "biweekly" | "monthly" | "manual";
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string;
  auto_submit: boolean;
  bundle_statuses: string;
  report_name_template: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface BundleResult {
  reports_created: number;
  expenses_bundled: number;
  users_processed: number;
  skipped_users: number;
  report_ids: number[];
  triggered_by: string;
}

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-muted">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-subtle last:border-0">
      <span className="text-[10px] text-tertiary">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${
        value ? "bg-violet-600/60" : "bg-surface-2"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-surface-4 shadow transition-transform ${
          value ? "translate-x-3.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string | number; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded border border-default bg-surface-1 px-2 py-0.5 text-[10px] text-tertiary outline-none focus:border-violet-500/40"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export default function AdminReportCyclePanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.reportCycle");
  const tc = useTranslations("common");

  const DAY_NAMES = [
    t("dayNames.monday"),
    t("dayNames.tuesday"),
    t("dayNames.wednesday"),
    t("dayNames.thursday"),
    t("dayNames.friday"),
    t("dayNames.saturday"),
    t("dayNames.sunday"),
  ];

  const [settings, setSettings] = useState<CycleSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [lastResult, setLastResult] = useState<BundleResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Load settings
  useEffect(() => {
    fetch(`${API}/admin/report-cycle/${companyId}`)
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => setError(t("failedLoadSettings")));
  }, [companyId]);

  function patch<K extends keyof CycleSettings>(key: K, value: CycleSettings[K]) {
    setSettings((s) => s ? { ...s, [key]: value } : s);
    setDirty(true);
  }

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/report-cycle/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          frequency: settings.frequency,
          day_of_week: settings.day_of_week,
          day_of_month: settings.day_of_month,
          time_of_day: settings.time_of_day,
          auto_submit: settings.auto_submit,
          bundle_statuses: settings.bundle_statuses,
          report_name_template: settings.report_name_template,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setSettings(updated);
      setDirty(false);
    } catch (e: any) {
      setError(e.message ?? tc("save"));
    } finally {
      setSaving(false);
    }
  }

  async function handleTrigger() {
    setTriggering(true);
    setLastResult(null);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/report-cycle/${companyId}/trigger`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      const result: BundleResult = await res.json();
      setLastResult(result);
      // Refresh settings to get updated last_run_at / next_run_at
      const fresh = await fetch(`${API}/admin/report-cycle/${companyId}`).then((r) => r.json());
      setSettings(fresh);
    } catch (e: any) {
      setError(e.message ?? t("failedLoadSettings"));
    } finally {
      setTriggering(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted" />
      </div>
    );
  }

  const showDayOfWeek = settings.frequency === "weekly" || settings.frequency === "biweekly";
  const showDayOfMonth = settings.frequency === "monthly";

  return (
    <div className="max-w-2xl space-y-4">
      {/* Premium header */}
      <div className="relative overflow-hidden rounded-lg border border-default bg-gradient-to-r from-surface-1 via-surface-1 to-violet-500/[0.02] px-4 py-3">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-violet-500)/5%,_transparent_50%)]" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <Zap className="h-4 w-4 text-violet-400" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold text-primary">{t("autoReportGeneration")}</h2>
              <span className="text-[9px] text-muted">Automated Report Cycles</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {settings.enabled ? (
              <span className="flex items-center gap-1.5 rounded-full border border-success/20 bg-success/5 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-success/70">
                <CheckCircle2 className="h-2.5 w-2.5" />
                {t("cyclesActive")}
              </span>
            ) : (
              <span className="rounded-full border border-subtle bg-surface-2 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted">
                {t("cyclesDisabled")}
              </span>
            )}
            <Toggle value={settings.enabled} onChange={(v) => patch("enabled", v)} />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="rounded border border-subtle bg-surface-1 px-3 py-2.5 space-y-0">
        <Label>{t("schedule")}</Label>
        <Row label={t("frequency")}>
          <Select
            value={settings.frequency}
            onChange={(v) => patch("frequency", v as CycleSettings["frequency"])}
            options={[
              { value: "weekly", label: t("freqWeekly") },
              { value: "biweekly", label: t("freqBiweekly") },
              { value: "monthly", label: t("freqMonthly") },
              { value: "manual", label: t("freqManual") },
            ]}
          />
        </Row>

        {showDayOfWeek && (
          <Row label={t("dayOfWeek")}>
            <Select
              value={settings.day_of_week ?? 4}
              onChange={(v) => patch("day_of_week", parseInt(v))}
              options={DAY_NAMES.map((d, i) => ({ value: i, label: d }))}
            />
          </Row>
        )}

        {showDayOfMonth && (
          <Row label={t("dayOfMonth")}>
            <Select
              value={settings.day_of_month ?? 1}
              onChange={(v) => patch("day_of_month", parseInt(v))}
              options={Array.from({ length: 28 }, (_, i) => ({
                value: i + 1,
                label: String(i + 1),
              }))}
            />
          </Row>
        )}

        {settings.frequency !== "manual" && (
          <Row label={t("time24h")}>
            <input
              type="time"
              value={settings.time_of_day}
              onChange={(e) => patch("time_of_day", e.target.value)}
              className="rounded border border-default bg-surface-1 px-2 py-0.5 text-[10px] text-tertiary outline-none focus:border-violet-500/40"
            />
          </Row>
        )}
      </div>

      {/* Behaviour */}
      <div className="rounded border border-subtle bg-surface-1 px-3 py-2.5 space-y-0">
        <Label>{t("behaviour")}</Label>
        <Row label={t("autoSubmitApproval")}>
          <Toggle value={settings.auto_submit} onChange={(v) => patch("auto_submit", v)} />
        </Row>
        <Row label={t("statusesToBundle")}>
          <input
            value={settings.bundle_statuses}
            onChange={(e) => patch("bundle_statuses", e.target.value)}
            className="w-44 rounded border border-default bg-surface-1 px-2 py-0.5 text-[10px] text-tertiary outline-none focus:border-violet-500/40"
          />
        </Row>
        <Row label={t("reportTitleTemplate")}>
          <input
            value={settings.report_name_template}
            onChange={(e) => patch("report_name_template", e.target.value)}
            className="w-44 rounded border border-default bg-surface-1 px-2 py-0.5 text-[10px] text-tertiary outline-none focus:border-violet-500/40"
          />
        </Row>
      </div>

      {/* Status */}
      <div className="rounded border border-subtle bg-surface-1 px-3 py-2.5 space-y-0">
        <Label>{t("status")}</Label>
        <Row label={t("lastRun")}>
          <span className="text-[10px] text-muted">{fmtDt(settings.last_run_at)}</span>
        </Row>
        <Row label={t("nextScheduledRun")}>
          <span className="text-[10px] text-muted">{fmtDt(settings.next_run_at)}</span>
        </Row>
      </div>

      {/* Last trigger result */}
      {lastResult && (
        <div className="rounded border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 space-y-0.5">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3 w-3 text-success/60" />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-emerald-300/55">
              {t("cycleComplete")}
            </span>
          </div>
          <p className="text-[10px] text-success/50">
            {t("reportsCreated", { count: lastResult.reports_created })}
            {" · "}
            {t("expensesBundled", { count: lastResult.expenses_bundled })}
            {" · "}
            {t("usersProcessed", { count: lastResult.users_processed })}
          </p>
          {lastResult.skipped_users > 0 && (
            <p className="text-[9px] text-muted">
              {t("usersSkipped", { count: lastResult.skipped_users })}
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.04] px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-error/60" />
          <p className="text-[9.5px] text-error/60">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition-colors hover:bg-surface-3 hover:text-secondary disabled:cursor-not-allowed disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saving ? tc("saving") : t("saveSettings")}
        </button>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={triggering}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {triggering ? t("running") : t("runNow")}
        </button>
      </div>
      <p className="text-[8px] text-muted">
        {t("templateTokensNote", { user: "{user}", month: "{month}", year: "{year}", date: "{date}" })}
      </p>
    </div>
  );
}
