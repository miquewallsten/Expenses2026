"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale, type Locale } from "@/context/LocaleContext";
import { apiCall, apiPatch } from "@/lib/api/client";
import { useTheme, type Theme } from "@/components/shell/ThemeProvider";

const NOTIFICATION_EVENT_TYPES = [
  "expense.submitted",
  "expense.approved",
  "expense.rejected",
  "expense.returned",
  "expense.daily_digest",
  "expense.approval_nudge_48h",
  "auth.magic_link",
] as const;

type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

interface NotificationPreference {
  event_type: string;
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  digest_only: boolean;
}

function NotificationPreferences() {
  const t = useTranslations("settings.notificationPrefs");
  const [rows, setRows] = useState<Record<string, NotificationPreference>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiCall<NotificationPreference[]>("/me/notification-preferences");
        if (cancelled) return;
        const map: Record<string, NotificationPreference> = {};
        for (const r of data) map[r.event_type] = r;
        setRows(map);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(
    async (
      event_type: NotificationEventType,
      field: "email_enabled" | "whatsapp_enabled" | "digest_only",
    ) => {
      const current = rows[event_type] ?? {
        event_type,
        email_enabled: true,
        whatsapp_enabled: true,
        digest_only: false,
      };
      const next = { ...current, [field]: !current[field] };
      setBusy(`${event_type}:${field}`);
      setError(null);
      try {
        const saved = await apiPatch<NotificationPreference>(
          "/me/notification-preferences",
          { event_type, [field]: next[field] },
        );
        setRows((prev) => ({ ...prev, [event_type]: saved }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusy(null);
      }
    },
    [rows],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[11px] text-white/45">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {error && (
        <div className="rounded border border-rose-500/30 bg-rose-500/[0.08] p-2 text-[10.5px] text-rose-200 break-all">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded border border-white/[0.07]">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.07] bg-white/[0.02] text-left text-[9.5px] uppercase tracking-wide text-white/35">
              <th className="px-2.5 py-2 font-medium">{t("th.event")}</th>
              <th className="px-2 py-2 text-center font-medium">{t("th.email")}</th>
              <th className="px-2 py-2 text-center font-medium">
                {t("th.whatsapp")}
              </th>
              <th className="px-2 py-2 text-center font-medium">
                {t("th.digestOnly")}
              </th>
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_EVENT_TYPES.map((evt) => {
              const r = rows[evt] ?? {
                event_type: evt,
                email_enabled: true,
                whatsapp_enabled: true,
                digest_only: false,
              };
              return (
                <tr
                  key={evt}
                  className="border-b border-white/[0.04] last:border-b-0"
                >
                  <td className="px-2.5 py-1.5">
                    <div className="text-[11px] text-white/80">
                      {t(`events.${evt}.label` as Parameters<typeof t>[0])}
                    </div>
                    <div className="font-mono text-[9.5px] text-white/30">
                      {evt}
                    </div>
                  </td>
                  {(
                    [
                      "email_enabled",
                      "whatsapp_enabled",
                      "digest_only",
                    ] as const
                  ).map((field) => (
                    <td key={field} className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        disabled={busy === `${evt}:${field}`}
                        onClick={() => void toggle(evt, field)}
                        className={`relative inline-block h-4 w-7 rounded-full transition-colors disabled:opacity-50 ${
                          r[field] ? "bg-emerald-500/70" : "bg-white/10"
                        }`}
                        aria-label={`${t(`events.${evt}.label` as Parameters<typeof t>[0])} · ${t(`th.${field === "email_enabled" ? "email" : field === "whatsapp_enabled" ? "whatsapp" : "digestOnly"}`)}`}
                      >
                        <span
                          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                            r[field] ? "translate-x-3.5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-white/30">{t("footnote")}</p>
    </div>
  );
}

type SectionKey = "profile" | "languageRegion" | "notifications" | "appearance" | "aiPreferences";
const SECTION_KEYS: SectionKey[] = ["profile", "languageRegion", "notifications", "appearance", "aiPreferences"];

const TIMEZONES = [
  "America/Mexico_City",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "UTC",
];

function SettingsDetail({ sectionKey }: { sectionKey: SectionKey }) {
  const t = useTranslations("settings");
  const { locale, setLocale } = useLocale();
  const themeCtx = useTheme();
  const [timezone, setTimezone]           = useState("America/Mexico_City");
  const [localTheme, setLocalTheme] = useState<Theme>(() =>
    (typeof window !== "undefined" ? (localStorage.getItem("pref_theme") ?? "dark") : "dark") as Theme
  );
  const [aiOpen, setAiOpen]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  const handleThemeChange = (next: Theme) => {
    setLocalTheme(next);
    themeCtx.setTheme(next);
  };

  useEffect(() => {
    setTimezone(localStorage.getItem("pref_timezone") ?? "America/Mexico_City");
    const raw = localStorage.getItem("pref_theme");
    setLocalTheme((raw === "dark" || raw === "light" || raw === "system" ? raw : "dark") as Theme);
    setAiOpen(localStorage.getItem("pref_ai_panel") === "true");
  }, []);

  const handleSave = () => {
    localStorage.setItem("pref_timezone", timezone);
    localStorage.setItem("pref_ai_panel", String(aiOpen));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTimezone("America/Mexico_City");
    handleThemeChange("dark");
    setAiOpen(false);
  };

  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5";
  const selectCls = "w-full rounded border border-white/10 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-white/20 transition-colors";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-semibold text-white">
          {t(`sections.${sectionKey}` as Parameters<typeof t>[0])}
        </h2>
        <p className="mt-0.5 text-xs text-white/35">
          {t(`hints.${sectionKey}` as Parameters<typeof t>[0])}
        </p>
      </div>

      <div className="space-y-4 rounded border border-white/[0.07] bg-black/20 p-4">
        {(sectionKey === "languageRegion" || sectionKey === "profile") && (
          <>
            <div>
              <label className={labelCls}>{t("language")}</label>
              <select value={locale} onChange={(e) => setLocale(e.target.value as Locale)} className={selectCls}>
                <option value="en">{t("langOptions.en")}</option>
                <option value="es">{t("langOptions.es")}</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("timezone")}</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectCls}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {sectionKey === "appearance" && (
          <div>
            <label className={labelCls}>{t("theme")}</label>
            <div className="flex gap-1 rounded border border-white/[0.08] bg-black/[0.15] p-1">
              {(["dark", "light", "system"] as const).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleThemeChange(opt)}
                  className={`flex-1 rounded px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    localTheme === opt
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-white/40 hover:text-white/70"
                  }`}
                >
                  {t(`themeOptions.${opt}` as Parameters<typeof t>[0])}
                </button>
              ))}
            </div>
          </div>
        )}

        {sectionKey === "notifications" && <NotificationPreferences />}

        {sectionKey === "aiPreferences" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-white/75 font-medium">{t("aiPanelDefault")}</div>
              <div className="text-[11px] text-white/35 mt-0.5">{t("aiPanelDesc")}</div>
            </div>
            <button
              onClick={() => setAiOpen((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${aiOpen ? "bg-emerald-500/70" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${aiOpen ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {/* Primary */}
        <button
          onClick={handleSave}
          className="rounded-md bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-500 active:bg-indigo-700"
        >
          {saved ? `✓ ${t("saved")}` : t("saveChanges")}
        </button>
        {/* Tertiary */}
        <button
          onClick={handleReset}
          className="rounded-md px-4 py-1.5 text-xs font-medium text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/65"
        >
          {t("resetDefault")}
        </button>
      </div>
    </div>
  );
}

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const t = useTranslations("settings");
  const tn = useTranslations("nav");
  const [activeSection, setActiveSection] = useState<SectionKey>("languageRegion");

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tn("settings")}
        className="animate-slide-in-right fixed inset-y-0 right-0 z-50 flex w-[min(680px,100vw)] flex-col overflow-hidden bg-zinc-950 shadow-2xl ring-1 ring-white/[0.07]"
      >
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.07] px-4">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">
            {tn("settings")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-7 w-7 items-center justify-center rounded text-white/30 transition-colors hover:bg-white/[0.06] hover:text-white/65"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body: sections sidebar + detail */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Sections sidebar */}
          <div className="flex w-44 shrink-0 flex-col border-r border-white/[0.07]">
            <div className="flex h-8 shrink-0 items-center border-b border-white/[0.07] px-3">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
                {t("title")}
              </span>
            </div>
            <ul className="py-1">
              {SECTION_KEYS.map((key) => (
                <li key={key}>
                  <button
                    onClick={() => setActiveSection(key)}
                    className={`relative w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                      activeSection === key
                        ? "bg-indigo-600/[0.15] font-semibold text-white"
                        : "text-white/45 hover:bg-white/[0.06] hover:text-white/75"
                    }`}
                  >
                    {t(`sections.${key}` as Parameters<typeof t>[0])}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Detail */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <SettingsDetail sectionKey={activeSection} />
          </div>

        </div>
      </div>
    </>
  );
}
