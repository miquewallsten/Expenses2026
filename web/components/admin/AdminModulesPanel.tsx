"use client";

import { useState } from "react";
import { CheckCircle2, Settings, Puzzle } from "lucide-react";
import { getCurrentCompanyId } from "@/lib/session";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface ModuleEntry {
  key: string;
  setupFlag: string;
  nameKey: string;
  descKey: string;
}

const ADDON_MODULES: ModuleEntry[] = [
  { key: "time_allocation",    setupFlag: "time_allocation_module_enabled",     nameKey: "timeAllocationName",   descKey: "timeAllocationDesc" },
  { key: "reimbursements",     setupFlag: "reimbursements_module_enabled",       nameKey: "reimbursementsName",   descKey: "reimbursementsDesc" },
  { key: "archive",            setupFlag: "archive_module_enabled",              nameKey: "archiveName",          descKey: "archiveDesc" },
  { key: "subcontractor",      setupFlag: "subcontractor_module_enabled",        nameKey: "subcontractorName",    descKey: "subcontractorDesc" },
  { key: "ai_copilot",         setupFlag: "ai_copilot_enabled",                  nameKey: "aiCopilotName",        descKey: "aiCopilotDesc" },
  { key: "purchase_requests",  setupFlag: "purchase_requests_module_enabled",    nameKey: "purchaseRequestsName", descKey: "purchaseRequestsDesc" },
];

interface Props {
  companySetup: Record<string, any> | null;
  onSetupChanged: (updated: Record<string, any>) => void;
}

export default function AdminModulesPanel({ companySetup, onSetupChanged }: Props) {
  const tm = useTranslations("admin.modules");
  const ta = useTranslations("admin.modules.addons");
  const tc = useTranslations("common");
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addonEnabledCount = ADDON_MODULES.filter((m) => !!companySetup?.[m.setupFlag]).length;

  async function handleToggle(mod: ModuleEntry) {
    const current = !!companySetup?.[mod.setupFlag];
    const companyId = getCurrentCompanyId() ?? "1";
    setToggling(mod.key);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/company-setup/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [mod.setupFlag]: !current }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onSetupChanged(updated);
    } catch (e: any) {
      setError(e?.message ?? tm("updateFailed"));
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">{tm("title")}</h2>
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {addonEnabledCount} / {ADDON_MODULES.length}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[10px] text-red-400">
          {error}
        </p>
      )}

      <div>
        <div className="space-y-2">
          {ADDON_MODULES.map((mod) => {
            const isEnabled = !!companySetup?.[mod.setupFlag];
            const isLoading = toggling === mod.key;
            return (
              <div
                key={mod.key}
                className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-white/80">{ta(mod.nameKey)}</span>
                    {isEnabled ? (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {tm("enabled")}
                      </span>
                    ) : (
                      <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                        {tm("notEnabled")}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] leading-relaxed text-white/35">{ta(mod.descKey)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                  <button
                    type="button"
                    disabled={isLoading || companySetup === null}
                    onClick={() => handleToggle(mod)}
                    className={
                      isEnabled
                        ? "inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/35 transition-colors hover:border-red-500/25 hover:bg-red-500/[0.08] hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                        : "inline-flex items-center gap-1 rounded border border-indigo-500/25 bg-indigo-600/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
                    }
                  >
                    {isLoading ? "…" : isEnabled ? tm("disable") : tm("enable")}
                  </button>
                  <button
                    type="button"
                    disabled={!isEnabled}
                    className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/35 transition-colors hover:border-white/20 hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Settings className="h-2.5 w-2.5" />
                    {tm("configure")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
