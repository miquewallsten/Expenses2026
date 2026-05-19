"use client";

/**
 * Overview tab content for EmployeeExpenseDetail.
 * Contains allocation, expense type, tags, notes, and OCR prefill banner.
 * Clean, dense, enterprise-grade layout.
 */

import { X, Plus, Sparkles, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  Expense,
  OrgUnit,
  PredefinedTag,
  AccountingCategoryRow,
  AllocationRow,
  EmployeeActions,
} from "./types";

// ── Tag helpers ──────────────────────────────────────────────────────────────

const TAG_COLOR_CLS: Record<string, string> = {
  red: "bg-red-500/20 text-red-300",
  orange: "bg-orange-500/20 text-orange-300",
  amber: "bg-amber-500/20 text-amber-300",
  yellow: "bg-yellow-500/20 text-yellow-300",
  lime: "bg-lime-500/20 text-lime-300",
  green: "bg-green-500/20 text-green-300",
  emerald: "bg-emerald-500/20 text-emerald-300",
  teal: "bg-teal-500/20 text-teal-300",
  cyan: "bg-cyan-500/20 text-cyan-300",
  blue: "bg-blue-500/20 text-blue-300",
  indigo: "bg-indigo-500/20 text-indigo-300",
  violet: "bg-violet-500/20 text-violet-300",
  purple: "bg-purple-500/20 text-purple-300",
  fuchsia: "bg-fuchsia-500/20 text-fuchsia-300",
  pink: "bg-pink-500/20 text-pink-300",
  rose: "bg-rose-500/20 text-rose-300",
};

const TAG_DOT_CLS: Record<string, string> = {
  red: "bg-red-400", orange: "bg-orange-400", amber: "bg-amber-400",
  yellow: "bg-yellow-400", lime: "bg-lime-400", green: "bg-green-400",
  emerald: "bg-emerald-400", teal: "bg-teal-400", cyan: "bg-cyan-400",
  blue: "bg-blue-400", indigo: "bg-indigo-400", violet: "bg-violet-400",
  purple: "bg-purple-400", fuchsia: "bg-fuchsia-400", pink: "bg-pink-400",
  rose: "bg-rose-400",
};

function tagCls(color: string | null | undefined): string {
  return TAG_COLOR_CLS[color ?? ""] ?? "bg-surface-2 text-tertiary";
}

function tagDotCls(color: string | null | undefined): string {
  return TAG_DOT_CLS[color ?? ""] ?? "bg-surface-2";
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  options: OrgUnit[];
  placeholder: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className="w-full rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:border-strong"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}

interface ActiveDim {
  key: keyof AllocationRow;
  label: string;
  units: OrgUnit[];
  ph: string;
}

interface ExpenseOverviewTabProps {
  expense: Expense;
  linkedDocs: any[];
  parsedXml: any;
  projects: OrgUnit[];
  clients: OrgUnit[];
  costCenters: OrgUnit[];
  predefinedTags: PredefinedTag[];
  categories: AccountingCategoryRow[];
  allocationRows: AllocationRow[];
  setAllocationRows: (rows: AllocationRow[]) => void;
  updateRow: (index: number, key: keyof AllocationRow, value: any) => void;
  splitTotal: number;
  allowSplit: boolean;
  activeDims: ActiveDim[];
  notes: string;
  setNotes: (v: string) => void;
  saveNotes: () => void;
  savingNotes: boolean;
  activeTags: string[];
  tagInput: string;
  setTagInput: (v: string) => void;
  showTagDropdown: boolean;
  setShowTagDropdown: (v: boolean) => void;
  addTag: (name: string) => void;
  removeTag: (name: string) => void;
  saveCategory: (code: string) => void;
  savingCategory: boolean;
  savingAllocation: boolean;
  allocSaveError: string | null;
  employeeActions: EmployeeActions | null;
  xmlRequired: boolean;
  hasXml: boolean;
  pdfPairRequired: boolean;
  hasPdf: boolean;
}

