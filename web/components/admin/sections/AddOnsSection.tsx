"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Puzzle,
  CheckCircle2,
  Sparkles,
  Lock,
  Settings2,
  Loader2,
  AlertTriangle,
  Database,
  ChevronRight,
} from "lucide-react";
import { apiCall } from "@/lib/api/client";

// ── Add-on registry ──────────────────────────────────────────────────────────

interface DataSummary {
  table: string;
  label: string;
  count: number;
}

interface AddOnEntry {
  key: string;
  flag: string;
  i18nKey: string;
  premium: boolean;
  /** Admin section to navigate to for configuration. */
  configSection: string | null;
  /** Data tables that this module owns (for uninstall warnings). */
  dataTables: string[];
  /** i18n key for uninstall warning message. */
  uninstallWarningKey: string;
}

const ADDONS: AddOnEntry[] = [
  {
    key: "archive",
    flag: "archive_module_enabled",
    i18nKey: "archive",
    premium: false,
    configSection: "addons",
    dataTables: ["archive_files"],
    uninstallWarningKey: "uninstallWarnArchive",
  },
  {
    key: "time_allocation",
    flag: "time_allocation_module_enabled",
    i18nKey: "timeAllocation",
    premium: false,
    configSection: "addons",
    dataTables: ["time_projects", "time_activities", "time_entries", "time_assignments"],
    uninstallWarningKey: "uninstallWarnTime",
  },
  {
    key: "purchase_requests",
    flag: "purchase_requests_module_enabled",
    i18nKey: "purchaseRequests",
    premium: false,
    configSection: "addons",
    dataTables: ["purchase_requests", "request_attachments"],
    uninstallWarningKey: "uninstallWarnRequests",
  },
  {
    key: "amex_reconciliation",
    flag: "amex_reconciliation_module_enabled",
    i18nKey: "amexReconciliation",
    premium: false,
    configSection: "addons",
    dataTables: ["amex_statements", "amex_statement_lines", "amex_cfdi_documents"],
    uninstallWarningKey: "uninstallWarnAmex",
  },
  {
    key: "subcontractor",
    flag: "subcontractor_module_enabled",
    i18nKey: "subcontractor",
    premium: true,
    configSection: "addons",
    dataTables: [],
    uninstallWarningKey: "uninstallWarnSubcontractor",
  },
];

type ModuleStatus = "installed" | "available" | "premium";

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  companySetup: Record<string, unknown>;
  onNavigate?: (section: string) => void;
}

