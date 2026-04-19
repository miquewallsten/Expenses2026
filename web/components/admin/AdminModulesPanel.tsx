"use client";

import { CheckCircle2, Settings, Puzzle } from "lucide-react";

interface CompanyModule {
  id: number;
  company_id: number;
  module_key: string;
  enabled: boolean;
  config_json: string | null;
  created_at: string;
}

interface Props {
  companyModules: CompanyModule[];
}

const CATALOG = [
  {
    key: "expenses",
    name: "Expenses",
    description: "Employee expense submission, CFDI/XML validation, fiscal document attachment, and split allocation across projects and cost centers.",
  },
  {
    key: "approvals",
    name: "Approvals",
    description: "Multi-step approval routing with configurable stages, required permissions, and manager delegation rules.",
  },
  {
    key: "accounting",
    name: "Accounting",
    description: "Poliza generation, general ledger mapping, account code assignment, and period-close tools for accounting teams.",
  },
  {
    key: "time",
    name: "Time Allocation",
    description: "Track employee time against projects and cost centers for internal billing and financial reporting.",
  },
  {
    key: "requests",
    name: "Requests",
    description: "Structured purchase and service request workflows with approval routing and budget checks.",
  },
  {
    key: "ai-setup",
    name: "AI Setup Studio",
    description: "Configure AI-assisted classification, allocation suggestions, and expense review behavior per company policy.",
  },
];

export default function AdminModulesPanel({ companyModules }: Props) {
  const enabledKeys = new Set(
    companyModules.filter((m) => m.enabled).map((m) => m.module_key)
  );

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">Add-On Modules</h2>
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {enabledKeys.size} / {CATALOG.length}
        </span>
      </div>

      {/* Module cards */}
      <div className="space-y-2">
        {CATALOG.map((mod) => {
          const isEnabled = enabledKeys.has(mod.key);
          return (
            <div
              key={mod.key}
              className="flex items-start justify-between gap-4 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.03]"
            >
              {/* Info */}
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-white/80">{mod.name}</span>
                  {isEnabled ? (
                    <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Enabled
                    </span>
                  ) : (
                    <span className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white/25">
                      Not Enabled
                    </span>
                  )}
                </div>
                <p className="text-[10px] leading-relaxed text-white/35">{mod.description}</p>
              </div>

              {/* Actions */}
              <div className="flex shrink-0 flex-col items-end gap-1.5 pt-0.5">
                {!isEnabled && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded border border-indigo-500/25 bg-indigo-600/10 px-2.5 py-1 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/20 hover:text-indigo-300"
                  >
                    Enable
                  </button>
                )}
                <button
                  type="button"
                  disabled={!isEnabled}
                  className="inline-flex items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/35 transition-colors hover:border-white/20 hover:text-white/60 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Settings className="h-2.5 w-2.5" />
                  Configure
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
