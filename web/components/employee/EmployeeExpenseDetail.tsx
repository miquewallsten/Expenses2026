"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileText, Upload, CheckCircle2, XCircle,
  Send, Trash2, ChevronLeft, AlertTriangle, X, Tag, Plus, Sparkles,
} from "lucide-react";
import {
  type ExtractedData,
  type ExpenseDocument,
  SUBMISSION_TYPES,
} from "@/lib/expenses/xmlExtract";
import { useTranslations } from "next-intl";
import XmlDetailModal from "@/components/employee/XmlDetailModal";
import AnomalyBanner from "@/components/expense/AnomalyBanner";
import ExpenseHeader from "@/components/expense/ExpenseHeader";
import ExpenseOverviewTab from "@/components/expense/ExpenseOverviewTab";
import ExpenseDocumentsTab from "@/components/expense/ExpenseDocumentsTab";
import ExpenseValidationsTab from "@/components/expense/ExpenseValidationsTab";
import type {
  EmployeeActions as EmployeeActionsType,
  AllocationRow as AllocationRowType,
  OrgUnit as OrgUnitType,
  PredefinedTag as PredefinedTagType,
  AccountingCategoryRow as AccountingCategoryRowType,
  ValidationResultRow as ValidationResultRowType,
  PolicyCheckRow as PolicyCheckRowType,
} from "@/components/expense/types";
import { getAuthHeaders } from "@/lib/session";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export type { ExtractedData, ExpenseDocument };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  category_code: string | null;
  report_id: number | null;
  expense_date: string | null;
  created_at: string;
  notes?: string | null;
  tags?: string | null;        // JSON array string
  expense_type?: string | null;
}

interface OrgUnit { id: number; name: string; code: string; }
interface PredefinedTag { id: number; name: string; color: string | null; }
interface AccountingCategoryRow {
  id: number;
  code: string;
  name: string;
  tax_behavior: string;
  requires_project: boolean;
  is_active: boolean;
}

interface AllocationRead {
  id: number;
  expense_id: number;
  project_id: number | null;
  client_id: number | null;
  cost_center_id: number | null;
  percent: number;
}

interface AllocationRow {
  project_id: number | null;
  client_id: number | null;
  cost_center_id: number | null;
  percent: string;
}

interface UploadEntry {
  localId: string;
  filename: string;
  status: "uploading" | "done" | "error";
}

interface EmployeeActions {
  can_edit: boolean;
  can_delete: boolean;
  can_submit: boolean;
  can_resubmit: boolean;
  can_add_documents: boolean;
  reasons: string[];
}

interface BlockersResult {
  expense_id: number;
  submit_blockers: string[];
  accounting_blockers: string[];
  poliza_blockers: string[];
  warnings: string[];
}

interface AllocationSummaryResult {
  expense_id: number;
  items: Array<{ id: number; project_id: number | null; client_id: number | null; cost_center_id: number | null; percent: number }>;
  presence: { has_any: boolean; has_project: boolean; has_client: boolean; has_cost_center: boolean; allocation_count: number };
}

interface ValidationResultRow {
  id: number;
  document_id: number;
  source: string;
  rule_code: string;
  status: string;
  message: string;
  created_at: string;
}

interface PolicyCheckRow {
  group: "document" | "sat" | "policy" | "ai";
  code: string;
  label: string;
  status: "passed" | "failed" | "warning" | "pending" | "not_applicable";
  message: string;
  source: "validator" | "expense_policy" | "ai_policy";
  overridden?: boolean;
  justification_note?: string | null;
  original_message?: string;
}

interface ExpensePolicy {
  id: number; company_id: number;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
  international_expenses_allowed: boolean;
  tickets_allowed: boolean;
  require_justification: boolean;
  require_proof: boolean;
  allow_split_allocations: boolean;
  allocation_dimensions: string;
  manager_approval_required: boolean;
  accounting_review_required: boolean;
  ai_policy_assist_enabled: boolean;
  allow_document_free_expenses: boolean;
}

interface DerivedConfig {
  enabled_modules: string[];
  allocation_dimensions: string[];
  allow_split_allocations: boolean;
  tickets_allowed: boolean;
  international_expenses_allowed: boolean;
  xml_required_mode: string;
  pdf_pair_required_for_cfdi: boolean;
  allow_document_free_expenses: boolean;
  manager_flow_enabled: boolean;
  accounting_flow_enabled: boolean;
  workflow_mode: string;
}

