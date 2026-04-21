"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale, type Locale } from "@/context/LocaleContext";

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
  const [timezone, setTimezone]           = useState("America/Mexico_City");
  const [theme, setTheme]                 = useState("dark");
  const [notifications, setNotifications] = useState(true);
  const [aiOpen, setAiOpen]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  useEffect(() => {
    setTimezone(localStorage.getItem("pref_timezone") ?? "America/Mexico_City");
    setTheme(localStorage.getItem("pref_theme") ?? "dark");
    setNotifications(localStorage.getItem("pref_notifications") !== "false");
    setAiOpen(localStorage.getItem("pref_ai_panel") === "true");
  }, []);

  const handleSave = () => {
    localStorage.setItem("pref_timezone", timezone);
    localStorage.setItem("pref_theme", theme);
    localStorage.setItem("pref_notifications", String(notifications));
    localStorage.setItem("pref_ai_panel", String(aiOpen));
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme !== "system") root.classList.add(theme);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setTimezone("America/Mexico_City");
    setTheme("dark");
    setNotifications(true);
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
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className={selectCls}>
              <option value="dark">{t("themeOptions.dark")}</option>
              <option value="light">{t("themeOptions.light")}</option>
              <option value="system">{t("themeOptions.system")}</option>
            </select>
          </div>
        )}

        {sectionKey === "notifications" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-white/75 font-medium">{t("enableNotifications")}</div>
              <div className="text-[11px] text-white/35 mt-0.5">{t("notificationsDesc")}</div>
            </div>
            <button
              onClick={() => setNotifications((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${notifications ? "bg-emerald-500/70" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${notifications ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>
        )}

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

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="rounded border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 transition-colors"
        >
          {saved ? `✓ ${t("saved")}` : t("saveChanges")}
        </button>
        <button
          onClick={handleReset}
          className="rounded px-4 py-1.5 text-xs font-medium text-white/35 hover:text-white/60 transition-colors"
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
        className="fixed inset-y-0 right-0 z-50 flex w-[min(680px,100vw)] flex-col overflow-hidden bg-zinc-950 shadow-2xl ring-1 ring-white/[0.07]"
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
                    className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                      activeSection === key
                        ? "bg-white/10 text-white font-semibold"
                        : "text-white/50 hover:text-white/75 hover:bg-white/5"
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
