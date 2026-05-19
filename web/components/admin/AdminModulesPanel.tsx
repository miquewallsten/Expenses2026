"use client";

import { useState, useEffect } from "react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import {
  CheckCircle2, Settings, Puzzle, Clock, Archive, Sparkles,
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
    <div className={`group relative overflow-hidden rounded-lg border transition-all ${
      locked ? "border-subtle/50" : "border-default hover:border-strong"
    } ${isComing ? "opacity-60" : ""} bg-surface-1`}>
      {/* Gradient background for installed modules */}
      {isInstalled && (
        <div className="" />
      )}

      {/* Main row */}
      <div className="relative flex items-center gap-3 px-4 py-3">
        {/* Icon with status indicator */}
        <div className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isInstalled
            ? "bg-success/10 text-success"
            : locked
            ? "bg-surface-2 text-muted"
            : "bg-accent/5 text-accent"
        }`}>
          {mod.icon}
          {/* Installed checkmark */}
          {isInstalled && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-success text-white">
              <CheckCircle2 className="h-2 w-2" />
            </span>
          )}
        </div>

        {/* Name + description */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold text-secondary">{ta(mod.nameKey)}</span>
            {isInstalled && (
              <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-success/80">
                <PackageCheck className="h-2.5 w-2.5" />
                {tm("installed")}
              </span>
            )}
            {!isInstalled && !locked && (
              <span className="rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted">
                {tm("notInstalled")}
              </span>
            )}
            {isComing && (
              <span className="rounded-full border border-warning/15 bg-warning/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-warning/60">
                {tm("comingSoon")}
              </span>
            )}
            {isPremium && (
              <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-warning/70">
                <Sparkles className="h-2 w-2" />
                {tm("premium")}
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">{ta(mod.descKey)}</p>
        </div>

        {/* Actions */}
        {isPremium ? (
          <div className="flex shrink-0 items-center">
            <a
              href="mailto:ventas@financial-ops.mx?subject=Contratar%20add-on%20Subcontratistas"
              className="inline-flex items-center gap-1.5 rounded-lg border border-warning/20 bg-warning/5 px-3 py-1.5 text-[10px] font-semibold text-warning/80 transition-all hover:border-warning/30 hover:bg-warning/10"
            >
              {tm("contactSales")}
              <ExternalLink className="h-2.5 w-2.5 opacity-70" />
            </a>
          </div>
        ) : !isComing && (
          <div className="flex shrink-0 items-center gap-2">
            {isInstalled ? (
              <>
                {/* Configure */}
                {(mod.configTarget || mod.configInline) && (
                  <button
                    type="button"
                    onClick={handleConfigureClick}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-medium text-tertiary transition-all hover:border-strong hover:text-secondary"
                  >
                    <Settings className="h-3 w-3" />
                    {tm("configure")}
                    {mod.configTarget?.type === "href" && <ExternalLink className="h-2.5 w-2.5 opacity-60" />}
                    {mod.configInline && (
                      <ChevronRight className={`h-3 w-3 transition-transform ${phase === "showConfig" ? "rotate-90" : ""}`} />
                    )}
                  </button>
                )}
                {/* Uninstall */}
                {phase === "confirmUninstall" || phase === "working" ? null : (
                  <button
                    type="button"
                    onClick={() => setPhase("confirmUninstall")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-1 px-3 py-1.5 text-[10px] font-medium text-muted transition-all hover:border-error/20 hover:text-error/70"
                  >
                    <PackageX className="h-3 w-3" />
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
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:border-accent/30 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="flex items-center justify-between border-t border-subtle bg-blue-950/30 px-4 py-2.5">
          <p className="text-[10px] text-secondary">
            {tm("confirmInstallText", { name: ta(mod.nameKey) })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPhase("idle")} className="text-[10px] text-muted hover:text-tertiary">
              {tm("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmInstall}
              className="rounded border bg-accent-muted bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent hover:bg-accent-muted"
            >
              {tm("confirmInstall")}
            </button>
          </div>
        </div>
      )}

      {phase === "confirmUninstall" && (
        <div className="flex items-center justify-between border-t border-subtle bg-red-950/20 px-4 py-2.5">
          <p className="text-[10px] text-secondary">
            {tm("confirmUninstallText", { name: ta(mod.nameKey) })}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPhase("idle")} className="text-[10px] text-muted hover:text-tertiary">
              {tm("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmUninstall}
              className="rounded border border-red-500/25 bg-red-500/[0.1] px-3 py-1 text-[10px] font-semibold text-error hover:bg-error-muted"
            >
              {tm("confirmUninstall")}
            </button>
          </div>
        </div>
      )}

      {phase === "working" && (
        <div className="flex items-center gap-2 border-t border-subtle px-4 py-2.5">
          <Loader2 className="h-3 w-3 animate-spin text-muted" />
          <span className="text-[10px] text-muted">{tm("working")}</span>
        </div>
      )}

      {/* Inline config panel */}
      {phase === "showConfig" && mod.key === "purchase_requests" && (
        <div className="border-t border-subtle section-subtle px-4 py-3">
          <p className="text-[10px] text-muted">{tm("purchaseRequestsConfigNote")}</p>
        </div>
      )}

      {phase === "showConfig" && mod.key === "amex_reconciliation" && (
        <div className="border-t border-subtle section-subtle px-4 py-3">
          <p className="text-[10px] text-muted">{tm("amexReconciliationConfigNote")}</p>
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
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-4">
      <PremiumHeader
        section="modules"
        icon={<Puzzle className="h-4 w-4" />}
        title={tm("title")}
        subtitle="Manage modular business domains and add-ons"
        metrics={[
          {
            label: "installed",
            value: installedCount,
            tone: "success",
          },
          {
            label: "available",
            value: availableCount - installedCount,
            tone: "neutral",
          },
        ]}
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-[10px] text-error/80">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4">
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

      <p className="mt-4 text-[9px] font-medium tracking-wide text-muted uppercase">
        {tm("footerNote")}
      </p>
    </div>
  );
}
