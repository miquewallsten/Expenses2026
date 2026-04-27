"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileText, Upload, CheckCircle2, XCircle,
  Send, Trash2, ChevronLeft, AlertTriangle, X, Tag, Plus,
} from "lucide-react";
import {
  type ExtractedData,
  type ExpenseDocument,
  SUBMISSION_TYPES,
} from "@/lib/expenses/xmlExtract";
import { useTranslations } from "next-intl";
import XmlDetailModal from "@/components/employee/XmlDetailModal";
import ExpenseAuditDrawer from "@/components/expense/ExpenseAuditDrawer";
import AnomalyBanner from "@/components/expense/AnomalyBanner";
import { getAuthHeaders } from "@/lib/session";

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
    case "cfdi_xml": return "text-sky-400/70";
    case "cfdi_pdf": case "pdf": case "pdf_unclassified": return "text-indigo-400/60";
    case "ticket": case "receipt": return "text-amber-400/55";
    default: return "text-white/28";
  }
}

const TAG_COLOR_CLS: Record<string, string> = {
  sky: "border-sky-500/20 bg-sky-500/[0.07] text-sky-400/70",
  indigo: "border-indigo-500/20 bg-indigo-500/[0.07] text-indigo-400/70",
  violet: "border-violet-500/20 bg-violet-500/[0.07] text-violet-400/70",
  emerald: "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400/70",
  amber: "border-amber-500/20 bg-amber-500/[0.07] text-amber-400/60",
  rose: "border-rose-500/20 bg-rose-500/[0.07] text-rose-400/65",
  zinc: "border-white/10 bg-white/[0.04] text-white/40",
};

