"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Settings, Puzzle, Clock, Archive, Bot,
  ShoppingCart, Users, ChevronRight, AlertTriangle, Loader2,
  ExternalLink, Package, PackageCheck, PackageX,
} from "lucide-react";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Module catalogue ──────────────────────────────────────────────────────────

type ModuleStatus = "active" | "inactive" | "coming_soon";

interface ModuleEntry {
  key: string;
  setupFlag: string;
  nameKey: string;
  descKey: string;
  icon: React.ReactNode;
  status: ModuleStatus;
  /** Section key in admin page to navigate to on Configure, or an external href */
  configTarget?: { type: "section"; key: string } | { type: "href"; href: string };
  /** When true, configure shows an inline detail panel instead of navigating */
  configInline?: boolean;
}

const ADDON_MODULES: ModuleEntry[] = [
  {
    key: "time_allocation",
    setupFlag: "time_allocation_module_enabled",
    nameKey: "timeAllocationName",
    descKey: "timeAllocationDesc",
    icon: <Clock className="h-3.5 w-3.5" />,
    status: "inactive",
    configTarget: { type: "href", href: "/time-admin" },
  },
  {
    key: "archive",
    setupFlag: "archive_module_enabled",
    nameKey: "archiveName",
    descKey: "archiveDesc",
    icon: <Archive className="h-3.5 w-3.5" />,
    status: "inactive",
    configTarget: { type: "section", key: "Archive Config" },
  },
  {
    key: "ai_copilot",
    setupFlag: "ai_copilot_enabled",
    nameKey: "aiCopilotName",
    descKey: "aiCopilotDesc",
    icon: <Bot className="h-3.5 w-3.5" />,
    status: "inactive",
    configInline: true,
  },
  {
    key: "purchase_requests",
    setupFlag: "purchase_requests_module_enabled",
    nameKey: "purchaseRequestsName",
    descKey: "purchaseRequestsDesc",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    status: "inactive",
    configInline: true,
  },
  {
    key: "subcontractor",
    setupFlag: "subcontractor_module_enabled",
    nameKey: "subcontractorName",
    descKey: "subcontractorDesc",
    icon: <Users className="h-3.5 w-3.5" />,
    status: "coming_soon",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companySetup: Record<string, any> | null;
  onSetupChanged: (updated: Record<string, any>) => void;
  onNavigate?: (section: string) => void;
}

// ── AI status ─────────────────────────────────────────────────────────────────

interface AiStatus {
  active_model: string;
  available: boolean;
  base_url: string;
  models: string[];
}

// ── Module row ────────────────────────────────────────────────────────────────

function ModuleRow({
  mod,
  isInstalled,
  onInstall,
  onUninstall,
  onNavigate,
  companySetupNull,
}: {
  mod: ModuleEntry;
  isInstalled: boolean;
  onInstall: (key: string, flag: string) => Promise<void>;
  onUninstall: (key: string, flag: string) => Promise<void>;
  onNavigate?: (section: string) => void;
  companySetupNull: boolean;
}) {
  const tm = useTranslations("admin.modules");
  const ta = useTranslations("admin.modules.addons");

  const [phase, setPhase] = useState<"idle" | "confirmInstall" | "confirmUninstall" | "working" | "showConfig">("idle");
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const isComing = mod.status === "coming_soon";

  function handleConfigureClick() {
    if (!mod.configTarget && !mod.configInline) return;
    if (mod.configInline) {
      if (phase === "showConfig") {
        setPhase("idle");
      } else {
        setPhase("showConfig");
        if (mod.key === "ai_copilot" && !aiStatus) {
          setAiLoading(true);
          fetch(`${API}/ai/status`, { headers: getAuthHeaders() })
            .then((r) => r.ok ? r.json() : null)
            .then((d) => setAiStatus(d))
            .finally(() => setAiLoading(false));
        }
      }
      return;
    }
    if (mod.configTarget?.type === "section" && onNavigate) {
      onNavigate(mod.configTarget.key);
    } else if (mod.configTarget?.type === "href") {
      window.open(mod.configTarget.href, "_self");
    }
  }

  async function confirmInstall() {
    setPhase("working");
    await onInstall(mod.key, mod.setupFlag);
    setPhase("idle");
  }

  async function confirmUninstall() {
    setPhase("working");
    await onUninstall(mod.key, mod.setupFlag);
    setPhase("idle");
  }

  return (
    <div className={`rounded border ${isComing ? "border-white/[0.05] opacity-50" : "border-white/[0.07]"} bg-white/[0.02]`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${
          isInstalled
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : isComing
            ? "border-white/[0.06] bg-white/[0.03] text-white/20"
            : "border-white/[0.08] bg-white/[0.03] text-white/30"
        }`}>
          {mod.icon}
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-white/80">{ta(mod.nameKey)}</span>
            {isInstalled && (
              <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-emerald-400">
                <PackageCheck className="h-2.5 w-2.5" />
                {tm("installed")}
              </span>
            )}
            {!isInstalled && !isComing && (
              <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-white/22">
                {tm("notInstalled")}
              </span>
            )}
            {isComing && (
              <span className="rounded border border-amber-500/15 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-amber-400/60">
                {tm("comingSoon")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/30">{ta(mod.descKey)}</p>
        </div>

        {/* Actions */}
        {!isComing && (
          <div className="flex shrink-0 items-center gap-1.5">
            {isInstalled ? (
              <>
                {/* Configure */}
                {(mod.configTarget || mod.configInline) && (
                  <button
                    type="button"
                    onClick={handleConfigureClick}
                    className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-white/45 transition-colors hover:border-white/15 hover:text-white/65"
                  >
                    <Settings className="h-2.5 w-2.5" />
                    {tm("configure")}
                    {mod.configTarget?.type === "href" && <ExternalLink className="h-2 w-2 opacity-60" />}
                    {mod.configInline && (
                      <ChevronRight className={`h-2.5 w-2.5 transition-transform ${phase === "showConfig" ? "rotate-90" : ""}`} />
                    )}
                  </button>
                )}
                {/* Uninstall */}
                {phase === "confirmUninstall" || phase === "working" ? null : (
                  <button
                    type="button"
                    onClick={() => setPhase("confirmUninstall")}
                    className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-white/25 transition-colors hover:border-red-500/20 hover:text-red-400/70"
                  >
                    <PackageX className="h-2.5 w-2.5" />
                    {tm("uninstall")}
                  </button>
                )}
              </>
            ) : (
              /* Install */
              phase === "confirmInstall" || phase === "working" ? null : (
                <button
                  type="button"
                  disabled={companySetupNull}
                  onClick={() => setPhase("confirmInstall")}
                  className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-600/[0.12] px-3 py-1 text-[10px] font-semibold text-indigo-300/80 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Package className="h-2.5 w-2.5" />
                  {tm("install")}
                </button>
              )
            )}
          </div>
        )}
      </div>

      {/* Confirm / working strip */}
      {phase === "confirmInstall" && (
        <div className="flex items-center justify-between border-t border-white/[0.05] bg-indigo-950/30 px-4 py-2.5">
          <p className="text-[10px] text-white/50">
            {tm("confirmInstallText", { name: ta(mod.nameKey) })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPhase("idle")} className="text-[10px] text-white/30 hover:text-white/55">
              {tm("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmInstall}
              className="rounded border border-indigo-500/30 bg-indigo-600/20 px-3 py-1 text-[10px] font-semibold text-indigo-300 hover:bg-indigo-600/30"
            >
              {tm("confirmInstall")}
            </button>
          </div>
        </div>
      )}

      {phase === "confirmUninstall" && (
        <div className="flex items-center justify-between border-t border-white/[0.05] bg-red-950/20 px-4 py-2.5">
          <p className="text-[10px] text-white/50">
            {tm("confirmUninstallText", { name: ta(mod.nameKey) })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPhase("idle")} className="text-[10px] text-white/30 hover:text-white/55">
              {tm("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmUninstall}
              className="rounded border border-red-500/25 bg-red-500/[0.1] px-3 py-1 text-[10px] font-semibold text-red-400 hover:bg-red-500/20"
            >
              {tm("confirmUninstall")}
            </button>
          </div>
        </div>
      )}

      {phase === "working" && (
        <div className="flex items-center gap-2 border-t border-white/[0.05] px-4 py-2.5">
          <Loader2 className="h-3 w-3 animate-spin text-white/30" />
          <span className="text-[10px] text-white/30">{tm("working")}</span>
        </div>
      )}

      {/* Inline config panel */}
      {phase === "showConfig" && mod.key === "ai_copilot" && (
        <div className="border-t border-white/[0.05] bg-black/10 px-4 py-3">
          {aiLoading ? (
            <div className="flex items-center gap-2 text-white/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-[10px]">{tm("loadingStatus")}</span>
            </div>
          ) : aiStatus ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${aiStatus.available ? "bg-emerald-400" : "bg-red-400"}`} />
                <span className="text-[10px] font-semibold text-white/60">
                  {aiStatus.available ? tm("aiAvailable") : tm("aiUnavailable")}
                </span>
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <span className="text-[9.5px] text-white/28">{tm("aiModel")}</span>
                <span className="truncate font-mono text-[9.5px] text-white/55">{aiStatus.active_model}</span>
                <span className="text-[9.5px] text-white/28">{tm("aiEndpoint")}</span>
                <span className="truncate font-mono text-[9.5px] text-white/55">{aiStatus.base_url}</span>
              </div>
              <p className="text-[9.5px] text-white/22">{tm("aiConfigNote")}</p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-amber-400/60">
              <AlertTriangle className="h-3 w-3" />
              <span className="text-[10px]">{tm("aiStatusError")}</span>
            </div>
          )}
        </div>
      )}

      {phase === "showConfig" && mod.key === "purchase_requests" && (
        <div className="border-t border-white/[0.05] bg-black/10 px-4 py-3">
          <p className="text-[10px] text-white/35">{tm("purchaseRequestsConfigNote")}</p>
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AdminModulesPanel({ companySetup, onSetupChanged, onNavigate }: Props) {
  const tm = useTranslations("admin.modules");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const installedCount = ADDON_MODULES.filter(
    (m) => m.status !== "coming_soon" && !!companySetup?.[m.setupFlag]
  ).length;
  const availableCount = ADDON_MODULES.filter((m) => m.status !== "coming_soon").length;

  async function setFlag(flag: string, value: boolean) {
    const companyId = getCurrentCompanyId() ?? "1";
    const res = await fetch(`${API}/admin/company-setup/${companyId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ [flag]: value }),
    });
    if (!res.ok) throw new Error(await res.text());
    const updated = await res.json();
    onSetupChanged(updated);
  }

  async function handleInstall(key: string, flag: string) {
    setError(null);
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await setFlag(flag, true);
    } catch (e: any) {
      setError(e?.message ?? tm("updateFailed"));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  async function handleUninstall(key: string, flag: string) {
    setError(null);
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await setFlag(flag, false);
    } catch (e: any) {
      setError(e?.message ?? tm("updateFailed"));
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">{tm("title")}</h2>
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {installedCount} / {availableCount}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[10px] text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {ADDON_MODULES.map((mod) => {
          const isInstalled = mod.status !== "coming_soon" && !!companySetup?.[mod.setupFlag];
          return (
            <ModuleRow
              key={mod.key}
              mod={mod}
              isInstalled={isInstalled}
              onInstall={handleInstall}
              onUninstall={handleUninstall}
              onNavigate={onNavigate}
              companySetupNull={companySetup === null}
            />
          );
        })}
      </div>

      <p className="mt-4 text-[9.5px] text-white/18">
        {tm("footerNote")}
      </p>
    </div>
  );
}
