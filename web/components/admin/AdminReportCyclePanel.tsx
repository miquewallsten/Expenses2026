"use client";

import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
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

// ── Main component ────────────────────────────────────────────────────────────

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
    <div className="mx-auto max-w-2xl space-y-5 px-4 py-4">
      <PremiumHeader
        section="notifications"
        icon={<Zap className="h-4 w-4" />}
        title={t("autoReportGeneration")}
        subtitle="Automated Report Cycles"
        metrics={[
          {
            label: "active",
            value: settings.enabled ? "ON" : "OFF",
            tone: settings.enabled ? "success" : "neutral",
          },
        ]}
        action={
          <div className="flex items-center gap-3">
             <Toggle value={settings.enabled} onChange={(v) => patch("enabled", v)} />
          </div>
        }
      />

      {/* Schedule */}
      <div>
        <SectionLabel>{t("schedule")}</SectionLabel>
        <SectionPanel>
          <Row label={t("frequency")}>
            <select
              value={settings.frequency}
              onChange={(e) => patch("frequency", e.target.value as CycleSettings["frequency"])}
              className={`${inputClasses.select} w-44`}
            >
              <option value="weekly">{t("freqWeekly")}</option>
              <option value="biweekly">{t("freqBiweekly")}</option>
              <option value="monthly">{t("freqMonthly")}</option>
              <option value="manual">{t("freqManual")}</option>
            </select>
          </Row>

          {showDayOfWeek && (
            <Row label={t("dayOfWeek")}>
              <select
                value={settings.day_of_week ?? 4}
                onChange={(e) => patch("day_of_week", parseInt(e.target.value))}
                className={`${inputClasses.select} w-44`}
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </Row>
          )}

          {showDayOfMonth && (
            <Row label={t("dayOfMonth")}>
              <select
                value={settings.day_of_month ?? 1}
                onChange={(e) => patch("day_of_month", parseInt(e.target.value))}
                className={`${inputClasses.select} w-44`}
              >
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </Row>
          )}

          {settings.frequency !== "manual" && (
            <Row label={t("time24h")}>
              <input
                type="time"
                value={settings.time_of_day}
                onChange={(e) => patch("time_of_day", e.target.value)}
                className={`${inputClasses.base} w-44`}
              />
            </Row>
          )}
        </SectionPanel>
      </div>

      {/* Behaviour */}
      <div>
        <SectionLabel>{t("behaviour")}</SectionLabel>
        <SectionPanel>
          <Row label={t("autoSubmitApproval")}>
            <Toggle value={settings.auto_submit} onChange={(v) => patch("auto_submit", v)} />
          </Row>
          <Row label={t("statusesToBundle")}>
            <input
              value={settings.bundle_statuses}
              onChange={(e) => patch("bundle_statuses", e.target.value)}
              className={`${inputClasses.base} w-44`}
            />
          </Row>
          <Row label={t("reportTitleTemplate")}>
            <input
              value={settings.report_name_template}
              onChange={(e) => patch("report_name_template", e.target.value)}
              className={`${inputClasses.base} w-44`}
            />
          </Row>
        </SectionPanel>
      </div>

      {/* Status */}
      <div>
        <SectionLabel>{t("status")}</SectionLabel>
        <SectionPanel>
          <Row label={t("lastRun")}>
             <span className="text-[10px] text-muted font-mono">{fmtDt(settings.last_run_at)}</span>
          </Row>
          <Row label={t("nextScheduledRun")}>
            <span className="text-[10px] text-muted font-mono">{fmtDt(settings.next_run_at)}</span>
          </Row>
        </SectionPanel>
      </div>

      {/* Last trigger result */}
      {lastResult && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
              {t("cycleComplete")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4">
             <div className="text-center">
              <p className="text-[11px] font-semibold text-emerald-300">{lastResult.reports_created}</p>
              <p className="text-[9px] text-muted uppercase">Reports</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-semibold text-emerald-300">{lastResult.expenses_bundled}</p>
              <p className="text-[9px] text-muted uppercase">Expenses</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] font-semibold text-emerald-300">{lastResult.users_processed}</p>
              <p className="text-[9px] text-muted uppercase">Users</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-error/20 bg-error/5 p-3 text-[10px] text-error">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-default bg-surface-2 px-4 py-2 text-[11px] font-semibold text-secondary transition-all hover:bg-surface-3 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? tc("saving") : t("saveSettings")}
        </button>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={triggering}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-violet-500 px-4 py-2 text-[11px] font-semibold text-white shadow-sm shadow-violet-500/20 transition-all hover:shadow-md disabled:opacity-40"
        >
          {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {triggering ? t("running") : t("runNow")}
        </button>
      </div>
      <p className="text-center text-[9px] text-muted font-medium tracking-wide uppercase">
        {t("templateTokensNote", { user: "{user}", month: "{month}", year: "{year}", date: "{date}" })}
      </p>
    </div>
  );
}
