"use client";

import { useState, useEffect } from "react";
import {
  CheckCircle2, Settings, Puzzle, Clock, Archive,
  ShoppingCart, Users, CreditCard, ChevronRight, AlertTriangle, Loader2,
  ExternalLink, Package, PackageCheck, PackageX,
} from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { apiPatch } from "@/lib/api/client";
import { useTranslations } from "next-intl";

// ── Module catalogue ──────────────────────────────────────────────────────────

type ModuleStatus = "active" | "inactive" | "coming_soon" | "premium";

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
    key: "purchase_requests",
    setupFlag: "purchase_requests_module_enabled",
    nameKey: "purchaseRequestsName",
    descKey: "purchaseRequestsDesc",
    icon: <ShoppingCart className="h-3.5 w-3.5" />,
    status: "inactive",
    configInline: true,
  },
  {
    key: "amex_reconciliation",
    setupFlag: "amex_reconciliation_module_enabled",
    nameKey: "amexReconciliationName",
    descKey: "amexReconciliationDesc",
    icon: <CreditCard className="h-3.5 w-3.5" />,
    status: "inactive",
    configInline: true,
  },
  {
    key: "subcontractor",
    setupFlag: "subcontractor_module_enabled",
    nameKey: "subcontractorName",
    descKey: "subcontractorDesc",
    icon: <Users className="h-3.5 w-3.5" />,
    status: "premium",
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companySetup: Record<string, any> | null;
  onSetupChanged: (updated: Record<string, any>) => void;
  onNavigate?: (section: string) => void;
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

  const isComing   = mod.status === "coming_soon";
  const isPremium  = mod.status === "premium";
  const locked     = isComing || isPremium;

  function handleConfigureClick() {
    if (!mod.configTarget && !mod.configInline) return;
    if (mod.configInline) {
      setPhase(phase === "showConfig" ? "idle" : "showConfig");
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
    <div className={`rounded border ${locked ? "border-white/[0.05]" : "border-white/[0.07]"} ${isComing ? "opacity-50" : ""} bg-white/[0.02]`}>
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Icon */}
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border ${
          isInstalled
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
            : locked
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
            {!isInstalled && !locked && (
              <span className="rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-white/22">
                {tm("notInstalled")}
              </span>
            )}
            {isComing && (
              <span className="rounded border border-amber-500/15 bg-amber-500/[0.06] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-amber-400/60">
                {tm("comingSoon")}
              </span>
            )}
            {isPremium && (
              <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/[0.08] px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-widest text-amber-300/75">
                {tm("premium")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/30">{ta(mod.descKey)}</p>
        </div>

        {/* Actions */}
        {isPremium ? (
          <div className="flex shrink-0 items-center">
            <a
              href="mailto:ventas@financial-ops.mx?subject=Contratar%20add-on%20Subcontratistas"
              className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/[0.08] px-3 py-1 text-[10px] font-semibold text-amber-300/85 transition-colors hover:bg-amber-500/[0.14] hover:text-amber-200"
            >
              {tm("contactSales")}
              <ExternalLink className="h-2.5 w-2.5 opacity-70" />
            </a>
          </div>
        ) : !isComing && (
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
      {phase === "showConfig" && mod.key === "purchase_requests" && (
        <div className="border-t border-white/[0.05] bg-black/10 px-4 py-3">
          <p className="text-[10px] text-white/35">{tm("purchaseRequestsConfigNote")}</p>
        </div>
      )}

      {phase === "showConfig" && mod.key === "amex_reconciliation" && (
        <div className="border-t border-white/[0.05] bg-black/10 px-4 py-3">
          <p className="text-[10px] text-white/35">{tm("amexReconciliationConfigNote")}</p>
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
    const updated = await apiPatch<Record<string, unknown>>(`/admin/company-setup/${companyId}`, { [flag]: value });
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
