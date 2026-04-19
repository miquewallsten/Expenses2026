"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/shell/AppShell";
import { getCurrentRole, getCurrentUserId, getCurrentCompanyId } from "@/lib/session";
import { buildGlobalNav, GlobalNavItem } from "@/lib/navigation";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

const SECTIONS = [
  "Profile",
  "Language & Region",
  "Notifications",
  "Appearance",
  "AI Preferences",
];

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

const AI_HINTS: Record<string, string> = {
  "Profile":            "Your display name and user ID are used in audit logs and approval notifications.",
  "Language & Region":  "Language affects all UI labels and date formats. Timezone is used when rendering invoice dates and approval timestamps.",
  "Notifications":      "Email and in-app notifications are triggered by submission status changes and approval events.",
  "Appearance":         "Theme selection persists in localStorage. Dark mode is recommended for extended document review sessions.",
  "AI Preferences":     "Enabling the AI panel by default loads Copilot context on every page. Disable to improve initial load performance.",
};

function WorkList({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (s: string) => void;
}) {
  return (
    <ul className="py-1">
      {SECTIONS.map((s) => (
        <li key={s}>
          <button
            onClick={() => onSelect(s)}
            className={`w-full px-4 py-2.5 text-left text-xs transition-colors ${
              active === s
                ? "bg-white/10 text-white font-semibold"
                : "text-white/50 hover:text-white/75 hover:bg-white/5"
            }`}
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SettingsDetail({ section }: { section: string }) {
  const [language, setLanguage]       = useState("en");
  const [timezone, setTimezone]       = useState("America/Mexico_City");
  const [theme, setTheme]             = useState("dark");
  const [notifications, setNotifications] = useState(true);
  const [aiOpen, setAiOpen]           = useState(false);

  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-white/35 mb-1.5";
  const inputCls = "w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-white/20 transition-colors";
  const selectCls = `${inputCls} bg-zinc-900`;

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-white">{section}</h2>
        <p className="mt-0.5 text-xs text-white/35">
          {AI_HINTS[section]}
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-white/[0.07] bg-black/20 p-5">
        {(section === "Language & Region" || section === "Profile") && (
          <>
            <div>
              <label className={labelCls}>Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={selectCls}>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="pt">Português</option>
                <option value="fr">Français</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Timezone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className={selectCls}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>
          </>
        )}

        {section === "Appearance" && (
          <div>
            <label className={labelCls}>Theme</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className={selectCls}>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </div>
        )}

        {section === "Notifications" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/75 font-medium">Enable Notifications</div>
              <div className="text-xs text-white/35 mt-0.5">Receive in-app alerts for approvals and submissions.</div>
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

        {section === "AI Preferences" && (
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/75 font-medium">AI Panel Open by Default</div>
              <div className="text-xs text-white/35 mt-0.5">Automatically expand the Copilot panel on page load.</div>
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
        <button className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors">
          Save Changes
        </button>
        <button className="rounded-lg px-4 py-2 text-xs font-medium text-white/35 hover:text-white/60 transition-colors">
          Reset to Default
        </button>
      </div>
    </div>
  );
}

function AiPanel({ section }: { section: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">About this section</div>
        <p className="text-xs text-white/50 leading-relaxed">{AI_HINTS[section]}</p>
      </div>
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-white/25 mb-1.5">Suggestion</div>
        <p className="text-xs text-white/40 leading-relaxed">
          {section === "Language & Region"
            ? "Your invoices use MXN. Setting timezone to America/Mexico_City ensures dates align with SAT timestamps."
            : section === "Notifications"
            ? "Enable notifications to stay informed when a submitted expense report changes status."
            : section === "AI Preferences"
            ? "Keeping the AI panel open is recommended when reviewing complex CFDI documents."
            : "No suggestions for this section."}
        </p>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState("Language & Region");
  const [globalNavItems, setGlobalNavItems] = useState<GlobalNavItem[]>([]);

  useEffect(() => {
    const role      = getCurrentRole();
    const userId    = getCurrentUserId();
    const companyId = getCurrentCompanyId() ?? "1";

    Promise.all([
      userId
        ? fetch(`${API}/modules/visible/${companyId}?user_id=${userId}`).then((r) => r.ok ? r.json() : { enabled_module_keys: [] })
        : Promise.resolve({ enabled_module_keys: [] }),
      userId
        ? fetch(`${API}/roles/user-permissions/${userId}`).then((r) => r.ok ? r.json() : { permission_keys: [] })
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
      title="Settings"
      globalNavItems={globalNavItems}
      workListTitle="Settings"
      workList={
        <WorkList active={activeSection} onSelect={setActiveSection} />
      }
      detail={<SettingsDetail section={activeSection} />}
      aiPanel={
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 px-3 py-4">
          <AiPanel section={activeSection} />
        </aside>
      }
    />
  );
}