// ── Section overline ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ExpenseOverviewTab({
  expense,
  linkedDocs,
  parsedXml,
  projects,
  clients,
  costCenters,
  predefinedTags,
  categories,
  allocationRows,
  setAllocationRows,
  updateRow,
  splitTotal,
  allowSplit,
  activeDims,
  notes,
  setNotes,
  saveNotes,
  savingNotes,
  activeTags,
  tagInput,
  setTagInput,
  showTagDropdown,
  setShowTagDropdown,
  addTag,
  removeTag,
  saveCategory,
  savingCategory,
  savingAllocation,
  allocSaveError,
  employeeActions,
  xmlRequired,
  hasXml,
  pdfPairRequired,
  hasPdf,
}: ExpenseOverviewTabProps) {
  const t = useTranslations("employee");
  const td = useTranslations("employee.expenseDetail");

  return (
    <div className="space-y-3 pb-20">
      {/* OCR prefill banner */}
      {expense.status === "draft" &&
        linkedDocs.some((d) => {
          const ef = d.extracted_fields;
          return ef && (ef.total || ef.date || ef.merchant);
        }) && (
          <div className="flex items-start gap-2 rounded-lg border border-accent/20 bg-accent/[0.06] px-3 py-2">
            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent/70" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium text-accent/80">{td("ocr.prefilledBadge")}</p>
              <p className="text-[10px] text-muted">{td("ocr.prefilledHint")}</p>
            </div>
          </div>
        )}

      {/* ── Allocation ────────────────────────────────────────────────────── */}
      {activeDims.length > 0 && (
        <div>
          <SectionLabel>{td("projectAllocation")}</SectionLabel>
          <div className="overflow-hidden rounded-lg border border-default">
            {/* Header row */}
            <div className="grid gap-2 border-b border-subtle bg-surface-2/50 px-3 py-1.5" style={{ gridTemplateColumns: `repeat(${activeDims.length}, 1fr) 80px 28px` }}>
              {activeDims.map((dim) => (
                <span key={dim.key} className="text-[9px] font-medium text-muted">{dim.label}</span>
              ))}
              <span className="text-[9px] font-medium text-muted">%</span>
              <span />
            </div>
            {/* Rows */}
            {allocationRows.map((row, i) => (
              <div key={i} className={`grid gap-2 px-3 py-1.5 ${i > 0 ? "border-t border-subtle" : ""}`} style={{ gridTemplateColumns: `repeat(${activeDims.length}, 1fr) 80px 28px` }}>
                {activeDims.map((dim) => (
                  <SelectField
                    key={dim.key}
                    value={row[dim.key] as number | null}
                    onChange={(v) => updateRow(i, dim.key, v)}
                    options={dim.units}
                    placeholder={dim.ph}
                  />
                ))}
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={row.percent}
                  onChange={(e) => updateRow(i, "percent", e.target.value)}
                  className="w-full rounded border border-default bg-transparent px-2 py-1 text-[10px] text-secondary tabular-nums outline-none focus:border-strong"
                />
                {allocationRows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setAllocationRows(allocationRows.filter((_, j) => j !== i))}
                    className="text-muted hover:text-error/60"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {/* Split total bar */}
            <div className="flex items-center justify-between border-t border-subtle px-3 py-1.5">
              <span className="text-[9px] text-muted">Total</span>
              <span className={`text-[10px] font-semibold tabular-nums ${splitTotal === 100 ? "text-success/70" : "text-warning/70"}`}>
                {splitTotal}%
              </span>
            </div>
          </div>
          {allowSplit && (
            <button
              type="button"
              onClick={() => setAllocationRows([...allocationRows, { project_id: null, client_id: null, cost_center_id: null, percent: "0" }])}
              className="mt-1 flex items-center gap-1 text-[10px] text-accent/70 hover:text-accent"
            >
              <Plus className="h-2.5 w-2.5" />
              {td("addSplit")}
            </button>
          )}
          {allocSaveError && (
            <p className="mt-1 text-[10px] text-error/70">{allocSaveError}</p>
          )}
          {savingAllocation && (
            <p className="mt-1 text-[10px] text-muted">{td("saving")}</p>
          )}
        </div>
      )}

      {/* ── Expense type / category ──────────────────────────────────────── */}
      {(expense.detected_category || categories.length > 0) && (
        <div>
          <SectionLabel>{td("expenseType")}</SectionLabel>
          <div className="flex items-center gap-2">
            {expense.detected_category && (
              <span className="inline-flex items-center gap-1 rounded-full border border-surface-2 bg-surface-2 px-2 py-0.5 text-[10px] text-secondary">
                {expense.detected_category}
              </span>
            )}
            {expense.category_code && expense.detected_category !== expense.category_code && (
              <span className="text-[9px] text-muted">
                {td("pendingCatalogue")}
              </span>
            )}
          </div>
          {categories.length > 0 && (
            <div className="mt-1.5">
              <select
                value={expense.category_code ?? ""}
                onChange={(e) => {
                  if (e.target.value) saveCategory(e.target.value);
                }}
                disabled={savingCategory}
                className="w-full rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-secondary outline-none focus:border-strong disabled:opacity-40"
              >
                <option value="">{td("selectCategory")}</option>
                {categories.filter((c) => c.is_active).map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
              {savingCategory && <span className="ml-2 text-[9px] text-muted">{td("saving")}</span>}
            </div>
          )}
        </div>
      )}

      {/* ── Tags + Notes ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>{td("tags")} / {td("notes")}</SectionLabel>
        <div className="rounded-lg border border-default bg-surface-1">
          {/* Tags */}
          <div className="px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1">
              {activeTags.map((name) => {
                const pt = predefinedTags.find((p) => p.name === name);
                return (
                  <span
                    key={name}
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${tagCls(pt?.color)}`}
                  >
                    <span className={`inline-flex h-1 w-1 rounded-full ${tagDotCls(pt?.color)}`} />
                    {name}
                    <button
                      type="button"
                      onClick={() => removeTag(name)}
                      className="ml-0.5 text-current opacity-50 hover:opacity-100"
                    >
                      <X className="h-2 w-2" />
                    </button>
                  </span>
                );
              })}
              {employeeActions?.can_edit !== false && (
                <div className="relative">
                  <input
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowTagDropdown(true);
                    }}
                    onFocus={() => setShowTagDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTagDropdown(false), 200)}
                    placeholder={td("addTagPlaceholder")}
                    className="rounded border border-default bg-transparent px-1.5 py-0.5 text-[9px] text-tertiary placeholder:text-muted/30 outline-none focus:bg-accent-muted focus:text-secondary"
                  />
                  {showTagDropdown && (
                    <div className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-default bg-surface-1 shadow-xl">
                      {predefinedTags
                        .filter(
                          (p) =>
                            !activeTags.includes(p.name) &&
                            (tagInput === "" || p.name.toLowerCase().includes(tagInput.toLowerCase()))
                        )
                        .map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onMouseDown={() => addTag(p.name)}
                            className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-tertiary hover:bg-surface-3"
                          >
                            <span className={`inline-flex h-1.5 w-1.5 rounded-full ${tagDotCls(p.color)}`} />
                            {p.name}
                          </button>
                        ))}
                      {tagInput.trim() &&
                        !predefinedTags.find((p) => p.name === tagInput.trim()) && (
                          <button
                            type="button"
                            onMouseDown={() => addTag(tagInput)}
                            className="flex w-full items-center gap-2 border-t border-subtle px-2.5 py-1.5 text-left text-[10px] text-accent/60 hover:bg-surface-2"
                          >
                            <Plus className="h-2.5 w-2.5" /> Create &quot;{tagInput.trim()}&quot;
                          </button>
                        )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          {/* Notes */}
          <div className="border-t border-subtle px-3 py-2.5">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              readOnly={employeeActions?.can_edit === false}
              rows={2}
              placeholder={td("notesPlaceholder")}
              className={`w-full resize-none rounded border border-default bg-transparent px-2 py-1.5 text-[11px] placeholder:text-muted/20 outline-none transition-colors ${
                employeeActions?.can_edit === false
                  ? "cursor-not-allowed text-muted"
                  : "text-tertiary focus:bg-accent-muted"
              }`}
            />
            {savingNotes && <p className="mt-0.5 text-[9px] text-muted">{td("saving")}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
