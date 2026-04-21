"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import AppShell from "@/components/shell/AppShell";
import { getCurrentRole, getCurrentUserId, getCurrentCompanyId, getAuthHeaders } from "@/lib/session";
import { buildGlobalNav, GlobalNavItem } from "@/lib/navigation";
import { useLocale, type Locale } from "@/context/LocaleContext";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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

function WorkList({
  active,
  onSelect,
}: {
  active: SectionKey;
  onSelect: (s: SectionKey) => void;
}) {
  const t = useTranslations("settings");
  return (
    <ul className="py-1">
      {SECTION_KEYS.map((key) => (
        <li key={key}>
          <button
            onClick={() => onSelect(key)}
            className={`w-full px-4 py-2.5 text-left text-xs transition-colors ${
              active === key
                ? "bg-white/10 text-white font-semibold"
                : "text-white/50 hover:text-white/75 hover:bg-white/5"
            }`}
          >
            {t(`sections.${key}` as Parameters<typeof t>[0])}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SettingsDetail({ sectionKey }: { sectionKey: SectionKey }) {
  const t = useTranslations("settings");
  const { locale, setLocale } = useLocale();
  const [timezone, setTimezone]           = useState("America/Mexico_City");
  const [theme, setTheme]                 = useState("dark");
  const [notifications, setNotifications] = useState(true);
  const [aiOpen, setAiOpen]               = useState(false);
  const [saved, setSaved]                 = useState(false);

  // Load persisted preferences on mount
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
    // Apply theme to document root
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
  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors";
  const selectCls = `${inputCls} bg-zinc-900`;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-white">
          {t(`sections.${sectionKey}` as Parameters<typeof t>[0])}
        </h2>
        <p className="mt-0.5 text-xs text-white/35">
          {t(`hints.${sectionKey}` as Parameters<typeof t>[0])}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/[0.07] bg-black/20 p-5">
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
              <div className="text-sm text-white/75 font-medium">{t("enableNotifications")}</div>
              <div className="text-xs text-white/35 mt-0.5">{t("notificationsDesc")}</div>
            </div>
            <button
              onClick={() => setNotifications((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${notifications ? "bg-emerald-500/70" : "bg-white/10"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${notifications ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        )}

        {sectionKey === "aiPreferences" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/75 font-medium">{t("aiPanelDefault")}</div>
              <div className="text-xs text-white/35 mt-0.5">{t("aiPanelDesc")}</div>
            </div>
            <button
              onClick={() => setAiOpen((v) => !v)}
              className={`relative h-5 w-9 rounded-full transition-colors ${aiOpen ? "bg-emerald-500/70" : "bg-white/10"}`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${aiOpen ? "translate-x-4" : "translate-x-0.5"}`}
              />
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 transition-colors"
        >
          {saved ? `✓ ${t("saved")}` : t("saveChanges")}
        </button>
        <button
          onClick={handleReset}
          className="rounded-lg px-4 py-2 text-xs font-medium text-white/35 hover:text-white/60 transition-colors"
        >
          {t("resetDefault")}
        </button>
      </div>
    </div>
  );
}

function AiPanel({ sectionKey }: { sectionKey: SectionKey }) {
  const t = useTranslations("settings");
  const suggestionKey = (["languageRegion", "notifications", "aiPreferences"] as SectionKey[]).includes(sectionKey)
    ? sectionKey
    : "default";

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">
          {t("aboutSection")}
        </div>
        <p className="text-xs text-white/50 leading-relaxed">
          {t(`hints.${sectionKey}` as Parameters<typeof t>[0])}
        </p>
      </div>
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">
          {t("suggestion")}
        </div>
        <p className="text-xs text-white/40 leading-relaxed">
          {t(`suggestions.${suggestionKey}` as Parameters<typeof t>[0])}
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tn = useTranslations("nav");
  const [activeSection, setActiveSection] = useState<SectionKey>("languageRegion");
  const [globalNavItems, setGlobalNavItems] = useState<GlobalNavItem[]>([]);

  useEffect(() => {
    const role      = getCurrentRole();
    const userId    = getCurrentUserId();
    const companyId = getCurrentCompanyId() ?? "1";

    Promise.all([
      userId
        ? fetch(`${API}/modules/visible/${companyId}?user_id=${userId}`, { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : { enabled_module_keys: [] })
        : Promise.resolve({ enabled_module_keys: [] }),
      userId
        ? fetch(`${API}/roles/user-permissions/${userId}`, { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : { permission_keys: [] })
        : Promise.resolve({ permission_keys: [] }),
    ]).then(([modRes, permRes]) => {
      setGlobalNavItems(
        buildGlobalNav({
          role,
          enabledModuleKeys: modRes.enabled_module_keys ?? [],
          permissionKeys:    permRes.permission_keys ?? [],
          currentPortal:     "settings",
        })
      );
    }).catch(() => {
      setGlobalNavItems(
        buildGlobalNav({ role, enabledModuleKeys: [], permissionKeys: [], currentPortal: "settings" })
      );
    });
  }, []);

  return (
    <AppShell
      title={tn("settings")}
      globalNavItems={globalNavItems}
      workListTitle={t("title")}
      workList={
        <WorkList active={activeSection} onSelect={setActiveSection} />
      }
      detail={<SettingsDetail sectionKey={activeSection} />}
      aiPanel={
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 px-3 py-4">
          <AiPanel sectionKey={activeSection} />
        </aside>
      }
    />
  );
}
