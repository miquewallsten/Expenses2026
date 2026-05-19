"use client";

/**
 * Expense header card - displays title, amount, vendor, date, SAT/Policy badges.
 * Clean financial document header with inline edit for title.
 */

import { Trash2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import ExpenseAuditDrawer from "@/components/expense/ExpenseAuditDrawer";
import type { EmployeeActions } from "./types";

interface ExpenseHeaderProps {
  expense: {
    id: number;
    description: string;
    amount: number;
    category_code: string | null;
    detected_category: string | null;
    expense_date: string | null;
    status: string;
  };
  parsedXml: {
    moneda?: string | null;
    emisor_nombre?: string | null;
    emisor_rfc?: string | null;
    fecha?: string | null;
  } | null;
  satStatus: "valid" | "warning" | "error" | null;
  policyDotStatus: "passed" | "warning" | "failed" | null;
  hasXml: boolean;
  editingTitle: boolean;
  titleDraft: string;
  savingTitle: boolean;
  setTitleDraft: (v: string) => void;
  setEditingTitle: (v: boolean) => void;
  saveTitle: () => void;
  deleteDraft: () => void;
  deletingDraft: boolean;
  employeeActions: EmployeeActions | null;
  onBack?: () => void;
}

function sanitizeTitle(s: string): string {
  return s.replace(/^\[.*?\]\s*/, "");
}

// ── Status badge component ─────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: "valid" | "warning" | "error" | null; label: string }) {
  if (status === "valid") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-2 py-0.5 text-[9px] font-medium text-emerald-400">
        <span className="h-1 w-1 rounded-full bg-emerald-400" />
        {label}
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2 py-0.5 text-[9px] font-medium text-amber-400">
        <span className="h-1 w-1 rounded-full bg-amber-400" />
        {label}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/[0.07] px-2 py-0.5 text-[9px] font-medium text-red-400">
        <span className="h-1 w-1 rounded-full bg-red-400" />
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[9px] font-medium text-muted">
      <span className="h-1 w-1 rounded-full bg-surface-2" />
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseHeader({
  expense,
  parsedXml,
  satStatus,
  policyDotStatus,
  hasXml,
  editingTitle,
  titleDraft,
  savingTitle,
  setTitleDraft,
  setEditingTitle,
  saveTitle,
  deleteDraft,
  deletingDraft,
  employeeActions,
  onBack,
}: ExpenseHeaderProps) {
  const td = useTranslations("employee.expenseDetail");

  const xmlFormattedDate = parsedXml?.fecha
    ? new Date(parsedXml.fecha).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : null;
  const formattedExpenseDate = expense.expense_date
    ? new Date(expense.expense_date).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
      {/* Title row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveTitle();
                  if (e.key === "Escape") setEditingTitle(false);
                }}
                onBlur={saveTitle}
                className="flex-1 rounded border border-accent/30 bg-transparent px-1 py-0 text-[17px] font-bold text-primary outline-none"
              />
              {savingTitle && <span className="text-[9px] text-muted">{td("saving")}</span>}
            </div>
          ) : (
            <div className="group/title flex items-center gap-1.5">
              <h1 className="text-[17px] font-bold leading-tight text-primary">
                {sanitizeTitle(expense.description)}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(sanitizeTitle(expense.description));
                  setEditingTitle(true);
                }}
                className="opacity-0 group-hover/title:opacity-60 transition-opacity"
              >
                <Pencil className="h-3 w-3 text-muted" />
              </button>
            </div>
          )}
          <p className="mt-0.5 text-[22px] font-bold tabular-nums leading-none text-primary">
            ${Number(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="ml-1.5 text-[10px] font-normal text-muted">
              {parsedXml?.moneda ?? "MXN"}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
          <ExpenseAuditDrawer expenseId={expense.id} variant="icon" />
          {employeeActions?.can_delete && (
            <button
              type="button"
              onClick={deleteDraft}
              disabled={deletingDraft}
              className="rounded p-0.5 text-muted hover:text-error/60 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Metadata + status badges */}
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-subtle pt-2">
        {parsedXml?.emisor_nombre && (
          <span className="text-[10px] text-secondary">
            <span className="text-muted">{td("vendor")} </span>
            {parsedXml.emisor_nombre}
          </span>
        )}
        {(xmlFormattedDate ?? formattedExpenseDate) && (
          <span className="text-[10px] text-secondary">
            <span className="text-muted">{td("date")} </span>
            {xmlFormattedDate ?? formattedExpenseDate}
          </span>
        )}
        {parsedXml?.emisor_rfc && (
          <span className="font-mono text-[10px] text-tertiary">
            <span className="font-sans text-muted">{td("rfc")} </span>
            {parsedXml.emisor_rfc}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <StatusBadge
            status={hasXml ? satStatus : null}
            label={hasXml ? "SAT" : td("noXml")}
          />
          <StatusBadge
            status={policyDotStatus === "failed" ? "error" : policyDotStatus === "passed" ? "valid" : policyDotStatus}
            label="Policy"
          />
        </div>
      </div>
    </div>
  );
}
