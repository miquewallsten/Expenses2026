"use client";

import { useState } from "react";
import { CheckCircle2, Settings, Puzzle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface CatalogEntry {
  key: string;
  setupFlag: string;
  name: string;
  description: string;
}

const CATALOG: CatalogEntry[] = [
  {
    key: "expenses",
    setupFlag: "expenses_module_enabled",
    name: "Expenses",
    description: "Employee expense submission, CFDI/XML validation, fiscal document attachment, and split allocation across projects and cost centers.",
  },
  {
    key: "approvals",
    setupFlag: "approvals_module_enabled",
    name: "Approvals",
    description: "Multi-step approval routing with configurable stages, required permissions, and manager delegation rules.",
  },
  {
    key: "accounting",
    setupFlag: "accounting_module_enabled",
    name: "Accounting",
    description: "Póliza generation, general ledger mapping, account code assignment, and period-close tools for accounting teams.",
  },
  {
    key: "time_allocation",
    setupFlag: "time_allocation_module_enabled",
    name: "Time Allocation",
    description: "Track employee time against projects and cost centers for internal billing and financial reporting.",
  },
  {
    key: "reimbursements",
    setupFlag: "reimbursements_module_enabled",
    name: "Reimbursements",
    description: "Employee reimbursement processing, including out-of-pocket expense claims and per diem calculations.",
  },
  {
    key: "archive",
    setupFlag: "archive_module_enabled",
    name: "Archive",
    description: "Document archiving and long-term retention with configurable folder structure and file naming patterns.",
  },
  {
    key: "subcontractor",
    setupFlag: "subcontractor_module_enabled",
    name: "Subcontractors",
    description: "Subcontractor expense and invoice management, including CFDI validation and payment tracking.",
  },
  {
    key: "ai_copilot",
    setupFlag: "ai_copilot_enabled",
    name: "AI Copilot",
    description: "AI-assisted classification, allocation suggestions, policy setup guidance, and expense review automation.",
  },
  {
    key: "purchase_requests",
    setupFlag: "purchase_requests_module_enabled",
    name: "Purchase Requests",
    description: "AI-guided purchase requisition intake for travel, equipment, software, and services. Employees submit structured PR forms reviewed by managers and accounting. Generates company-scoped PR numbers (PR-YYYY-NNNNN) only on formal submission.",
  },
];

interface Props {
  companySetup: Record<string, any> | null;
  onSetupChanged: (updated: Record<string, any>) => void;
}

export default function AdminModulesPanel({ companySetup, onSetupChanged }: Props) {
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabledCount = CATALOG.filter((m) => !!companySetup?.[m.setupFlag]).length;

  async function handleToggle(mod: CatalogEntry) {
    const current = !!companySetup?.[mod.setupFlag];
    setToggling(mod.key);
    setError(null);
    try {
      const res = await fetch(`${API}/admin/company-setup/1`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [mod.setupFlag]: !current }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onSetupChanged(updated);
    } catch (e: any) {
      setError(e?.message ?? "Failed to update module");
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-white/25" />
        <h2 className="text-sm font-semibold text-white">Add-On Modules</h2>
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {enabledCount} / {CATALOG.length}
        </span>
      </div>

      {error && (
        <p className="mb-3 rounded border border-red-500/20 bg-red-500/[0.08] px-3 py-2 text-[10px] text-red-400">
          {error}
        </p>
      )}

      {/* Module cards */}
      <div className="space-y-2">
        {CATALOG.map((mod) => {
          const isEnabled = !!companySetup?.[mod.setupFlag];
          const isLoading = toggling === mod.key;
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
                  {isLoading ? "…" : isEnabled ? "Disable" : "Enable"}
                </button>
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
