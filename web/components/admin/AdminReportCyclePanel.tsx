"use client";

import { useEffect, useState } from "react";
import { Zap, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

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

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[8.5px] font-bold uppercase tracking-[0.1em] text-white/25">
      {children}
    </p>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] text-white/40">{label}</span>
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
        value ? "bg-violet-600/60" : "bg-white/10"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white/80 shadow transition-transform ${
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
      className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55 outline-none focus:border-violet-500/40"
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
      .catch(() => setError("Failed to load settings."));
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
      setError(e.message ?? "Save failed.");
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
      setError(e.message ?? "Trigger failed.");
    } finally {
      setTriggering(false);
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-white/20" />
      </div>
    );
  }

  const showDayOfWeek = settings.frequency === "weekly" || settings.frequency === "biweekly";
  const showDayOfMonth = settings.frequency === "monthly";

  return (
    <div className="space-y-4">
      {/* Master toggle */}
      <div className="flex items-center justify-between rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2">
        <div>
          <p className="text-[10px] font-semibold text-white/55">Automatic report generation</p>
          <p className="text-[9px] text-white/28">
            {settings.enabled ? "Cycles are active" : "Disabled — reports must be triggered manually"}
          </p>
        </div>
        <Toggle value={settings.enabled} onChange={(v) => patch("enabled", v)} />
      </div>

      {/* Schedule */}
      <div className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-0">
        <Label>Schedule</Label>
        <Row label="Frequency">
          <Select
            value={settings.frequency}
            onChange={(v) => patch("frequency", v as CycleSettings["frequency"])}
            options={[
              { value: "weekly", label: "Weekly" },
              { value: "biweekly", label: "Every 2 weeks" },
              { value: "monthly", label: "Monthly" },
              { value: "manual", label: "Manual only" },
            ]}
          />
        </Row>

        {showDayOfWeek && (
          <Row label="Day of week">
            <Select
              value={settings.day_of_week ?? 4}
              onChange={(v) => patch("day_of_week", parseInt(v))}
              options={DAY_NAMES.map((d, i) => ({ value: i, label: d }))}
            />
          </Row>
        )}

        {showDayOfMonth && (
          <Row label="Day of month">
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
          <Row label="Time (24h)">
            <input
              type="time"
              value={settings.time_of_day}
              onChange={(e) => patch("time_of_day", e.target.value)}
              className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55 outline-none focus:border-violet-500/40"
            />
          </Row>
        )}
      </div>

      {/* Behaviour */}
      <div className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-0">
        <Label>Behaviour</Label>
        <Row label="Auto-submit to approval">
          <Toggle value={settings.auto_submit} onChange={(v) => patch("auto_submit", v)} />
        </Row>
        <Row label="Statuses to bundle">
          <input
            value={settings.bundle_statuses}
            onChange={(e) => patch("bundle_statuses", e.target.value)}
            className="w-44 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55 outline-none focus:border-violet-500/40"
          />
        </Row>
        <Row label="Report title template">
          <input
            value={settings.report_name_template}
            onChange={(e) => patch("report_name_template", e.target.value)}
            className="w-44 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] text-white/55 outline-none focus:border-violet-500/40"
          />
        </Row>
      </div>

      {/* Status */}
      <div className="rounded border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-0">
        <Label>Status</Label>
        <Row label="Last run">
          <span className="text-[10px] text-white/35">{fmtDt(settings.last_run_at)}</span>
        </Row>
        <Row label="Next scheduled run">
          <span className="text-[10px] text-white/35">{fmtDt(settings.next_run_at)}</span>
        </Row>
      </div>

      {/* Last trigger result */}
      {lastResult && (
        <div className="rounded border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2 space-y-0.5">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400/60" />
            <span className="text-[9px] font-semibold uppercase tracking-widest text-emerald-300/55">
              Cycle complete
            </span>
          </div>
          <p className="text-[10px] text-emerald-200/50">
            {lastResult.reports_created} report{lastResult.reports_created !== 1 ? "s" : ""} created
            · {lastResult.expenses_bundled} expense{lastResult.expenses_bundled !== 1 ? "s" : ""} bundled
            · {lastResult.users_processed} user{lastResult.users_processed !== 1 ? "s" : ""} processed
          </p>
          {lastResult.skipped_users > 0 && (
            <p className="text-[9px] text-white/25">
              {lastResult.skipped_users} user{lastResult.skipped_users !== 1 ? "s" : ""} skipped (no qualifying expenses)
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded border border-red-500/20 bg-red-500/[0.04] px-2.5 py-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-red-400/60" />
          <p className="text-[9.5px] text-red-300/60">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[10px] font-semibold text-white/45 transition-colors hover:bg-white/[0.07] hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {saving ? "Saving…" : "Save settings"}
        </button>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={triggering}
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {triggering ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {triggering ? "Running…" : "Run now"}
        </button>
      </div>
      <p className="text-[8px] text-white/15">
        Tokens for title template: {"{user}"} {"{month}"} {"{year}"} {"{date}"}
      </p>
    </div>
  );
}
