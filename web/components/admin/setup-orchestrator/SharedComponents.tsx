"use client";

/**
 * Shared components and helpers for the AdminSetupOrchestratorPanel.
 * Extracted from AdminSetupOrchestratorPanel.tsx.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

export const EXEC_ACTION_LABEL: Record<string, string> = {
  create_user: "Crear usuario",
  bulk_invite_users: "Invitar usuarios (lote)",
  create_accounting_category: "Crear categoría contable",
  bulk_create_accounting_categories: "Crear categorías contables (lote)",
  update_user_role: "Actualizar rol de usuario",
};

export const PATCH_SECTIONS: { key: string; i18nKey: string }[] = [
  { key: "company_setup", i18nKey: "patches.companySetup" },
  { key: "expense_policy", i18nKey: "patches.expensePolicy" },
  { key: "accounting_setup", i18nKey: "patches.accountingSetup" },
  { key: "approval_setup", i18nKey: "patches.approvalSetup" },
  { key: "workflow_setup", i18nKey: "patches.workflowSetup" },
];

export const COMPLEXITY_COLOR: Record<string, string> = {
  simple: "text-emerald-400",
  medium: "text-amber-400",
  complex: "text-red-400",
};

// ── Helper functions ──────────────────────────────────────────────────────────

export function patchValueLabel(v: any, tFn: (k: string) => string): string {
  if (v === true) return "✓ Sí";
  if (v === false) return "✗ No";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(", ");
  return JSON.stringify(v);
}

// ── UI Components ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

export function CollapsibleSection({
  label,
  count,
  children,
  defaultOpen = false,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-0.5"
      >
        <SectionLabel>{label}</SectionLabel>
        <span className="flex items-center gap-1">
          <span className="rounded border border-default bg-surface-1 px-1 py-0 text-[9px] text-muted">
            {count}
          </span>
          {open ? (
            <ChevronDown className="h-2.5 w-2.5 text-muted" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5 text-muted" />
          )}
        </span>
      </button>
      {open && <div className="space-y-1.5">{children}</div>}
    </div>
  );
}