interface Props {
  expenseId: number | null;
  expensePolicy?: ExpensePolicy | null;
  approvalSetup?: unknown;
  workflowSetup?: unknown;
  derived?: DerivedConfig | null;
  linkedDocs:  ExpenseDocument[];
  loadingDocs: boolean;
  parsedXml:   ExtractedData | null;
  satStatus:   "valid" | "warning" | "error" | null;
  onDocRefreshNeeded: () => void;
  onDeleted?: () => void;
  onExpenseUpdated?: (expense: Expense) => void;
  onBack?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const _GARBAGE: [string, string][] = [
  ["<?xml", "Uploaded XML"], ["<cfdi", "Uploaded XML"],
  ["<Comprobante", "Uploaded XML"], ["%PDF", "Uploaded PDF"],
];
function sanitizeTitle(s: string): string {
  const t = s.trimStart();
  for (const [pfx, fb] of _GARBAGE) if (t.startsWith(pfx)) return fb;
  return s || "Untitled Expense";
}

function docTypeLabel(t: string | null | undefined, labels: Record<string, string>): string {
  switch (t) {
    case "cfdi_xml": return "XML"; case "cfdi_pdf": case "pdf": case "pdf_unclassified": return "PDF";
    case "ticket": case "receipt": return labels.receipt ?? "Receipt";
    case "justification": return labels.justification ?? "Justification";
    case "proof": return labels.proof ?? "Proof";
    default: return labels.file ?? "File";
  }
}
function docTypeCls(t: string | null | undefined): string {
  switch (t) {
    case "cfdi_xml": return "text-accent/70";
    case "cfdi_pdf": case "pdf": case "pdf_unclassified": return "text-accent/60";
    case "ticket": case "receipt": return "text-warning/55";
    default: return "text-muted";
  }
}

const TAG_COLOR_CLS: Record<string, string> = {
  sky: "border-sky-500/20 bg-accent/[0.07] text-accent/70",
  indigo: "border-blue-500/20 bg-blue-500/[0.07] text-accent",
  violet: "border-violet-500/20 bg-violet-500/[0.07] text-violet-400/70",
  emerald: "border-emerald-500/20 bg-emerald-500/[0.07] text-success/70",
  amber: "border-amber-500/20 bg-amber-500/[0.07] text-warning/60",
  rose: "border-rose-500/20 bg-rose-500/[0.07] text-error/65",
  zinc: "border-subtle bg-surface-2 text-tertiary",
};

const TAG_DOT_CLS: Record<string, string> = {
  sky: "bg-sky-400/70",
  indigo: "bg-accent/70",
  violet: "bg-violet-400/70",
  emerald: "bg-emerald-400/70",
  amber: "bg-amber-400/70",
  rose: "bg-rose-400/70",
  zinc: "bg-surface-3",
};

function tagCls(color: string | null | undefined): string {
  return TAG_COLOR_CLS[color ?? "zinc"] ?? TAG_COLOR_CLS.zinc;
}

function tagDotCls(color: string | null | undefined): string {
  return TAG_DOT_CLS[color ?? "zinc"] ?? TAG_DOT_CLS.zinc;
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

function ruleLabel(code: string, labels: Record<string, string>): string {
  return labels[code] ?? code;
}

function SelectField({ value, onChange, options, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; options: OrgUnit[]; placeholder: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className="w-full rounded border border-default bg-surface-1 px-1.5 py-1 text-[10px] text-tertiary outline-none focus:bg-accent-muted"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.code})</option>)}
    </select>
  );
}

// ── Inline document preview (PDF / image thumbnail) ───────────────────────────
//
// Fetches the archived bytes with auth headers and renders a small inline
// thumbnail. Clicking opens an in-app modal with a full-size preview.
// PDFs render as a labelled card thumbnail (the browser PDF viewer can't
// render usefully at 48×64); images render their actual pixels.

