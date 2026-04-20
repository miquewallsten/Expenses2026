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

function tagCls(color: string | null | undefined): string {
  return TAG_COLOR_CLS[color ?? "zinc"] ?? TAG_COLOR_CLS.zinc;
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

  // Document deletion
  const [deletingDocId, setDeletingDocId]           = useState<number | null>(null);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<number | null>(null);

  // ── Fetch org units + predefined tags ─────────────────────────────────────
  useEffect(() => {
    const h = { "X-User-Id": "1" };
    Promise.all([
      fetch(`${API}/expenses/projects?company_id=1`,     { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/clients?company_id=1`,      { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/cost-centers?company_id=1`, { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/expenses/tags?company_id=1`,         { headers: h }).then((r) => r.ok ? r.json() : []),
    ]).then(([p, c, cc, t]) => { setProjects(p); setClients(c); setCostCenters(cc); setPredefinedTags(t); }).catch(() => {});
  }, []);

  // ── Fetch expense ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setExpense(null); return; }
    setLoadingExpense(true);
    fetch(`${API}/expenses/${expenseId}`, { headers: { "X-User-Id": "1" } })
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
      fetch(`${API}/expenses/allocations/${id}`,         { headers: { "X-User-Id": "1" } }),
      fetch(`${API}/expenses/allocations-summary/${id}`, { headers: { "X-User-Id": "1" } }),
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
      fetch(`${API}/expenses/actions/${expenseId}?portal_role=employee`, { headers: { "X-User-Id": "1" } }),
      fetch(`${API}/expenses/blockers/${expenseId}`, { headers: { "X-User-Id": "1" } }),
    ]).then(async ([ar, br]) => {
      if (ar.ok) { const d = await ar.json(); setEmployeeActions(d?.actions ?? null); }
      if (br.ok) setExpenseBlockers(await br.json());
    }).catch(() => {});
  }, [expenseId, expense?.status]);

  // ── Fetch validations eagerly on expense load ────────────────────────────────
  useEffect(() => {
    if (!expenseId) { setValidations([]); return; }
    setLoadingVals(true);
    fetch(`${API}/expenses/${expenseId}/validations`, { headers: { "X-User-Id": "1" } })
      .then((r) => r.ok ? r.json() : [])
      .then(setValidations)
      .catch(() => setValidations([]))
      .finally(() => setLoadingVals(false));
  }, [expenseId]);

  // ── Save title ─────────────────────────────────────────────────────────────
  const saveTitle = async () => {
    if (!expense || !titleDraft.trim()) { setEditingTitle(false); return; }
    setSavingTitle(true);
    try {
      const r = await fetch(`${API}/expenses/${expense.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "X-User-Id": "1" },
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
        method: "PATCH", headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({ notes }),
      });
      if (r.ok) { const u = await r.json(); setExpense(u); onExpenseUpdated?.(u); }
    } finally { setSavingNotes(false); }
  };

  // ── Delete document ────────────────────────────────────────────────────────
  const deleteDocument = async (docId: number) => {
    setDeletingDocId(docId);
    try {
      const r = await fetch(`${API}/expenses/documents/${docId}`, {
        method: "DELETE", headers: { "X-User-Id": "1" },
      });
      if (r.ok) {
        setConfirmDeleteDocId(null);
        onDocRefreshNeeded();
        // refresh validations (some may reference deleted doc)
        const vr = await fetch(`${API}/expenses/${expenseId}/validations`, { headers: { "X-User-Id": "1" } });
        if (vr.ok) setValidations(await vr.json());
      }
    } finally { setDeletingDocId(null); }
  };

  // ── Save tags ──────────────────────────────────────────────────────────────
  const saveTags = async (newTags: string[]) => {
    if (!expense) return;
    setActiveTags(newTags);
    await fetch(`${API}/expenses/${expense.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "X-User-Id": "1" },
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
        const content = await file.text().catch(() => "");
        const r = await fetch(`${API}/expenses/documents`, {
          method: "POST", headers: { "Content-Type": "application/json", "X-User-Id": "1" },
          body: JSON.stringify({ company_id: 1, expense_id: expenseId, filename: file.name, content_text: content }),
        });
        setUploadQueue((prev) => prev.map((e) => e.localId === localId ? { ...e, status: r.ok ? "done" : "error" } : e));
      } catch {
        setUploadQueue((prev) => prev.map((e) => e.localId === localId ? { ...e, status: "error" } : e));
      }
    }));
    onDocRefreshNeeded();
    const er = await fetch(`${API}/expenses/${expenseId}`, { headers: { "X-User-Id": "1" } });
    if (er.ok) { const u: Expense = await er.json(); setExpense(u); onExpenseUpdated?.(u); }
    const br = await fetch(`${API}/expenses/blockers/${expenseId}`, { headers: { "X-User-Id": "1" } });
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
        method: "PUT", headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({ items }),
      });
      if (!r.ok) { const b = await r.json().catch(() => ({})); setAllocSaveError(b?.detail ?? `Save failed (${r.status}).`); return; }
      await loadAllocations(expenseId);
      const [br, ar] = await Promise.all([
        fetch(`${API}/expenses/blockers/${expenseId}`, { headers: { "X-User-Id": "1" } }),
        fetch(`${API}/expenses/actions/${expenseId}?portal_role=employee`, { headers: { "X-User-Id": "1" } }),
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
      const r = await fetch(`${API}/expenses/${expense.id}`, { method: "DELETE", headers: { "X-User-Id": "1" } });
      if (r.ok) onDeleted?.();
    } catch { /* silent */ } finally { setDeletingDraft(false); }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!expense) return;
    setSubmittingExpense(true); setSubmitError(null);
    try {
      const r = await fetch(`${API}/expenses/review-actions/${expense.id}/submit`, { method: "POST", headers: { "X-User-Id": "1" } });
      if (r.ok) {
        const u = await r.json(); setExpense(u); onExpenseUpdated?.(u);
        const ar = await fetch(`${API}/expenses/actions/${expense.id}?portal_role=employee`, { headers: { "X-User-Id": "1" } });
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
  const policyVals = [...latestByCode.values()].filter((v) => v.rule_code !== "SAT_VALIDATION" && v.rule_code !== "EFOS_CHECK");
  const policyDotStatus: "passed" | "warning" | "failed" | null =
    policyVals.length === 0 ? null
    : policyVals.some((v) => v.status === "failed")  ? "failed"
    : policyVals.some((v) => v.status === "warning") ? "warning"
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
                  {parsedXml && (
                    <button type="button" onClick={() => setShowXmlModal(true)}
                      className="flex items-center gap-1 rounded border border-white/[0.07] px-2 py-0.5 text-[9px] text-white/30 hover:border-white/[0.15] hover:text-white/55">
                      <FileText className="h-2.5 w-2.5" /> XML
                    </button>
                  )}
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
                    {tab === "validations" ? td("validations") : tab === "documents" ? td("documents") : td("overview")}
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
                      <p className="mb-2 text-[11px] font-semibold text-white/70">{td("expenseType")}</p>
                      <select
                        disabled
                        className="w-full cursor-not-allowed rounded border border-white/[0.06] bg-transparent px-2 py-1 text-[10px] text-white/22 outline-none"
                      >
                        <option>{td("pendingCatalogue")}</option>
                      </select>
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
                                    <span className={`inline-flex h-1.5 w-1.5 rounded-full ${p.color === "sky" ? "bg-sky-400/70" : p.color === "indigo" ? "bg-indigo-400/70" : p.color === "emerald" ? "bg-emerald-400/70" : p.color === "amber" ? "bg-amber-400/70" : p.color === "rose" ? "bg-rose-400/70" : p.color === "violet" ? "bg-violet-400/70" : "bg-zinc-500/70"}`} />
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
                        {xmlRequired && !hasXml ? td("uploadXmlCfdi") : pdfPairRequired && hasXml && !hasPdf ? td("uploadPdf") : td("uploadFile")}
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
              const DOCUMENT_RULES   = ["XML_FORMAT", "UUID_PRESENT"];
              const SAT_RULES        = ["SAT_VALIDATION", "EFOS_CHECK"];
              const PLANNED_CHECKS   = [
                { code: "RFC_MATCH",       label: td("plannedChecks.RFC_MATCH") },
                { code: "USO_CFDI",        label: td("plannedChecks.USO_CFDI") },
                { code: "CP_MATCH",        label: td("plannedChecks.CP_MATCH") },
                { code: "DATE_RANGE",      label: td("plannedChecks.DATE_RANGE") },
                { code: "AMOUNT_MATCH",    label: td("plannedChecks.AMOUNT_MATCH") },
                { code: "DUPLICATE_CHECK", label: td("plannedChecks.DUPLICATE_CHECK") },
              ];

              const docResults  = [...latestByCode.values()].filter(v => DOCUMENT_RULES.includes(v.rule_code));
              const satResults  = [...latestByCode.values()].filter(v => SAT_RULES.includes(v.rule_code));
              const policyRes   = [...latestByCode.values()].filter(v => !DOCUMENT_RULES.includes(v.rule_code) && !SAT_RULES.includes(v.rule_code));
              const plannedMissing = PLANNED_CHECKS.filter(p => !latestByCode.has(p.code));

              const fmtTs = (iso: string) => {
                const d = new Date(iso);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
              };

              const ruleLabelMap = { XML_FORMAT: td("ruleLabel.XML_FORMAT"), UUID_PRESENT: td("ruleLabel.UUID_PRESENT"), SAT_VALIDATION: td("ruleLabel.SAT_VALIDATION"), MISSING_PDF: td("ruleLabel.MISSING_PDF"), EFOS_CHECK: td("ruleLabel.EFOS_CHECK"), POLICY_CHECK: td("ruleLabel.POLICY_CHECK"), AMOUNT_MATCH: td("ruleLabel.AMOUNT_MATCH"), DATE_RANGE: td("ruleLabel.DATE_RANGE") };
              const ValRow = ({ v, showTs = false }: { v: ValidationResultRow; showTs?: boolean }) => (
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <div className="mt-0.5 shrink-0">
                    {v.status === "passed"  && <CheckCircle2  className="h-3.5 w-3.5 text-emerald-400/65" />}
                    {v.status === "warning" && <AlertTriangle className="h-3.5 w-3.5 text-amber-400/60"  />}
                    {v.status === "failed"  && <XCircle       className="h-3.5 w-3.5 text-red-400/60"    />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-white/70">{ruleLabel(v.rule_code, ruleLabelMap)}</p>
                    <p className="mt-0.5 text-[10px] text-white/40">{v.message}</p>
                    {showTs && (
                      <p className="mt-1 font-mono text-[9px] text-white/22">Checked: {fmtTs(v.created_at)}</p>
                    )}
                  </div>
                  <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
                    v.status === "passed"  ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-400/70" :
                    v.status === "warning" ? "border-amber-500/20 bg-amber-500/[0.07] text-amber-400/65" :
                    "border-red-500/20 bg-red-500/[0.07] text-red-400/65"
                  }`}>{v.status}</span>
                </div>
              );

              return (
                <div className="space-y-2 pb-20">
                  {loadingVals && <p className="text-[10px] text-white/25">{tc("loading")}</p>}

                  {/* Document integrity */}
                  {docResults.length > 0 && (
                    <div>
                      <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/22">{td("valDocIntegrity")}</p>
                      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                        {docResults.map((v, i) => <div key={v.id} className={i > 0 ? "border-t border-white/[0.05]" : ""}><ValRow v={v} /></div>)}
                      </div>
                    </div>
                  )}

                  {/* SAT Verification */}
                  <div>
                    <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/22">{td("valSatVerification")}</p>
                    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                      {satResults.length === 0 && (
                        <div className="flex items-start gap-2.5 px-3 py-2.5">
                          <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border border-white/[0.12] bg-zinc-800" />
                          <div>
                            <p className="text-[11px] text-white/35">{td("valSatLabel")}</p>
                            <p className="mt-0.5 text-[10px] text-white/22">{td("valSatNotRunHint")}</p>
                          </div>
                        </div>
                      )}
                      {satResults.map((v, i) => (
                        <div key={v.id} className={i > 0 ? "border-t border-white/[0.05]" : ""}>
                          <ValRow v={v} showTs />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Policy & Compliance */}
                  <div>
                    <p className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-widest text-white/22">{td("valPolicyCompliance")}</p>
                    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
                      {policyRes.map((v, i) => (
                        <div key={v.id} className={i > 0 ? "border-t border-white/[0.05]" : ""}><ValRow v={v} /></div>
                      ))}
                      {plannedMissing.map((p, i) => (
                        <div key={p.code} className={`flex items-center gap-2.5 px-3 py-2 ${policyRes.length + i > 0 ? "border-t border-white/[0.05]" : ""}`}>
                          <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/[0.10] bg-zinc-800/60" />
                          <div className="flex-1">
                            <p className="text-[11px] text-white/30">{p.label}</p>
                          </div>
                          <span className="rounded border border-white/[0.07] px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-white/18">pending</span>
                        </div>
                      ))}
                      {policyRes.length === 0 && plannedMissing.length === 0 && (
                        <div className="px-3 py-2.5 text-[10px] text-white/25">{td("valNoPolicyChecks")}</div>
                      )}
                    </div>
                  </div>
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