const TAG_DOT_CLS: Record<string, string> = {
  sky: "bg-sky-400/70",
  indigo: "bg-indigo-400/70",
  violet: "bg-violet-400/70",
  emerald: "bg-emerald-400/70",
  amber: "bg-amber-400/70",
  rose: "bg-rose-400/70",
  zinc: "bg-zinc-500/70",
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
      className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-1.5 py-1 text-[10px] text-white/55 outline-none focus:border-indigo-500/30"
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
        const res = await fetch(`${API}/expenses/documents/${docId}/file`, { headers: { ...getAuthHeaders() } });
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
  const tileBase = "group relative flex h-16 w-12 shrink-0 items-center justify-center overflow-hidden rounded border bg-white/[0.02]";

  let tile: React.ReactNode;
  if (isXml) {
    tile = (
      <div className={`${tileBase} border-white/[0.08] hover:border-sky-400/35 cursor-pointer`} title={filename}>
        <div className="flex h-full w-full flex-col items-stretch justify-between bg-gradient-to-b from-sky-500/[0.06] to-white/[0.01] p-1">
          <div className="flex flex-col gap-[2px]">
            <div className="h-[2px] w-3/4 rounded-sm bg-sky-400/30" />
            <div className="h-[2px] w-full rounded-sm bg-white/10" />
            <div className="h-[2px] w-5/6 rounded-sm bg-white/10" />
            <div className="h-[2px] w-2/3 rounded-sm bg-white/10" />
          </div>
          <div className="self-end rounded-sm bg-sky-500/30 px-1 text-[7px] font-bold tracking-wider text-sky-100/85">
            XML
          </div>
        </div>
      </div>
    );
  } else if (error) {
    tile = (
      <div className={`${tileBase} border-white/[0.07] text-[8px] text-white/30`} title={filename}>
        N/A
      </div>
    );
  } else if (!blobUrl) {
    tile = (
      <div className={`${tileBase} border-white/[0.06]`} title={filename}>
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white/20" />
      </div>
    );
  } else if (isImage) {
    tile = (
      <div className={`${tileBase} border-white/[0.08] hover:border-indigo-400/35 cursor-zoom-in`} title={filename}>
        <img src={blobUrl} alt={filename} className="h-full w-full object-cover" />
      </div>
    );
  } else {
    // PDF — render a faux first-page card. The browser PDF viewer won't
    // render usefully at this size; instead show a clear "PDF" affordance.
    tile = (
      <div className={`${tileBase} border-white/[0.08] hover:border-indigo-400/35 cursor-zoom-in`} title={filename}>
        <div className="flex h-full w-full flex-col items-stretch justify-between bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-1">
          <div className="flex flex-col gap-[2px]">
            <div className="h-[2px] w-3/4 rounded-sm bg-white/15" />
            <div className="h-[2px] w-full rounded-sm bg-white/10" />
            <div className="h-[2px] w-5/6 rounded-sm bg-white/10" />
            <div className="h-[2px] w-2/3 rounded-sm bg-white/10" />
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative flex h-[88vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
              <div className="min-w-0 flex-1 truncate text-[11px] text-white/70">{filename}</div>
              <div className="flex items-center gap-2">
                <a
                  href={blobUrl}
                  download={filename}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/55 hover:border-white/25 hover:text-white/80"
                >
                  Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded border border-white/10 px-2 py-0.5 text-[10px] text-white/55 hover:border-white/25 hover:text-white/80"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center bg-zinc-900">
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
    const h = getAuthHeaders();
    Promise.all([
      fetch(`${API}/expenses/projects?company_id=1`,     { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/clients?company_id=1`,      { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/cost-centers?company_id=1`, { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/tags?company_id=1`,         { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/admin/accounting-categories/1`,      { headers: h }).then((r) => r.ok ? r.json() : []),
    ]).then(([p, c, cc, t, cats]) => {
      setProjects(p); setClients(c); setCostCenters(cc); setPredefinedTags(t);
      setCategories(Array.isArray(cats) ? cats : []);
    }).catch(() => {});
  }, []);

  // ── Fetch expense ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setExpense(null); return; }
    setLoadingExpense(true);
    fetch(`${API}/expenses/${expenseId}`, { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
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
    const [r, sr] = await Promise.all([
      fetch(`${API}/expenses/allocations/${id}`,         { headers: getAuthHeaders() }),
      fetch(`${API}/expenses/allocations-summary/${id}`, { headers: getAuthHeaders() }),
    ]);
    if (r.ok) {
      const data: AllocationRead[] = await r.json();
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
    if (sr.ok) setAllocationSummary(await sr.json());
  }, []);

  useEffect(() => {
    if (!expenseId) { setAllocations([]); setAllocationSummary(null); return; }
    loadAllocations(expenseId);
  }, [expenseId, loadAllocations]);

  // ── Fetch employee actions + blockers ──────────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setEmployeeActions(null); setExpenseBlockers(null); return; }
    Promise.all([
      fetch(`${API}/expenses/actions/${expenseId}?portal_role=employee`, { headers: getAuthHeaders() }),
      fetch(`${API}/expenses/blockers/${expenseId}`, { headers: getAuthHeaders() }),
    ]).then(async ([ar, br]) => {
      if (ar.ok) { const d = await ar.json(); setEmployeeActions(d?.actions ?? null); }
      if (br.ok) setExpenseBlockers(await br.json());
    }).catch(() => {});
  }, [expenseId, expense?.status, checksRefreshNonce]);

  // ── Fetch validations eagerly on expense load ────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setValidations([]); setPolicyChecks([]); return; }
    setLoadingVals(true);
    const h = getAuthHeaders();
    Promise.all([
      fetch(`${API}/expenses/${expenseId}/validations`,   { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/${expenseId}/policy-checks`, { headers: h }).then((r) => r.ok ? r.json() : []),
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
      const r = await fetch(`${API}/expenses/${expense.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ description: titleDraft.trim() }),
      });
      if (r.ok) { const u = await r.json(); setExpense(u); onExpenseUpdated?.(u); }
    } finally { setSavingTitle(false); setEditingTitle(false); }
  };

  // ── Save notes ─────────────────────────────────────────────────────────────
  const saveNotes = async () => {
    if (!expense) return;
    setSavingNotes(true);
    try {
      const r = await fetch(`${API}/expenses/${expense.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ notes }),
      });
      if (r.ok) { const u = await r.json(); setExpense(u); onExpenseUpdated?.(u); }
    } finally { setSavingNotes(false); }
  };

  // ── Save category (tipo de gasto) ──────────────────────────────────────────
  const saveCategory = async (code: string) => {
    if (!expense) return;
    setSavingCategory(true);
    try {
      const r = await fetch(`${API}/expenses/${expense.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ category_code: code || null }),
      });
      if (r.ok) { const u = await r.json(); setExpense(u); onExpenseUpdated?.(u); }
    } finally { setSavingCategory(false); }
  };

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDocument = async (docId: number) => {
    setDeletingDocId(docId);
    try {
      const r = await fetch(`${API}/expenses/documents/${docId}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (r.ok) {
        setConfirmDeleteDocId(null);
        onDocRefreshNeeded();
        // refresh validations (some may reference deleted doc)
        const vr = await fetch(`${API}/expenses/${expenseId}/validations`, { headers: getAuthHeaders() });
        if (vr.ok) setValidations(await vr.json());
      }
    } finally { setDeletingDocId(null); }
  };

  // ── Save tags ──────────────────────────────────────────────────────────────
  const saveTags = async (newTags: string[]) => {
    if (!expense) return;
    setActiveTags(newTags);
    await fetch(`${API}/expenses/${expense.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ tags: JSON.stringify(newTags) }),
    });
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
        // Multipart upload — server extracts text from PDFs via pdfplumber
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
    const er = await fetch(`${API}/expenses/${expenseId}`, { headers: getAuthHeaders() });
    if (er.ok) { const u: Expense = await er.json(); setExpense(u); onExpenseUpdated?.(u); }
    const br = await fetch(`${API}/expenses/blockers/${expenseId}`, { headers: getAuthHeaders() });
    if (br.ok) setExpenseBlockers(await br.json());
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
      const r = await fetch(`${API}/expenses/allocation-edit/${expenseId}`, {
        method: "PUT", headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setAllocSaveError(b?.detail ?? `Save failed (${r.status}).`); return; }
      await loadAllocations(expenseId);
      const [br, ar] = await Promise.all([
        fetch(`${API}/expenses/blockers/${expenseId}`, { headers: getAuthHeaders() }),
        fetch(`${API}/expenses/actions/${expenseId}?portal_role=employee`, { headers: getAuthHeaders() }),
      ]);
      if (br.ok) setExpenseBlockers(await br.json());
      if (ar.ok) { const d = await ar.json(); setEmployeeActions(d?.actions ?? null); }
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
      const r = await fetch(`${API}/expenses/${expense.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (r.ok) onDeleted?.();
    } catch { /* silent */ } finally { setDeletingDraft(false); }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!expense) return;
    setSubmittingExpense(true); setSubmitError(null);
    try {
      const r = await fetch(`${API}/expenses/review-actions/${expense.id}/submit`, { method: "POST", headers: getAuthHeaders() });
      if (r.ok) {
        const u = await r.json(); setExpense(u); onExpenseUpdated?.(u);
        const ar = await fetch(`${API}/expenses/actions/${expense.id}?portal_role=employee`, { headers: getAuthHeaders() });
        if (ar.ok) { const d = await ar.json(); setEmployeeActions(d?.actions ?? null); }
      } else {
        const b = await r.json().catch(() => ({}));
        setSubmitError(b?.detail ?? `Submission failed (${r.status}).`);
      }
    } catch { setSubmitError(td("serverError")); }
    finally { setSubmittingExpense(false); }
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
  if (showProject) activeDims.push({ key: "project_id",     label: t("newExpenseModal.fieldProject"),     units: projects,    ph: `— ${t("newExpenseModal.fieldProject")} —`  });
  if (showClient)  activeDims.push({ key: "client_id",      label: t("newExpenseModal.fieldClient"),      units: clients,     ph: `— ${t("newExpenseModal.fieldClient")} —`   });
  if (showCC)      activeDims.push({ key: "cost_center_id", label: t("newExpenseModal.fieldCostCenter"),  units: costCenters, ph: `— ${t("newExpenseModal.fieldCostCenter")} —` });

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
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.06] bg-white/[0.03]">
          <FileText className="h-5 w-5 text-white/15" />
        </div>
        <p className="text-sm font-medium text-white/25">{tc("noResults")}</p>
      </div>
    );
  }
  if (loadingExpense || !expense) {
    return <div className="flex h-full items-center justify-center"><p className="text-xs text-white/20">{tc("loading")}</p></div>;
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
                className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/55">
                <ChevronLeft className="h-3 w-3" /> {td("back")}
              </button>
            )}

            {/* ── HEADER CARD ───────────────────────────────────────── */}
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-4 py-3">
              {/* Row 1: Title (large) + actions */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  {editingTitle ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTitle(false); }}
                        onBlur={saveTitle}
                        className="flex-1 rounded border border-indigo-500/30 bg-transparent px-1 py-0 text-[17px] font-bold text-white/95 outline-none"
                      />
                      {savingTitle && <span className="text-[9px] text-white/25">{td("saving")}</span>}
                    </div>
                  ) : (
                    <button type="button"
                      onClick={() => { setTitleDraft(sanitizeTitle(expense.description)); setEditingTitle(true); }}
                      className="group text-left">
                      <h1 className="text-[17px] font-bold leading-tight text-white/95 group-hover:underline group-hover:decoration-white/20">
                        {sanitizeTitle(expense.description)}
                      </h1>
                    </button>
                  )}
                  {/* Amount — large, right below title */}
                  <p className="mt-0.5 text-[22px] font-bold tabular-nums leading-none text-white">
                    ${Number(expense.amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    <span className="ml-1.5 text-[10px] font-normal text-white/30">{parsedXml?.moneda ?? "MXN"}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                  <ExpenseAuditDrawer expenseId={expense.id} variant="icon" />
                  {employeeActions?.can_delete && (
                    <button type="button" onClick={deleteDraft} disabled={deletingDraft}
                      className="rounded p-0.5 text-white/18 hover:text-red-400/60 disabled:opacity-40">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: compact metadata inline */}
              <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-white/[0.05] pt-2">
                {parsedXml?.emisor_nombre && (
                  <span className="text-[10px] text-white/50"><span className="text-white/22">{td("vendor")} </span>{parsedXml.emisor_nombre}</span>
                )}
                {(xmlFormattedDate ?? formattedExpenseDate) && (
                  <span className="text-[10px] text-white/50"><span className="text-white/22">{td("date")} </span>{xmlFormattedDate ?? formattedExpenseDate}</span>
                )}
                {parsedXml?.emisor_rfc && (
                  <span className="font-mono text-[10px] text-white/45"><span className="font-sans text-white/22">{td("rfc")} </span>{parsedXml.emisor_rfc}</span>
                )}
                {/* SAT dot + Policy dot — same line, pushed right */}
                <div className="ml-auto flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {satStatus === "valid"   && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" /><span className="text-[9px] text-emerald-400/60">SAT ✓</span></>}
                    {satStatus === "warning" && <><span className="h-1.5 w-1.5 rounded-full bg-amber-400/70"   /><span className="text-[9px] text-amber-400/60">SAT ⚠</span></>}
                    {satStatus === "error"   && <><span className="h-1.5 w-1.5 rounded-full bg-red-400/70"     /><span className="text-[9px] text-red-400/55">SAT ✗</span></>}
                    {!satStatus && hasXml    && <><span className="h-1.5 w-1.5 rounded-full bg-zinc-500/50"    /><span className="text-[9px] text-white/22">XML</span></>}
                    {!satStatus && !hasXml   && <><span className="h-1.5 w-1.5 rounded-full bg-zinc-700/60"    /><span className="text-[9px] text-white/15">{td("noXml")}</span></>}
                  </div>
                  <div className="flex items-center gap-1">
                    {policyDotStatus === "passed"  && <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400/70" /><span className="text-[9px] text-emerald-400/60">Policy ✓</span></>}
                    {policyDotStatus === "warning" && <><span className="h-1.5 w-1.5 rounded-full bg-amber-400/70"   /><span className="text-[9px] text-amber-400/60">Policy ⚠</span></>}
                    {policyDotStatus === "failed"  && <><span className="h-1.5 w-1.5 rounded-full bg-red-400/70"     /><span className="text-[9px] text-red-400/55">Policy ✗</span></>}
                    {policyDotStatus === null      && <><span className="h-1.5 w-1.5 rounded-full bg-zinc-700/50"    /><span className="text-[9px] text-white/18">Policy</span></>}
                  </div>
                </div>
              </div>
            </div>

            {/* Phase 5.4 — anomaly banner */}
            <AnomalyBanner
              expenseId={expense.id}
              amount={Number(expense.amount)}
              categoryCode={expense.category_code}
              expenseDate={expense.expense_date}
            />

            {/* ── Tabs + Submit ─────────────────────────────────────── */}
            <div className="border-b border-white/[0.07]">
              <nav className="-mb-px flex items-end">
                {(["overview", "documents", "validations"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setActiveTab(tab)}
                    className={`border-b-2 px-3 pb-1.5 pt-0 text-[11px] font-medium capitalize transition-colors ${
                      activeTab === tab
                        ? "border-indigo-500/70 text-white/80"
                        : "border-transparent text-white/35 hover:text-white/55"
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
                    {submitError && <span className="text-[9px] text-red-300/60">{submitError}</span>}
                    {!readiness.ok && <span className="text-[9px] text-amber-400/50">{readiness.label}</span>}
                    <button type="button" onClick={handleSubmit}
                      disabled={submittingExpense || (employeeActions !== null && !employeeActions.can_submit && !employeeActions.can_resubmit)}
                      title={!readiness.ok ? readiness.label : undefined}
                      className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-600/20 px-2.5 py-1 text-[10px] font-medium text-indigo-300 hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40">
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
              <div className="space-y-2 pb-20">

                {/* ── Allocation (3/4) + Expense type (1/4) on same row ── */}
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <div className="flex gap-4">

                    {/* Allocation — 3/4 */}
                    <div className="min-w-0 flex-[3]">
                      <h3 className="mb-2 text-[11px] font-semibold text-white/70">
                        {activeDims.length === 1 && activeDims[0].key === "project_id" ? t("newExpenseModal.fieldProject") : td("projectAllocation")}
                      </h3>
                      {activeDims.length === 0 ? (
                        <p className="text-[10px] text-white/25">{td("noAllocationDims")}</p>
                      ) : (
                        <div className="space-y-2">
                          {/* First row */}
                          <div className="flex items-center gap-2">
                            {activeDims.map((d) => (
                              <div key={d.key} className="flex-1">
                                {activeDims.length > 1 && (
                                  <p className="mb-0.5 text-[8px] uppercase tracking-wider text-white/22">{d.label}</p>
                                )}
                                <SelectField
                                  value={allocationRows[0]?.[d.key]}
                                  onChange={(v) => updateRow(0, d.key, v)}
                                  options={d.units} placeholder={d.ph}
                                />
                              </div>
                            ))}
                            {allowSplit && (
                              <div className="flex w-14 shrink-0 items-center gap-0.5">
                                <input
                                  type="number" min="0" max="100"
                                  value={allocationRows[0]?.percent ?? "100"}
                                  onChange={(e) => updateRow(0, "percent", e.target.value)}
                                  className="w-full rounded border border-white/[0.07] bg-zinc-900 px-1 py-1 text-[10px] text-white/55 outline-none focus:border-indigo-500/30"
                                />
                                <span className="text-[9px] text-white/22">%</span>
                              </div>
                            )}
                          </div>

                          {/* Additional split rows */}
                          {allowSplit && allocationRows.slice(1).map((row, idx) => {
                            const i = idx + 1;
                            return (
                              <div key={i} className="flex items-center gap-2">
                                {activeDims.map((d) => (
                                  <div key={d.key} className="flex-1">
                                    <SelectField value={row[d.key]} onChange={(v) => updateRow(i, d.key, v)} options={d.units} placeholder={d.ph} />
                                  </div>
                                ))}
                                <div className="flex w-14 shrink-0 items-center gap-0.5">
                                  <input
                                    type="number" min="0" max="100" value={row.percent}
                                    onChange={(e) => updateRow(i, "percent", e.target.value)}
                                    className="w-full rounded border border-white/[0.07] bg-zinc-900 px-1 py-1 text-[10px] text-white/55 outline-none"
                                  />
                                  <span className="text-[9px] text-white/22">%</span>
                                </div>
                                <button type="button" onClick={() => setAllocationRows((p) => p.filter((_, ii) => ii !== i))}
                                  className="shrink-0 text-white/20 hover:text-red-400/50">
                                  <X className="h-3 w-3" />
                                </button>
                              </div>
                            );
                          })}

                          <div className="flex items-center justify-between border-t border-white/[0.05] pt-1.5">
                            <div className="flex items-center gap-3">
                              {allowSplit && (
                                <button type="button"
                                  onClick={() => {
                                    const next = [...allocationRows, { project_id: null, client_id: null, cost_center_id: null, percent: "0" }];
                                    setAllocationRows(next);
                                  }}
                                  className="flex items-center gap-1 text-[9px] text-white/28 hover:text-white/50">
                                  <Plus className="h-2.5 w-2.5" /> {td("addSplit")}
                                </button>
                              )}
                              {allowSplit && allocationRows.length > 1 && (
                                <span className={`text-[9px] font-bold tabular-nums ${splitTotal === 100 ? "text-emerald-400/70" : "text-amber-400/70"}`}>
                                  {splitTotal.toFixed(0)}%
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {allocSaveError && <span className="text-[9px] text-red-300/60">{allocSaveError}</span>}
                              {savingAllocation && <span className="text-[9px] text-white/25">{td("saving")}</span>}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="w-px shrink-0 bg-white/[0.06]" />

                    {/* Expense type — 1/4 */}
                    <div className="flex-1">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-white/70">{td("expenseType")}</p>
                        {expense?.detected_category && !expense?.category_code && (
                          <span className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300/80">
                            {td("aiSuggested")}
                          </span>
                        )}
                        {savingCategory && <span className="text-[9px] text-white/25">{td("saving")}</span>}
                      </div>
                      {categories.length === 0 ? (
                        <select
                          disabled
                          className="w-full cursor-not-allowed rounded border border-white/[0.06] bg-transparent px-2 py-1 text-[10px] text-white/22 outline-none"
                        >
                          <option>{td("pendingCatalogue")}</option>
                        </select>
                      ) : (
                        <select
                          value={expense?.category_code ?? ""}
                          disabled={savingCategory || expense?.status !== "draft"}
                          onChange={(e) => saveCategory(e.target.value)}
                          className="w-full rounded border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[10px] text-white/80 outline-none focus:border-white/25 disabled:cursor-not-allowed disabled:text-white/30"
                        >
                          <option value="">{td("selectCategory")}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.code}>
                              {c.code} — {c.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {expense?.detected_category && !expense?.category_code && (
                        <button
                          type="button"
                          onClick={() => saveCategory(expense.detected_category as string)}
                          className="mt-1 text-[9px] text-indigo-300/70 hover:text-indigo-200 underline underline-offset-2"
                        >
                          {td("applyAiSuggestion", { code: expense.detected_category })}
                        </button>
                      )}
                    </div>

                  </div>
                </div>

                {/* ── Tags + Notes ─────────────────────────────── */}
                <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-3">
                  <div className="flex gap-4">
                    {/* Tags column */}
                    <div className="w-48 shrink-0">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Tag className="h-3 w-3 text-white/25" />
                        <span className="text-[10px] font-medium text-white/45">{td("tags")}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {activeTags.map((t) => {
                          const pre = predefinedTags.find((p) => p.name === t);
                          return (
                            <span key={t} className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-medium ${tagCls(pre?.color)}`}>
                              {t}
                              <button type="button" onClick={() => removeTag(t)} className="opacity-50 hover:opacity-100">
                                <X className="h-2 w-2" />
                              </button>
                            </span>
                          );
                        })}
                        <div className="relative">
                          <input
                            value={tagInput}
                            onChange={(e) => { setTagInput(e.target.value); setShowTagDropdown(true); }}
                            onFocus={() => setShowTagDropdown(true)}
                            onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && tagInput.trim()) { e.preventDefault(); addTag(tagInput); }
                              if (e.key === "Escape") setShowTagDropdown(false);
                            }}
                            placeholder={td("addTagPlaceholder")}
                            className="rounded border border-white/[0.07] bg-transparent px-1.5 py-0.5 text-[9px] text-white/40 placeholder-white/20 outline-none focus:border-indigo-500/30 focus:text-white/60"
                          />
                          {showTagDropdown && (
                            <div className="absolute left-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-lg border border-white/[0.09] bg-zinc-900 shadow-xl">
                              {predefinedTags
                                .filter((p) => !activeTags.includes(p.name) && (tagInput === "" || p.name.toLowerCase().includes(tagInput.toLowerCase())))
                                .map((p) => (
                                  <button key={p.id} type="button" onMouseDown={() => addTag(p.name)}
                                    className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10px] text-white/55 hover:bg-white/[0.06]">
                                    <span className={`inline-flex h-1.5 w-1.5 rounded-full ${tagDotCls(p.color)}`} />
                                    {p.name}
                                  </button>
                                ))}
                              {tagInput.trim() && !predefinedTags.find((p) => p.name === tagInput.trim()) && (
                                <button type="button" onMouseDown={() => addTag(tagInput)}
                                  className="flex w-full items-center gap-2 border-t border-white/[0.06] px-2.5 py-1.5 text-left text-[10px] text-indigo-400/60 hover:bg-white/[0.05]">
                                  <Plus className="h-2.5 w-2.5" /> Create &quot;{tagInput.trim()}&quot;
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Divider */}
                    <div className="w-px shrink-0 bg-white/[0.06]" />

                    {/* Notes column */}
                    <div className="min-w-0 flex-1">
                      <p className="mb-1 text-[10px] font-medium text-white/45">{td("notes")}</p>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        onBlur={saveNotes}
                        readOnly={employeeActions?.can_edit === false}
                        rows={2}
                        placeholder={td("notesPlaceholder")}
                        className={`w-full resize-none rounded border border-white/[0.07] px-2 py-1.5 text-[11px] placeholder-white/15 outline-none transition-colors ${
                          employeeActions?.can_edit === false
                            ? "cursor-not-allowed bg-transparent text-white/25"
                            : "bg-transparent text-white/55 focus:border-indigo-500/30"
                        }`}
                      />
                      {savingNotes && <p className="mt-0.5 text-[9px] text-white/25">{td("saving")}</p>}
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* DOCUMENTS TAB                                         */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === "documents" && (
              <div className="space-y-2 pb-20">
                {canUpload && (
                  <div
                    role="button" tabIndex={0} aria-label="Upload files"
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) uploadDocuments(e.dataTransfer.files); }}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click(); }}
                    className={`flex cursor-pointer items-center gap-2 rounded border border-dashed px-3 py-2 transition-colors select-none ${
                      dragOver ? "border-indigo-500/50 bg-indigo-500/[0.06]" : "border-white/[0.09] hover:border-white/[0.18]"
                    }`}
                  >
                    <Upload className={`h-3.5 w-3.5 shrink-0 ${dragOver ? "text-indigo-400/70" : "text-white/20"}`} />
                    <div className="min-w-0">
                      <p className="text-[11px] text-white/45">
                        {(() => {
                          if (xmlRequired && !hasXml) return td("uploadXmlCfdi");
                          if (pdfPairRequired && hasXml && !hasPdf) return td("uploadPdf");
                          return td("uploadFile");
                        })()}
                      </p>
                      <p className="text-[10px] text-white/22">{td("uploadHint")}</p>
                    </div>
                    <input ref={fileInputRef} type="file" multiple accept=".xml,.pdf,application/xml,application/pdf,text/xml" className="hidden"
                      onChange={(e) => { if (e.target.files?.length) { uploadDocuments(e.target.files); e.target.value = ""; } }} />
                  </div>
                )}

                {uploadQueue.length > 0 && (
                  <div className="space-y-1">
                    {uploadQueue.map((entry) => (
                      <div key={entry.localId} className="flex items-center gap-2 rounded border border-white/[0.05] bg-white/[0.01] px-3 py-2">
                        {entry.status === "uploading" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-400/60" />}
                        {entry.status === "done"      && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" />}
                        {entry.status === "error"     && <XCircle      className="h-3.5 w-3.5 text-red-400/50" />}
                        <span className="min-w-0 flex-1 truncate text-[10px] text-white/40">{entry.filename}</span>
                        {entry.status === "error" && <span className="text-[9px] text-red-400/40">{td("uploadFailed")}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {loadingDocs && linkedDocs.length === 0 && <p className="text-[10px] text-white/25">{td("loadingDocs")}</p>}

                {/* Confirm-delete overlay */}
                {confirmDeleteDocId !== null && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-4 py-3">
                    <p className="text-[11px] text-white/70">{td("confirmDeleteMsg")}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button"
                        onClick={() => deleteDocument(confirmDeleteDocId)}
                        disabled={deletingDocId === confirmDeleteDocId}
                        className="rounded border border-red-500/30 bg-red-500/15 px-2.5 py-1 text-[10px] font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-40">
                        {deletingDocId === confirmDeleteDocId ? td("deleting") : td("yesDelete")}
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteDocId(null)}
                        className="text-[10px] text-white/30 hover:text-white/55">{tc("cancel")}</button>
                    </div>
                  </div>
                )}

                {linkedDocs.length > 0 ? (
                  <div className="space-y-1">
                    {linkedDocs.map((doc) => {
                      const isXml = doc.document_type === "cfdi_xml";
                      return (
                        <div key={doc.id} className="flex items-center gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                          <DocPreview
                            docId={doc.id}
                            filename={doc.filename ?? ""}
                            docType={doc.document_type ?? null}
                            onOpenXmlModal={isXml && parsedXml ? () => setShowXmlModal(true) : undefined}
                          />
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/[0.07] bg-white/[0.02]">
                            <FileText className={`h-3 w-3 ${docTypeCls(doc.document_type)}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] text-white/65">{doc.filename}</p>
                            <p className="text-[9px] text-white/28">
                              {docTypeLabel(doc.document_type, { receipt: td("docType.receipt"), justification: td("docType.justification"), proof: td("docType.proof"), file: td("docType.file") })} · {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            {isXml && satStatus === "valid"   && <span className="text-[9px] text-emerald-400/55">SAT ✓</span>}
                            {isXml && satStatus === "warning" && <span className="text-[9px] text-amber-400/55">SAT ⚠</span>}
                            {isXml && satStatus === "error"   && <span className="text-[9px] text-red-400/55">SAT ✗</span>}
                            {canUpload && (
                              <button type="button"
                                onClick={() => setConfirmDeleteDocId(doc.id)}
                                disabled={deletingDocId === doc.id}
                                className="rounded p-0.5 text-white/18 hover:text-red-400/60 disabled:opacity-40">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : !loadingDocs ? (
                  <p className="text-center text-[11px] text-white/25">{t("expenseDetail.noDocuments")}</p>
                ) : null}
              </div>
            )}

            {/* ══════════════════════════════════════════════════════ */}
            {/* VALIDATIONS TAB                                       */}
            {/* ══════════════════════════════════════════════════════ */}
            {activeTab === "validations" && (() => {
              const fmtTs = (iso: string) => {
                const d = new Date(iso);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              };
              const ruleLabelMap = { XML_FORMAT: td("ruleLabel.XML_FORMAT"), UUID_PRESENT: td("ruleLabel.UUID_PRESENT"), SAT_VALIDATION: td("ruleLabel.SAT_VALIDATION"), MISSING_PDF: td("ruleLabel.MISSING_PDF"), EFOS_CHECK: td("ruleLabel.EFOS_CHECK"), POLICY_CHECK: td("ruleLabel.POLICY_CHECK"), AMOUNT_MATCH: td("ruleLabel.AMOUNT_MATCH"), DATE_RANGE: td("ruleLabel.DATE_RANGE"), PDF_PAIRED: td("ruleLabel.PDF_PAIRED"), DUPLICATE_UUID: td("ruleLabel.DUPLICATE_UUID") };
              const validationByCode = new Map(validations.map(v => [v.rule_code, v]));

              const checkLabel = (c: PolicyCheckRow) => {
                if (c.source === "validator") return ruleLabel(c.code, ruleLabelMap);
                return c.label;
              };

              const statusBadge = (status: PolicyCheckRow["status"]) => {
                const cls = status === "passed"
                  ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400/70"
                  : status === "warning"
                  ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-400/65"
                  : status === "failed"
                  ? "border-red-500/20 bg-red-500/[0.07] text-red-400/65"
                  : status === "not_applicable"
                  ? "border-white/[0.07] bg-white/[0.02] text-white/22"
                  : "border-white/[0.07] bg-white/[0.02] text-white/25";
                return (
                  <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${cls}`}>
                    {status === "not_applicable" ? "n/a" : status}
                  </span>
                );
              };

              const CheckRow = ({ c, showTs }: { c: PolicyCheckRow; showTs?: boolean }) => {
                const stampedV = showTs ? validationByCode.get(c.code) : undefined;
                const sourceHint = c.source === "ai_policy"
                  ? td("sourceAiPolicy")
                  : c.source === "expense_policy"
                  ? td("sourceExpensePolicy")
                  : null;
                const [editingNote, setEditingNote] = useState(false);
                const [noteDraft, setNoteDraft] = useState("");
                const [savingNote, setSavingNote] = useState(false);
                const canJustify =
                  !!expenseId &&
                  !c.overridden &&
                  (c.status === "failed" || c.status === "warning") &&
                  c.code !== "SAT_VALIDATION"; // SAT status is external, not overridable

                const saveOverride = async () => {
                  const note = noteDraft.trim();
                  if (!note || !expenseId) return;
                  setSavingNote(true);
                  try {
                    const r = await fetch(`${API}/expenses/${expenseId}/policy-overrides`, {
                      method: "POST",
                      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                      body: JSON.stringify({ rule_code: c.code, note }),
                    });
                    if (r.ok) {
                      setEditingNote(false);
                      setNoteDraft("");
                      refreshChecks();
                    }
                  } finally {
                    setSavingNote(false);
                  }
                };

                const removeOverride = async () => {
                  if (!expenseId) return;
                  const r = await fetch(
                    `${API}/expenses/${expenseId}/policy-overrides/${encodeURIComponent(c.code)}`,
                    { method: "DELETE", headers: getAuthHeaders() }
                  );
                  if (r.ok) refreshChecks();
                };

                return (
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5 shrink-0">
                        {c.status === "passed"          && <CheckCircle2  className="h-3.5 w-3.5 text-emerald-400/65" />}
                        {c.status === "warning"         && <AlertTriangle className="h-3.5 w-3.5 text-amber-400/60"  />}
                        {c.status === "failed"          && <XCircle       className="h-3.5 w-3.5 text-red-400/60"    />}
                        {(c.status === "pending" || c.status === "not_applicable") && (
                          <div className="h-3.5 w-3.5 rounded-full border border-white/[0.12] bg-zinc-800" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[11px] font-medium ${c.status === "not_applicable" || c.status === "pending" ? "text-white/30" : "text-white/70"}`}>{checkLabel(c)}</p>
                        {c.message && <p className="mt-0.5 text-[10px] text-white/40">{c.message}</p>}
                        {c.overridden && c.original_message && (
                          <p className="mt-0.5 text-[10px] text-white/30 line-through">{c.original_message}</p>
                        )}
                        {sourceHint && <p className="mt-1 text-[9px] uppercase tracking-widest text-white/22">{sourceHint}</p>}
                        {stampedV && <p className="mt-1 font-mono text-[9px] text-white/22">Checked: {fmtTs(stampedV.created_at)}</p>}
                        {canJustify && !editingNote && (
                          <button
                            type="button"
                            onClick={() => setEditingNote(true)}
                            className="mt-1.5 text-[10px] text-amber-300/80 underline underline-offset-2 hover:text-amber-200"
                          >
                            {td("addJustification")}
                          </button>
                        )}
                        {canJustify && editingNote && (
                          <div className="mt-1.5 space-y-1.5">
                            <textarea
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              placeholder={td("justificationPlaceholder")}
                              rows={3}
                              className="w-full rounded border border-white/10 bg-zinc-900/60 px-2 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 focus:border-amber-400/40 focus:outline-none"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={savingNote || !noteDraft.trim()}
                                onClick={saveOverride}
                                className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 hover:bg-emerald-500/15 disabled:opacity-40"
                              >
                                {td("saveJustification")}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingNote(false); setNoteDraft(""); }}
                                className="text-[10px] text-white/40 hover:text-white/60"
                              >
                                {td("cancel")}
                              </button>
                            </div>
                          </div>
                        )}
                        {c.overridden && (
                          <button
                            type="button"
                            onClick={removeOverride}
                            className="mt-1 text-[10px] text-white/35 underline underline-offset-2 hover:text-red-300/80"
                          >
                            {td("removeJustification")}
                          </button>
                        )}
                      </div>
                      {c.overridden ? (
                        <span className="mt-0.5 shrink-0 rounded border border-emerald-500/25 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-300/80">
                          {td("justified")}
                        </span>
                      ) : (
                        statusBadge(c.status)
                      )}
                    </div>
                  </div>
                );
              };

              const bySource = {
                document: policyChecks.filter(c => c.group === "document"),
                sat:      policyChecks.filter(c => c.group === "sat"),
                policy:   policyChecks.filter(c => c.group === "policy"),
                ai:       policyChecks.filter(c => c.group === "ai"),
              };

              const Section = ({ title, items, showTs }: { title: string; items: PolicyCheckRow[]; showTs?: boolean }) => {
                if (items.length === 0) return null;
                return (
                  <div>
                    <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/22">{title}</p>
                    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                      {items.map((c, i) => (
                        <div key={c.code} className={i > 0 ? "border-t border-white/[0.05]" : ""}>
                          <CheckRow c={c} showTs={showTs} />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-2 pb-20">
                  {loadingVals && <p className="text-[10px] text-white/25">{tc("loading")}</p>}

                  <Section title={td("valDocIntegrity")} items={bySource.document} />

                  {bySource.sat.length > 0 ? (
                    <Section title={td("valSatVerification")} items={bySource.sat} showTs />
                  ) : (
                    <div>
                      <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/22">{td("valSatVerification")}</p>
                      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                        <div className="flex items-start gap-2.5 px-3 py-2.5">
                          <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-white/[0.12] bg-zinc-800" />
                          <div>
                            <p className="text-[11px] text-white/35">{td("valSatLabel")}</p>
                            <p className="mt-0.5 text-[10px] text-white/22">{td("valSatNotRunHint")}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <Section title={td("valPolicyCompliance")} items={bySource.policy} />
                  <Section title={td("valAiPolicies")} items={bySource.ai} />

                  {!loadingVals && policyChecks.length === 0 && (
                    <div className="rounded-lg border border-white/[0.07] px-3 py-3 text-[10px] text-white/25">
                      {td("valNoPolicyChecks")}
                    </div>
                  )}
                </div>
              );
            })()}

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