function DocPreview({ docId, filename, docType, onOpenXmlModal }: { docId: number; filename: string; docType: string | null; onOpenXmlModal?: () => void }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error,   setError]   = useState(false);
  const [open,    setOpen]    = useState(false);

  const lower = (filename || "").toLowerCase();
  const isPdf   = lower.endsWith(".pdf") || docType === "cfdi_pdf" || docType === "pdf_unclassified" || docType === "ticket";
  const isImage = /\.(png|jpe?g|gif|webp)$/i.test(lower);
  const isXml   = lower.endsWith(".xml") || docType === "cfdi_xml";

  useEffect(() => {
    if (!isPdf && !isImage) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const res: any = await apiCall("/expenses/documents/${docId}/file");
        // 204 = bytes intentionally unavailable (e.g. storage reset). Treat as
        // a soft "no preview" so we don't show a loud error tile.
        if (res.status === 204) { if (!cancelled) setError(true); return; }
        if (!res.ok) { if (!cancelled) setError(true); return; }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        createdUrl = url;
        if (!cancelled) setBlobUrl(url);
        else URL.revokeObjectURL(url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [docId, isPdf, isImage]);

  // Close modal on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!isPdf && !isImage && !isXml) return null;

  // ── Thumbnail tile (always 48×64) ────────────────────────────────────────
  const tileBase = "group relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-surface-1";

  let tile: React.ReactNode;
  if (isXml) {
    tile = (
      <div className={`${tileBase} border-default hover:border-sky-400/35 cursor-pointer`} title={filename}>
        <div className="flex h-full w-full flex-col items-stretch justify-between bg-accent/5 p-1">
          <div className="flex flex-col gap-[2px]">
            <div className="h-[2px] w-3/4 rounded-sm bg-sky-400/30" />
            <div className="h-[2px] w-full rounded-sm bg-surface-2" />
            <div className="h-[2px] w-5/6 rounded-sm bg-surface-2" />
            <div className="h-[2px] w-2/3 rounded-sm bg-surface-2" />
          </div>
          <div className="self-end rounded-sm bg-accent/30 px-1 text-[7px] font-bold tracking-wider text-sky-100/85">
            XML
          </div>
        </div>
      </div>
    );
  } else if (error) {
    tile = (
      <div className={`${tileBase} border-default text-[8px] text-muted`} title={filename}>
        N/A
      </div>
    );
  } else if (!blobUrl) {
    tile = (
      <div className={`${tileBase} border-subtle`} title={filename}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-surface-2" />
      </div>
    );
  } else if (isImage) {
    tile = (
      <div className={`${tileBase} border-default hover:bg-accent-muted/35 cursor-zoom-in`} title={filename}>
        <img src={blobUrl} alt={filename} className="h-full w-full object-cover" />
      </div>
    );
  } else {
    // PDF - render a faux first-page card. The browser PDF viewer won't
    // render usefully at this size; instead show a clear "PDF" affordance.
    tile = (
      <div className={`${tileBase} border-default hover:bg-accent-muted/35 cursor-zoom-in`} title={filename}>
        <div className="flex h-full w-full flex-col items-stretch justify-between bg-surface-2 p-1">
          <div className="flex flex-col gap-[2px]">
            <div className="h-[2px] w-3/4 rounded-sm bg-surface-2" />
            <div className="h-[2px] w-full rounded-sm bg-surface-2" />
            <div className="h-[2px] w-5/6 rounded-sm bg-surface-2" />
            <div className="h-[2px] w-2/3 rounded-sm bg-surface-2" />
          </div>
          <div className="self-end rounded-sm bg-rose-500/30 px-1 text-[7px] font-bold tracking-wider text-rose-100/85">
            PDF
          </div>
        </div>
      </div>
    );
  }

  const canOpen = (!!blobUrl && !error) || (isXml && !!onOpenXmlModal);
  const handleClick = () => {
    if (isXml && onOpenXmlModal) { onOpenXmlModal(); return; }
    setOpen(true);
  };
  const trigger = canOpen ? (
    <button type="button" onClick={handleClick} className="contents" aria-label={`Preview ${filename}`}>
      {tile}
    </button>
  ) : tile;

  return (
    <>
      {trigger}
      {open && blobUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overlay-backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex h-[88vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-lg border border-subtle bg-surface-0 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-subtle px-4 py-2">
              <div className="min-w-0 flex-1 truncate text-[11px] text-secondary">{filename}</div>
              <div className="flex items-center gap-2">
                <a
                  href={blobUrl}
                  download={filename}
                  className="rounded border border-subtle px-2 py-0.5 text-[10px] text-tertiary hover:border-strong hover:text-secondary"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-subtle px-2 py-0.5 text-[10px] text-tertiary hover:border-strong hover:text-secondary"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center bg-surface-1">
              {isImage ? (
                <img src={blobUrl} alt={filename} className="max-h-full max-w-full object-contain" />
              ) : (
                <iframe src={blobUrl} title={filename} className="h-full w-full border-0" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function EmployeeExpenseDetail({
  expenseId, expensePolicy, derived,
  linkedDocs, loadingDocs, parsedXml, satStatus,
  onDocRefreshNeeded, onDeleted, onExpenseUpdated, onBack,
}: Props) {

  const t = useTranslations("employee");
  const td = useTranslations("employee.expenseDetail");
  const tc = useTranslations("common");
  const [expense, setExpense] = useState<Expense | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "documents" | "validations">("overview");
  const [showXmlModal, setShowXmlModal] = useState(false);

  // Org units
  const [projects, setProjects]         = useState<OrgUnit[]>([]);
  const [clients, setClients]           = useState<OrgUnit[]>([]);
  const [costCenters, setCostCenters]   = useState<OrgUnit[]>([]);
  const [predefinedTags, setPredefinedTags] = useState<PredefinedTag[]>([]);
  const [categories, setCategories]     = useState<AccountingCategoryRow[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);

  // Allocations
  const [allocations, setAllocations]           = useState<AllocationRead[]>([]);
  const [allocationRows, setAllocationRows]     = useState<AllocationRow[]>([
    { project_id: null, client_id: null, cost_center_id: null, percent: "100" },
  ]);
  const [savingAllocation, setSavingAllocation] = useState(false);
  const [allocSaveError, setAllocSaveError]     = useState<string | null>(null);
  const allocDebounceRef                        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [allocationSummary, setAllocationSummary] = useState<AllocationSummaryResult | null>(null);

  // Upload
  const [uploadQueue, setUploadQueue] = useState<UploadEntry[]>([]);
  const [dragOver, setDragOver]       = useState(false);
  const fileInputRef                  = useRef<HTMLInputElement>(null);

  // Inline title editing
  const [editingTitle, setEditingTitle]   = useState(false);
  const [titleDraft, setTitleDraft]       = useState("");
  const [savingTitle, setSavingTitle]     = useState(false);

  // Notes, tags, expense type
  const [notes, setNotes]               = useState("");
  const [savingNotes, setSavingNotes]   = useState(false);
  const [activeTags, setActiveTags]     = useState<string[]>([]);
  const [tagInput, setTagInput]         = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  // Actions / blockers
  const [loadingExpense, setLoadingExpense]       = useState(false);
  const [deletingDraft, setDeletingDraft]         = useState(false);
  const [employeeActions, setEmployeeActions]     = useState<EmployeeActions | null>(null);
  const [submittingExpense, setSubmittingExpense] = useState(false);
  const [submitError, setSubmitError]             = useState<string | null>(null);
  const [expenseBlockers, setExpenseBlockers]     = useState<BlockersResult | null>(null);

  // Validations
  const [validations, setValidations]   = useState<ValidationResultRow[]>([]);
  const [loadingVals, setLoadingVals]   = useState(false);
  const [policyChecks, setPolicyChecks] = useState<PolicyCheckRow[]>([]);
  const [checksRefreshNonce, setChecksRefreshNonce] = useState(0);
  const refreshChecks = useCallback(() => setChecksRefreshNonce((n) => n + 1), []);

  // Document deletion
  const [deletingDocId, setDeletingDocId]           = useState<number | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<number | null>(null);

  // ── Fetch org units + predefined tags ─────────────────────────────────────
  useEffect(() => {
    Promise.all([
      apiCall<OrgUnit[]>("/expenses/projects?company_id=1").catch(() => []),
      apiCall<OrgUnit[]>("/expenses/clients?company_id=1").catch(() => []),
      apiCall<OrgUnit[]>("/expenses/cost-centers?company_id=1").catch(() => []),
      apiCall<PredefinedTag[]>("/expenses/tags?company_id=1").catch(() => []),
      apiCall<AccountingCategoryRow[]>("/admin/accounting-categories/1").catch(() => []),
    ]).then(([p, c, cc, t, cats]) => {
      setProjects(p); setClients(c); setCostCenters(cc); setPredefinedTags(t);
      setCategories(Array.isArray(cats) ? cats : []);
    }).catch(() => {});
  }, []);

  // ── Fetch expense ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setExpense(null); return; }
    setLoadingExpense(true);
    apiCall<Expense>(`/expenses/${expenseId}`)
      .then((data) => {
        setExpense(data);
        setNotes(data?.notes ?? "");
        setActiveTags(parseTags(data?.tags));
      })
      .catch(() => setExpense(null))
      .finally(() => setLoadingExpense(false));
  }, [expenseId]);

  // ── Fetch allocations ──────────────────────────────────────────────────────
  const loadAllocations = useCallback(async (id: number) => {
    const [data, summary] = await Promise.all([
      apiCall<AllocationRead[]>(`/expenses/allocations/${id}`).catch(() => null),
      apiCall<AllocationSummaryResult>(`/expenses/allocations-summary/${id}`).catch(() => null),
    ]);
    if (data) {
      setAllocations(data);
      if (data.length > 0) {
        setAllocationRows(data.map((a) => ({
          project_id: a.project_id, client_id: a.client_id,
          cost_center_id: a.cost_center_id, percent: String(a.percent),
        })));
      } else {
        setAllocationRows([{ project_id: null, client_id: null, cost_center_id: null, percent: "100" }]);
      }
    }
    if (summary) setAllocationSummary(summary);
  }, []);

  useEffect(() => {
    if (!expenseId) { setAllocations([]); setAllocationSummary(null); return; }
    loadAllocations(expenseId);
  }, [expenseId, loadAllocations]);

  // ── Fetch employee actions + blockers ──────────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setEmployeeActions(null); setExpenseBlockers(null); return; }
    Promise.all([
      apiCall<{ actions?: EmployeeActions | null }>(`/expenses/actions/${expenseId}?portal_role=employee`).catch(() => null),
      apiCall<BlockersResult>(`/expenses/blockers/${expenseId}`).catch(() => null),
    ]).then(([ar, br]) => {
      if (ar) setEmployeeActions(ar.actions ?? null);
      if (br) setExpenseBlockers(br);
    }).catch(() => {});
  }, [expenseId, expense?.status, checksRefreshNonce]);

  // ── Fetch validations eagerly on expense load ────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setValidations([]); setPolicyChecks([]); return; }
    setLoadingVals(true);
    Promise.all([
      apiCall<ValidationResultRow[]>(`/expenses/${expenseId}/validations`).catch(() => []),
      apiCall<PolicyCheckRow[]>(`/expenses/${expenseId}/policy-checks`).catch(() => []),
    ])
      .then(([v, pc]) => { setValidations(Array.isArray(v) ? v : []); setPolicyChecks(Array.isArray(pc) ? pc : []); })
      .catch(() => { setValidations([]); setPolicyChecks([]); })
      .finally(() => setLoadingVals(false));
  }, [expenseId, checksRefreshNonce]);

  // ── Save title ─────────────────────────────────────────────────────────────
  const saveTitle = async () => {
    if (!expense || !titleDraft.trim()) { setEditingTitle(false); return; }
    setSavingTitle(true);
    try {
      const u = await apiPatch<Expense>(`/expenses/${expense.id}`, { description: titleDraft.trim() });
      setExpense(u); onExpenseUpdated?.(u);
    } finally { setSavingTitle(false); setEditingTitle(false); }
  };

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveNotes = async () => {
    if (!expense) return;
    setSavingNotes(true);
    try {
      const u = await apiPatch<Expense>(`/expenses/${expense.id}`, { notes });
      setExpense(u); onExpenseUpdated?.(u);
    } finally { setSavingNotes(false); }
  };

  // ── Save category (tipo de gasto) ──────────────────────────────────────────
  const saveCategory = async (code: string) => {
    if (!expense) return;
    setSavingCategory(true);
    try {
      const u = await apiPatch<Expense>(`/expenses/${expense.id}`, { category_code: code || null });
      setExpense(u); onExpenseUpdated?.(u);
    } finally { setSavingCategory(false); }
  };

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDocument = async (docId: number) => {
    setDeletingDocId(docId);
    try {
      await apiDelete(`/expenses/documents/${docId}`);
      setConfirmDeleteDocId(null);
      onDocRefreshNeeded();
      // refresh validations (some may reference deleted doc)
      const vr = await apiCall<ValidationResultRow[]>(`/expenses/${expenseId}/validations`).catch(() => []);
      setValidations(vr);
    } finally { setDeletingDocId(null); }
  };

  // ── Save tags ──────────────────────────────────────────────────────────────
  const saveTags = async (newTags: string[]) => {
    if (!expense) return;
    setActiveTags(newTags);
    await apiPatch(`/expenses/${expense.id}`, { tags: JSON.stringify(newTags) });
  };

  const addTag = (name: string) => {
    const t = name.trim();
    if (!t || activeTags.includes(t)) return;
    saveTags([...activeTags, t]);
    setTagInput("");
    setShowTagDropdown(false);
  };

  const removeTag = (name: string) => saveTags(activeTags.filter((t) => t !== name));

  // ── Upload documents ───────────────────────────────────────────────────────
  const uploadDocuments = async (files: FileList | File[]) => {
    if (!expenseId) return;
    const arr = Array.from(files);
    if (!arr.length) return;
    const entries: UploadEntry[] = arr.map((f) => ({ localId: `${Date.now()}-${f.name}`, filename: f.name, status: "uploading" }));
    setUploadQueue((prev) => [...prev, ...entries]);
    await Promise.allSettled(arr.map(async (file, i) => {
      const localId = entries[i].localId;
      try {
        // Multipart upload - server extracts text from PDFs via pdfplumber
        // and archives the original bytes. The JSON endpoint cannot accept
        // binary files.
        const form = new FormData();
        form.append("company_id", "1");
        form.append("expense_id", String(expenseId));
        form.append("file", file, file.name);
        const r = await fetch(`${API}/expenses/documents/upload`, {
          method: "POST", headers: { ...getAuthHeaders() }, body: form,
        });
        setUploadQueue((prev) => prev.map((e) => e.localId === localId ? { ...e, status: r.ok ? "done" : "error" } : e));
      } catch {
        setUploadQueue((prev) => prev.map((e) => e.localId === localId ? { ...e, status: "error" } : e));
      }
    }));
    onDocRefreshNeeded();
    const u = await apiCall<Expense>(`/expenses/${expenseId}`).catch(() => null);
    if (u) { setExpense(u); onExpenseUpdated?.(u); }
    const br = await apiCall<BlockersResult>(`/expenses/blockers/${expenseId}`).catch(() => null);
    if (br) setExpenseBlockers(br);
    setTimeout(() => setUploadQueue((prev) => prev.filter((e) => e.status !== "done")), 1500);
  };

  // ── Save allocations ───────────────────────────────────────────────────────
  const saveAllocationsRows = async (rows: AllocationRow[]) => {
    if (!expenseId) return;
    setSavingAllocation(true); setAllocSaveError(null);
    try {
      const toSave = allowSplit ? rows : rows.slice(0, 1);
      const items = toSave
        .filter((row) => row.project_id || row.client_id || row.cost_center_id)
        .map((row) => ({ project_id: row.project_id, client_id: row.client_id, cost_center_id: row.cost_center_id, percent: parseFloat(row.percent) || 100 }));
      if (!items.length) return; // nothing selected yet, skip silently
      try {
        await apiCall(`/expenses/allocation-edit/${expenseId}`, { method: "PUT", json: { items } });
      } catch (e: any) {
        setAllocSaveError(e?.body?.detail ?? e?.message ?? "Save failed.");
        return;
      }
      await loadAllocations(expenseId);
      const [br, ar] = await Promise.all([
        apiCall<BlockersResult>(`/expenses/blockers/${expenseId}`).catch(() => null),
        apiCall<{ actions?: EmployeeActions | null }>(`/expenses/actions/${expenseId}?portal_role=employee`).catch(() => null),
      ]);
      if (br) setExpenseBlockers(br);
      if (ar) setEmployeeActions(ar.actions ?? null);
    } finally { setSavingAllocation(false); }
  };

  const saveAllocations = () => saveAllocationsRows(allocationRows);

  const updateRow = (i: number, field: keyof AllocationRow, value: number | null | string) => {
    setAllocationRows((prev) => {
      const next = prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r);
      // debounced autosave
      if (allocDebounceRef.current) clearTimeout(allocDebounceRef.current);
      allocDebounceRef.current = setTimeout(() => saveAllocationsRows(next), 800);
      return next;
    });
  };

  // ── Delete draft ───────────────────────────────────────────────────────────
  const deleteDraft = async () => {
    if (!expense) return;
    setDeletingDraft(true);
    try {
      await apiDelete(`/expenses/${expense.id}`);
      onDeleted?.();
    } catch { /* silent */ } finally { setDeletingDraft(false); }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!expense) return;
    setSubmittingExpense(true); setSubmitError(null);
    try {
      const u = await apiPost<Expense>(`/expenses/review-actions/${expense.id}/submit`);
      setExpense(u); onExpenseUpdated?.(u);
      const ar = await apiCall<{ actions?: EmployeeActions | null }>(`/expenses/actions/${expense.id}?portal_role=employee`).catch(() => null);
      if (ar) setEmployeeActions(ar.actions ?? null);
    } catch (e: any) {
      setSubmitError(e?.body?.detail ?? e?.message ?? td("serverError"));
    } finally { setSubmittingExpense(false); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const allowSplit      = derived?.allow_split_allocations ?? expensePolicy?.allow_split_allocations ?? true;
  const pdfPairRequired = derived?.pdf_pair_required_for_cfdi ?? expensePolicy?.pdf_pair_required_for_cfdi ?? false;
  const xmlMode         = derived?.xml_required_mode ?? expensePolicy?.xml_required_mode ?? "optional";
  const docFreeAllowed  = derived?.allow_document_free_expenses ?? expensePolicy?.allow_document_free_expenses ?? false;
  const dimStr          = expensePolicy?.allocation_dimensions ?? "";
  const dimArr: string[] = derived?.allocation_dimensions ?? [];
  // Show all three dims when no policy config provided
  const noDimConfig = dimStr === "" && dimArr.length === 0;
  const showProject = noDimConfig || dimStr.includes("project")     || dimArr.includes("project");
  const showClient  = noDimConfig || dimStr.includes("client")      || dimArr.includes("client");
  const showCC      = noDimConfig || dimStr.includes("cost_center") || dimArr.includes("cost_center");

  const activeDims: Array<{ key: "project_id" | "client_id" | "cost_center_id"; label: string; units: OrgUnit[]; ph: string }> = [];
  if (showProject) activeDims.push({ key: "project_id",     label: t("newExpenseModal.fieldProject"),     units: projects,    ph: ` -  ${t("newExpenseModal.fieldProject")}  - `  });
  if (showClient)  activeDims.push({ key: "client_id",      label: t("newExpenseModal.fieldClient"),      units: clients,     ph: ` -  ${t("newExpenseModal.fieldClient")}  - `   });
  if (showCC)      activeDims.push({ key: "cost_center_id", label: t("newExpenseModal.fieldCostCenter"),  units: costCenters, ph: ` -  ${t("newExpenseModal.fieldCostCenter")}  - ` });

  const xmlRequired = xmlMode === "always" || (xmlMode === "mxn_only" && expense !== null && Number(expense.amount) > 0);
  const submissionDocs = linkedDocs.filter((d) => !d.document_type || SUBMISSION_TYPES.has(d.document_type));
  const hasXml  = submissionDocs.some((d) => d.document_type === "cfdi_xml");
  const hasPdf  = submissionDocs.some((d) => ["cfdi_pdf", "pdf", "pdf_unclassified"].includes(d.document_type ?? ""));
  const canUpload = !employeeActions || employeeActions.can_add_documents;
  const splitTotal = allocationRows.reduce((s, r) => s + (parseFloat(r.percent) || 0), 0);

  const firstAlloc  = allocations[0];
  const projectName = firstAlloc?.project_id     ? projects.find((p)    => p.id === firstAlloc.project_id)?.name     ?? null : null;
  const clientName  = firstAlloc?.client_id      ? clients.find((c)     => c.id === firstAlloc.client_id)?.name      ?? null : null;
  const ccName      = firstAlloc?.cost_center_id ? costCenters.find((c) => c.id === firstAlloc.cost_center_id)?.name ?? null : null;

  // ── Policy dot derived from all non-SAT validation results ─────────────────
  const latestByCode = new Map<string, ValidationResultRow>();
  for (const v of validations) {
    if (!latestByCode.has(v.rule_code) || new Date(v.created_at) > new Date(latestByCode.get(v.rule_code)!.created_at)) latestByCode.set(v.rule_code, v);
  }
  const policyChecksForDot = policyChecks.filter((c) => c.group !== "sat" && c.status !== "not_applicable" && c.status !== "pending");
  const policyDotStatus: "passed" | "warning" | "failed" | null =
    policyChecksForDot.length === 0 ? null
    : policyChecksForDot.some((c) => c.status === "failed")  ? "failed"
    : policyChecksForDot.some((c) => c.status === "warning") ? "warning"
    : "passed";

  const xmlFormattedDate = parsedXml?.fecha
    ? new Date(parsedXml.fecha.substring(0, 10) + "T00:00:00").toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    : null;
  const formattedExpenseDate = expense?.expense_date
    ? new Date(expense.expense_date + "T00:00:00").toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  // ── Readiness ──────────────────────────────────────────────────────────────
  const blockers = expenseBlockers?.submit_blockers ?? [];
  const hasProject = allocationSummary?.presence.has_any ?? allocations.length > 0;
  const needsProject = activeDims.length > 0 && !hasProject;
  let readiness: { label: string; ok: boolean } = { label: td("readinessReady"), ok: true };
  if (expense?.status !== "draft") {
    readiness = { label: td("readinessWaiting"), ok: true };
  } else if (!docFreeAllowed && xmlRequired && !hasXml) {
    readiness = { label: td("readinessXmlRequired"), ok: false };
  } else if (!docFreeAllowed && pdfPairRequired && hasXml && !hasPdf) {
    readiness = { label: td("readinessPdfRequired"), ok: false };
  } else if (needsProject || blockers.some((b) => /project|client|cost.?center/i.test(b))) {
    readiness = { label: td("readinessProjectRequired"), ok: false };
  } else if (blockers.length > 0) {
    readiness = { label: blockers[0], ok: false };
  }

  // ── Empty / loading states ─────────────────────────────────────────────────
  if (!expenseId || (!loadingExpense && !expense)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-subtle bg-surface-1">
          <FileText className="h-5 w-5 text-muted" />
        </div>
        <p className="text-sm font-medium text-muted">{tc("noResults")}</p>
      </div>
    );
  }
  if (loadingExpense || !expense) {
    return <div className="flex h-full items-center justify-center"><p className="text-xs text-muted">{tc("loading")}</p></div>;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Scrollable body + sticky submit footer */}
      <div className="flex h-full flex-col overflow-hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-2 px-4 py-3 pb-2">

            {/* Back button */}
            {onBack && (
              <button type="button" onClick={onBack}
                className="flex items-center gap-1 text-[10px] text-muted hover:text-tertiary">
                <ChevronLeft className="h-3 w-3" /> {td("back")}
              </button>
            )}

            {/* ── HEADER CARD ───────────────────────────────────────── */}
            <ExpenseHeader
              expense={expense}
              parsedXml={parsedXml}
              satStatus={satStatus}
              policyDotStatus={policyDotStatus}
              hasXml={hasXml}
              editingTitle={editingTitle}
              titleDraft={titleDraft}
              savingTitle={savingTitle}
              setTitleDraft={setTitleDraft}
              setEditingTitle={setEditingTitle}
              saveTitle={saveTitle}
              deleteDraft={deleteDraft}
              deletingDraft={deletingDraft}
              employeeActions={employeeActions}
              onBack={onBack}
            />
            {/* Phase 5.4 - anomaly banner */}
            <AnomalyBanner
              expenseId={expense.id}
              amount={Number(expense.amount)}
              categoryCode={expense.category_code}
              expenseDate={expense.expense_date}
            />

            {/* ── Tabs + Submit ─────────────────────────────────────── */}
            <div className="border-b border-default">
              <nav className="-mb-px flex items-end">
                {(["overview", "documents", "validations"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-3 pb-1.5 pt-0 text-[11px] font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "border-blue-500/70 text-secondary"
                        : "border-transparent text-muted hover:text-tertiary"
                    }`}>
                    {(() => {
                      if (tab === "validations") return td("validations");
                      if (tab === "documents")   return td("documents");
                      return td("overview");
                    })()}
                  </button>
                ))}
                {expense.status === "draft" && (
                  <div className="ml-auto flex items-center gap-2 pb-1">
                    {submitError && <span className="text-[9px] text-error/60">{submitError}</span>}
                    {!readiness.ok && <span className="text-[9px] text-warning/50">{readiness.label}</span>}
                    <button type="button" onClick={handleSubmit}
                      disabled={submittingExpense || (employeeActions !== null && !employeeActions.can_submit && !employeeActions.can_resubmit)}
                      title={!readiness.ok ? readiness.label : undefined}
                      className="inline-flex items-center gap-1 rounded border bg-accent-muted bg-accent-muted px-2.5 py-1 text-[10px] font-medium text-accent hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40">
                      <Send className="h-2.5 w-2.5" />
                      {submittingExpense ? t("expenseDetail.submitting") : t("expenseDetail.submitExpense")}
                    </button>
                  </div>
                )}
              </nav>
            </div>

            {/* ══════════════════════════════════════════════════════ */}
            {/* OVERVIEW TAB                                          */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === "overview" && (
              <ExpenseOverviewTab
                expense={expense}
                linkedDocs={linkedDocs}
                parsedXml={parsedXml}
                projects={projects}
                clients={clients}
                costCenters={costCenters}
                predefinedTags={predefinedTags}
                categories={categories}
                allocationRows={allocationRows}
                setAllocationRows={setAllocationRows}
                updateRow={updateRow}
                splitTotal={splitTotal}
                allowSplit={allowSplit}
                activeDims={activeDims}
                notes={notes}
                setNotes={setNotes}
                saveNotes={saveNotes}
                savingNotes={savingNotes}
                activeTags={activeTags}
                tagInput={tagInput}
                setTagInput={setTagInput}
                showTagDropdown={showTagDropdown}
                setShowTagDropdown={setShowTagDropdown}
                addTag={addTag}
                removeTag={removeTag}
                saveCategory={saveCategory}
                savingCategory={savingCategory}
                savingAllocation={savingAllocation}
                allocSaveError={allocSaveError}
                employeeActions={employeeActions}
                xmlRequired={xmlRequired}
                hasXml={hasXml}
                pdfPairRequired={pdfPairRequired}
                hasPdf={hasPdf}
              />
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* DOCUMENTS TAB                                         */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === "documents" && (
              <ExpenseDocumentsTab
                linkedDocs={linkedDocs}
                loadingDocs={loadingDocs}
                uploadQueue={uploadQueue}
                canUpload={canUpload}
                dragOver={dragOver}
                setDragOver={setDragOver}
                uploadDocuments={uploadDocuments}
                fileInputRef={fileInputRef}
                confirmDeleteDocId={confirmDeleteDocId}
                setConfirmDeleteDocId={setConfirmDeleteDocId}
                deleteDocument={deleteDocument}
                deletingDocId={deletingDocId}
                xmlRequired={xmlRequired}
                hasXml={hasXml}
                pdfPairRequired={pdfPairRequired}
                hasPdf={hasPdf}
                parsedXml={parsedXml}
                setShowXmlModal={setShowXmlModal}
              />
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* VALIDATIONS TAB                                       */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === "validations" && (
              <ExpenseValidationsTab
                loadingVals={loadingVals}
                validations={validations as any}
                policyChecks={policyChecks as any}
              />
            )}
</div>
        </div>



      </div>

      {/* XML detail modal */}
      {showXmlModal && (
        <XmlDetailModal
          open={showXmlModal}
          onClose={() => setShowXmlModal(false)}
          extractedData={parsedXml ?? undefined}
          satStatus={satStatus ?? undefined}
        />
      )}
    </>
  );
}