export default function AddOnsSection({ companyId, companySetup, onNavigate }: Props) {
  const t = useTranslations("admin");
  const tm = useTranslations("admin.modules.addons");

  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localSetup, setLocalSetup] = useState<Record<string, unknown>>(companySetup);
  const [confirmUninstall, setConfirmUninstall] = useState<AddOnEntry | null>(null);
  const [dataCounts, setDataCounts] = useState<Record<string, DataSummary[]>>({});
  const [loadingData, setLoadingData] = useState<string | null>(null);

  useEffect(() => {
    setLocalSetup(companySetup);
  }, [companySetup]);

  // Fetch data counts for installed modules
  const fetchDataCounts = useCallback(async (addon: AddOnEntry) => {
    if (addon.dataTables.length === 0) return;
    setLoadingData(addon.key);
    try {
      const result = await apiCall<Record<string, number>>(
        `/admin/addons/${companyId}/data-counts?module=${addon.key}`
      );
      const summaries: DataSummary[] = addon.dataTables.map((table) => ({
        table,
        label: table,
        count: result[table] ?? 0,
      }));
      setDataCounts((prev) => ({ ...prev, [addon.key]: summaries }));
    } catch {
      // Silently fail - counts are optional info
    } finally {
      setLoadingData(null);
    }
  }, [companyId]);

  const toggleModule = useCallback(
    async (addon: AddOnEntry) => {
      if (addon.premium) return;

      const isEnabled = !!localSetup[addon.flag];

      // When disabling, show confirmation dialog with data warning
      if (isEnabled) {
        setConfirmUninstall(addon);
        await fetchDataCounts(addon);
        return;
      }

      // Enabling - just toggle
      setSaving(addon.key);
      setError(null);
      try {
        const updated = await apiCall<Record<string, unknown>>(
          `/admin/company-setup/${companyId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ [addon.flag]: true }),
          }
        );
        setLocalSetup(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to update module");
      } finally {
        setSaving(null);
      }
    },
    [companyId, localSetup, fetchDataCounts]
  );

  const confirmDisable = useCallback(async () => {
    if (!confirmUninstall) return;
    setSaving(confirmUninstall.key);
    setError(null);
    setConfirmUninstall(null);
    try {
      const updated = await apiCall<Record<string, unknown>>(
        `/admin/company-setup/${companyId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [confirmUninstall.flag]: false }),
        }
      );
      setLocalSetup(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update module");
    } finally {
      setSaving(null);
    }
  }, [companyId, confirmUninstall]);

  const installedCount = ADDONS.filter((a) => !!localSetup?.[a.flag]).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ai/10">
            <Puzzle className="h-4 w-4 text-ai" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-primary">{t("addonsLabel")}</h2>
            <p className="text-[10px] text-muted">
              {installedCount}/{ADDONS.length} {t("addonsActive")}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-[10px] text-error">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </div>
      )}

      {/* Uninstall confirmation dialog */}
      {confirmUninstall && (
        <div className="rounded-lg border border-warning/20 bg-warning/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-warning">{tm("uninstallConfirmTitle")}</span>
          </div>
          <p className="text-[10px] text-secondary">
            {tm(confirmUninstall.uninstallWarningKey)}
          </p>
          {/* Data counts */}
          {dataCounts[confirmUninstall.key] && dataCounts[confirmUninstall.key].length > 0 && (
            <div className="rounded-md border border-subtle/50 bg-surface-0 px-3 py-2 space-y-1">
              <div className="flex items-center gap-1.5 mb-1">
                <Database className="h-3 w-3 text-muted" />
                <span className="text-[9px] font-semibold text-muted">{tm("dataWillBePreserved")}</span>
              </div>
              {dataCounts[confirmUninstall.key].map((ds) => (
                <div key={ds.table} className="flex items-center justify-between">
                  <span className="text-[9px] text-muted font-mono">{ds.table}</span>
                  <span className="text-[9px] text-tertiary font-semibold">{ds.count} {tm("rows")}</span>
                </div>
              ))}
              <p className="text-[8px] text-muted pt-1">{tm("dataPreservedNote")}</p>
            </div>
          )}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmUninstall(null)}
              className="rounded border border-subtle px-3 py-1 text-[10px] font-medium text-secondary hover:bg-surface-2 transition-colors"
            >
              {tm("cancel")}
            </button>
            <button
              type="button"
              onClick={confirmDisable}
              className="rounded border border-warning/30 bg-warning/10 px-3 py-1 text-[10px] font-semibold text-warning hover:bg-warning/20 transition-colors"
            >
              {tm("confirmUninstall")}
            </button>
          </div>
        </div>
      )}

      {/* Add-on cards */}
      <div className="space-y-3">
        {ADDONS.map((addon) => {
          const isEnabled = !!localSetup?.[addon.flag];
          const isSaving = saving === addon.key;
          const status: ModuleStatus = isEnabled
            ? "installed"
            : addon.premium
            ? "premium"
            : "available";
          const counts = dataCounts[addon.key];
          const totalRows = counts ? counts.reduce((s, c) => s + c.count, 0) : 0;

          return (
            <div
              key={addon.key}
              className={`group relative overflow-hidden rounded-lg border transition-colors ${
                isEnabled
                  ? "border-emerald-500/15 bg-emerald-500/[0.02]"
                  : "border-default bg-surface-1"
              }`}
            >
              <div className="flex items-start gap-4 p-4">
                {/* Icon + content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">
                      {tm(`${addon.i18nKey}Name`)}
                    </span>
                    {addon.premium && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/5 px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-warning/70">
                        <Sparkles className="h-2 w-2" />
                        Premium
                      </span>
                    )}
                    {isEnabled && addon.configSection && onNavigate && (
                      <button
                        type="button"
                        onClick={() => onNavigate(addon.configSection!)}
                        className="inline-flex items-center gap-1 rounded border border-subtle px-1.5 py-0.5 text-[8px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
                      >
                        <Settings2 className="h-2.5 w-2.5" />
                        {t("addonsConfigure")}
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-muted">
                    {tm(`${addon.i18nKey}Desc`)}
                  </p>
                  {/* Data counts for installed modules */}
                  {isEnabled && counts && totalRows > 0 && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      {counts.map((ds) => (
                        ds.count > 0 ? (
                          <span key={ds.table} className="inline-flex items-center gap-1 rounded border border-subtle/50 bg-surface-0 px-1.5 py-0.5 text-[8px] font-mono text-muted">
                            <Database className="h-2 w-2" />
                            {ds.count} {ds.table.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                          </span>
                        ) : null
                      ))}
                    </div>
                  )}
                  {isEnabled && loadingData === addon.key && (
                    <div className="mt-2"><Loader2 className="h-3 w-3 animate-spin text-muted" /></div>
                  )}
                </div>

                {/* Status + toggle */}
                <div className="flex shrink-0 items-center gap-3">
                  {status === "installed" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-success/80">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      {t("addonsStatusInstalled")}
                    </span>
                  )}
                  {status === "available" && (
                    <span className="rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted">
                      {t("addonsStatusAvailable")}
                    </span>
                  )}
                  {status === "premium" && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-warning/15 bg-warning/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-warning/60">
                      <Lock className="h-2.5 w-2.5" />
                      {t("addonsStatusPremium")}
                    </span>
                  )}

                  {/* Toggle switch */}
                  {!addon.premium && (
                    <button
                      type="button"
                      onClick={() => toggleModule(addon)}
                      disabled={isSaving}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
                        isEnabled ? "bg-accent" : "bg-surface-2"
                      }`}
                      aria-label={`${isEnabled ? t("addonsDisable") : t("addonsEnable")} ${tm(`${addon.i18nKey}Name`)}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                          isEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                      {isSaving && (
                        <Loader2 className="absolute inset-0 m-auto h-3 w-3 animate-spin text-white" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Premium notice */}
      <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-4 py-3">
        <Lock className="h-3.5 w-3.5 shrink-0 text-warning/40" />
        <p className="text-[10px] text-muted">
          {t("addonsPremiumNotice")}
        </p>
      </div>

      {/* Data retention notice */}
      <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-4 py-3">
        <Database className="h-3.5 w-3.5 shrink-0 text-muted" />
        <p className="text-[10px] text-muted">
          {tm("dataRetentionNotice")}
        </p>
      </div>
    </div>
  );
}
