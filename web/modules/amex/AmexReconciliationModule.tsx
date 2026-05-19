"use client";

/**
 * AmexReconciliationModule - workspace for matching an American Express
 * monthly statement to CFDI (XML + PDF) invoice pairs.
 *
 * Flow
 * ────
 *   1. Upload CSV  → statement is parsed into line items.
 *   2. Upload CFDIs (XML + PDF) → documents appear in the right pane,
 *      auto-validated by UUID presence.
 *   3. Auto-match → deterministic amount + date matcher fills in obvious pairs.
 *   4. Manual cleanup → click a line, pick a document, or mark "no invoice"
 *      / "factura pendiente". Bulk-assign project / category to many lines.
 *   5. Submit → backend collapses the statement into one Expense + Report
 *      for the normal approval pipeline.
 *
 * The shell lives entirely inside the My Work detail column. Density and
 * typography follow the enterprise tokens in web/CLAUDE.md (amber focus,
 * emerald for matched, zinc neutrals).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  FileText,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { useUserContext } from "@/context/UserContext";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";

// ── Types ─────────────────────────────────────────────────────────────────────

type LineStatus = "unmatched" | "matched" | "no_invoice" | "missing";

interface Statement {
  id: number;
  company_id: number;
  filename: string;
  period_start: string | null;
  period_end: string | null;
  card_last4: string | null;
  currency: string;
  total_amount: string;
  line_count: number;
  status: string;
  submitted_at: string | null;
  expense_id: number | null;
  matched_count: number;
  no_invoice_count: number;
  missing_count: number;
  unmatched_count: number;
  document_count: number;
  created_at: string;
}

interface Line {
  id: number;
  statement_id: number;
  line_no: number;
  posted_date: string | null;
  description: string;
  merchant: string | null;
  amount: string;
  currency: string;
  reference: string | null;
  project_id: number | null;
  cost_center_id: number | null;
  category_code: string | null;
  notes: string | null;
  matched_document_id: number | null;
  match_confidence: string;
  status: LineStatus;
}

interface CfdiDoc {
  id: number;
  statement_id: number;
  xml_filename: string | null;
  pdf_filename: string | null;
  uuid: string | null;
  emisor_rfc: string | null;
  emisor_name: string | null;
  receptor_rfc: string | null;
  total: string | null;
  invoice_date: string | null;
  sat_status: string | null;
  validation_status: string;
  validation_error: string | null;
  matched_line_id: number | null;
  created_at: string;
}

interface StatementDetail {
  statement: Statement;
  lines: Line[];
  documents: CfdiDoc[];
}

interface Project {
  id: number;
  name: string;
  code: string | null;
}

interface Category {
  id: number;
  code: string;
  name: string;
}

// ── Module ────────────────────────────────────────────────────────────────────

export default function AmexReconciliationModule() {
  const { companyId: ctxCompanyId } = useUserContext();
  const companyId = ctxCompanyId ?? 1;
  const t = useTranslations();
  const maybeT = (key: string, fallback: string) => {
    try {
      return t(key);
    } catch {
      return fallback;
    }
  };

  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<StatementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  // Selection + filter for the line table
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const [filter, setFilter] = useState<"all" | LineStatus>("all");

  const csvInputRef = useRef<HTMLInputElement>(null);
  const docsInputRef = useRef<HTMLInputElement>(null);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const loadStatements = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall<Statement[]>(`/amex/${companyId}/statements`);
      setStatements(data);
      if (selectedId === null && data.length > 0) setSelectedId(data[0].id);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setLoading(false);
    }
  }, [companyId, selectedId]);

  const loadDetail = useCallback(
    async (id: number) => {
      try {
        const data = await apiCall<StatementDetail>(`/amex/${companyId}/statements/${id}`);
        setDetail(data);
      } catch (e) {
        setError(humanError(e));
      }
    },
    [companyId],
  );

  const loadAux = useCallback(async () => {
    try {
      const [pr, cg] = await Promise.all([
        apiCall<Project[]>(`/projects/?company_id=${companyId}`).catch(() => []),
        apiCall<Category[] | { items: Category[] }>(`/admin/accounting-categories/${companyId}`).catch(() => []),
      ]);
      setProjects(Array.isArray(pr) ? pr : []);
      setCategories(Array.isArray(cg) ? cg : Array.isArray((cg as { items?: Category[] })?.items) ? (cg as { items: Category[] }).items : []);
    } catch {
      // Silent - aux data is not critical
    }
  }, [companyId]);

  useEffect(() => {
    loadStatements();
    loadAux();
  }, [loadStatements, loadAux]);

  useEffect(() => {
    if (selectedId !== null) {
      loadDetail(selectedId);
      setSelectedLines(new Set());
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const uploadCsv = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const created = await apiCall<Statement>(`/amex/${companyId}/statements`, {
        method: "POST",
        body: fd,
      });
      await loadStatements();
      setSelectedId(created.id);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const uploadDocs = async (files: FileList) => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("files", f));
      await apiCall(`/amex/${companyId}/statements/${selectedId}/documents`, {
        method: "POST",
        body: fd,
      });
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const autoMatch = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/amex/${companyId}/statements/${selectedId}/auto-match`);
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const manualMatch = async (lineId: number, documentId: number) => {
    if (!selectedId) return;
    try {
      await apiPost(`/amex/${companyId}/statements/${selectedId}/lines/${lineId}/match`, {
        document_id: documentId,
      });
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    }
  };

  const unmatch = async (lineId: number) => {
    if (!selectedId) return;
    try {
      await apiPost(`/amex/${companyId}/statements/${selectedId}/lines/${lineId}/unmatch`);
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    }
  };

  const patchLine = async (lineId: number, patch: Partial<Line>) => {
    if (!selectedId) return;
    try {
      await apiPatch(`/amex/${companyId}/statements/${selectedId}/lines/${lineId}`, patch);
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    }
  };

  const bulkAssign = async (fields: Partial<Line>) => {
    if (!selectedId || selectedLines.size === 0) return;
    try {
      await apiPost(`/amex/${companyId}/statements/${selectedId}/lines/bulk-assign`, {
        line_ids: Array.from(selectedLines),
        ...fields,
      });
      setSelectedLines(new Set());
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    }
  };

  const submit = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/amex/${companyId}/statements/${selectedId}/submit`);
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteDocument = async (docId: number) => {
    if (!selectedId) return;
    try {
      await apiDelete(`/amex/${companyId}/statements/${selectedId}/documents/${docId}`);
      await loadDetail(selectedId);
      await loadStatements();
    } catch (e) {
      setError(humanError(e));
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (statements.length === 0) {
    return (
      <EmptyState
        onPickCsv={() => csvInputRef.current?.click()}
        busy={busy}
        error={error}
      >
        <input
          ref={csvInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadCsv(f);
            e.target.value = "";
          }}
        />
      </EmptyState>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-0 text-secondary">
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadCsv(f);
          e.target.value = "";
        }}
      />
      <input
        ref={docsInputRef}
        type="file"
        accept=".xml,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) uploadDocs(e.target.files);
          e.target.value = "";
        }}
      />

      {/* ── Statements strip ─────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-subtle bg-surface-1 px-4 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted">
          <CreditCard className="h-3.5 w-3.5" />
          {maybeT("amex.statements", "Estados de cuenta")}
        </div>
        <div className="ml-2 flex items-center gap-1.5">
          {statements.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`flex shrink-0 items-center gap-2 rounded border px-3 py-1.5 text-xs transition ${
                s.id === selectedId
                  ? "border-amber-500/40 bg-warning-muted text-warning"
                  : "border-subtle bg-surface-1 text-secondary hover:border-default hover:text-secondary"
              }`}
            >
              <span className="font-mono text-[10px] opacity-60">#{s.id}</span>
              <span className="truncate max-w-[10rem]">{s.filename}</span>
              {s.card_last4 && (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">
                  •{s.card_last4}
                </span>
              )}
              <StatusDot status={s.status} />
            </button>
          ))}
        </div>
        <button
          onClick={() => csvInputRef.current?.click()}
          disabled={busy}
          className="ml-auto flex shrink-0 items-center gap-1.5 rounded border border-default bg-surface-2 px-3 py-1.5 text-xs font-medium text-secondary transition hover:border-warning hover:bg-warning-muted hover:text-warning disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          {maybeT("amex.uploadCsv", "Nuevo estado de cuenta (CSV)")}
        </button>
      </div>

      {error && (
        <div className="flex shrink-0 items-center gap-2 border-b border-rose-900/40 bg-rose-950/40 px-4 py-2 text-xs text-rose-200">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto rounded p-0.5 hover:bg-rose-900/40"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {detail && (
        <StatementDetailView
          detail={detail}
          busy={busy}
          projects={projects}
          categories={categories}
          selectedLines={selectedLines}
          onToggleLine={(id) => {
            setSelectedLines((prev) => {
              const n = new Set(prev);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            });
          }}
          onSelectAll={(ids) => setSelectedLines(new Set(ids))}
          onClearSelection={() => setSelectedLines(new Set())}
          filter={filter}
          onFilter={setFilter}
          onOpenDocsPicker={() => docsInputRef.current?.click()}
          onAutoMatch={autoMatch}
          onManualMatch={manualMatch}
          onUnmatch={unmatch}
          onPatchLine={patchLine}
          onBulkAssign={bulkAssign}
          onSubmit={submit}
          onDeleteDoc={deleteDocument}
          t={maybeT}
        />
      )}
    </div>
  );
}

// ── Detail view ───────────────────────────────────────────────────────────────

interface DetailProps {
  detail: StatementDetail;
  busy: boolean;
  projects: Project[];
  categories: Category[];
  selectedLines: Set<number>;
  onToggleLine: (id: number) => void;
  onSelectAll: (ids: number[]) => void;
  onClearSelection: () => void;
  filter: "all" | LineStatus;
  onFilter: (f: "all" | LineStatus) => void;
  onOpenDocsPicker: () => void;
  onAutoMatch: () => void;
  onManualMatch: (lineId: number, docId: number) => void;
  onUnmatch: (lineId: number) => void;
  onPatchLine: (lineId: number, patch: Partial<Line>) => void;
  onBulkAssign: (fields: Partial<Line>) => void;
  onSubmit: () => void;
  onDeleteDoc: (docId: number) => void;
  t: (key: string, fallback: string) => string;
}

function StatementDetailView(props: DetailProps) {
  const {
    detail,
    busy,
    projects,
    categories,
    selectedLines,
    onToggleLine,
    onSelectAll,
    onClearSelection,
    filter,
    onFilter,
    onOpenDocsPicker,
    onAutoMatch,
    onManualMatch,
    onUnmatch,
    onPatchLine,
    onBulkAssign,
    onSubmit,
    onDeleteDoc,
    t,
  } = props;
  const s = detail.statement;
  const isDraft = s.status === "draft";
  const canSubmit =
    isDraft && s.unmatched_count === 0 && s.missing_count === 0;

  const filteredLines = useMemo(
    () =>
      filter === "all"
        ? detail.lines
        : detail.lines.filter((l) => l.status === filter),
    [detail.lines, filter],
  );

  const unmatchedDocs = useMemo(
    () => detail.documents.filter((d) => d.matched_line_id === null),
    [detail.documents],
  );

  return (
    <>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-subtle bg-surface-1 px-4 py-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-2 text-xs font-medium text-secondary">
            <span className="truncate">{s.filename}</span>
            <StatusBadge status={s.status} />
          </div>
          <div className="flex items-baseline gap-3 text-secondary">
            <span className="font-mono text-2xl font-semibold tabular-nums">
              {fmtMoney(s.total_amount, s.currency)}
            </span>
            <span className="text-xs text-muted">
              {s.line_count} {t("amex.charges", "cargos")}
              {s.period_start && s.period_end
                ? ` · ${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`
                : ""}
              {s.card_last4 ? ` · Amex •${s.card_last4}` : ""}
            </span>
          </div>
        </div>

        {/* Progress pills */}
        <div className="ml-auto flex items-center gap-1.5">
          <ProgressPill
            label={t("amex.matched", "Conciliados")}
            count={s.matched_count}
            total={s.line_count}
            tone="emerald"
            active={filter === "matched"}
            onClick={() => onFilter(filter === "matched" ? "all" : "matched")}
          />
          <ProgressPill
            label={t("amex.unmatched", "Pendientes")}
            count={s.unmatched_count}
            total={s.line_count}
            tone="amber"
            active={filter === "unmatched"}
            onClick={() => onFilter(filter === "unmatched" ? "all" : "unmatched")}
          />
          <ProgressPill
            label={t("amex.noInvoice", "Sin factura")}
            count={s.no_invoice_count}
            total={s.line_count}
            tone="zinc"
            active={filter === "no_invoice"}
            onClick={() => onFilter(filter === "no_invoice" ? "all" : "no_invoice")}
          />
          <ProgressPill
            label={t("amex.missing", "Factura pendiente")}
            count={s.missing_count}
            total={s.line_count}
            tone="rose"
            active={filter === "missing"}
            onClick={() => onFilter(filter === "missing" ? "all" : "missing")}
          />
        </div>

        <button
          onClick={onSubmit}
          disabled={!canSubmit || busy}
          title={
            !canSubmit && isDraft
              ? t("amex.submitBlockedHint", "Resuelve todas las líneas para poder enviar")
              : undefined
          }
          className="flex shrink-0 items-center gap-1.5 rounded border border-success bg-success-muted px-3 py-1.5 text-xs font-semibold text-success transition hover:border-success hover:bg-success-muted disabled:cursor-not-allowed disabled:border-default disabled:bg-surface-2 disabled:text-muted"
        >
          <Send className="h-3.5 w-3.5" />
          {isDraft
            ? t("amex.submit", "Enviar para aprobación")
            : t("amex.submitted", "Enviado")}
        </button>
      </div>

      {/* ── Main split ──────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Lines pane */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-subtle">
          <div className="flex shrink-0 items-center gap-2 border-b border-subtle bg-surface-1 px-3 py-2">
            {selectedLines.size > 0 ? (
              <BulkBar
                count={selectedLines.size}
                projects={projects}
                categories={categories}
                onBulkAssign={onBulkAssign}
                onClear={onClearSelection}
                t={t}
              />
            ) : (
              <>
                <button
                  onClick={onAutoMatch}
                  disabled={busy || !isDraft}
                  className="flex items-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-2.5 py-1 text-[11px] font-medium text-accent transition hover:border-indigo-500/70 hover:bg-accent-muted disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Wand2 className="h-3 w-3" />
                  )}
                  {t("amex.autoMatch", "Conciliar automáticamente")}
                </button>
                <span className="text-[11px] text-muted">
                  {filteredLines.length}/{detail.lines.length}{" "}
                  {t("amex.shown", "visibles")}
                </span>
              </>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead className="sticky top-0 z-10 bg-surface-1/80 backdrop-blur-[2px]">
                <tr className="text-left text-[10px] font-medium uppercase tracking-wider text-muted">
                  <th className="w-8 border-b border-subtle px-2 py-2">
                    <input
                      type="checkbox"
                      checked={
                        filteredLines.length > 0 &&
                        filteredLines.every((l) => selectedLines.has(l.id))
                      }
                      onChange={(e) =>
                        e.target.checked
                          ? onSelectAll(filteredLines.map((l) => l.id))
                          : onClearSelection()
                      }
                      className="h-3.5 w-3.5 accent-amber-500"
                    />
                  </th>
                  <th className="border-b border-subtle px-2 py-2">
                    {t("amex.date", "Fecha")}
                  </th>
                  <th className="border-b border-subtle px-2 py-2">
                    {t("amex.merchant", "Comercio")}
                  </th>
                  <th className="border-b border-subtle px-2 py-2 text-right">
                    {t("amex.amount", "Importe")}
                  </th>
                  <th className="border-b border-subtle px-2 py-2">
                    {t("amex.project", "Proyecto")}
                  </th>
                  <th className="border-b border-subtle px-2 py-2">
                    {t("amex.category", "Categoría")}
                  </th>
                  <th className="border-b border-subtle px-2 py-2">
                    {t("amex.invoice", "Factura")}
                  </th>
                  <th className="w-6 border-b border-subtle px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredLines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    doc={detail.documents.find((d) => d.id === line.matched_document_id)}
                    unmatchedDocs={unmatchedDocs}
                    projects={projects}
                    categories={categories}
                    selected={selectedLines.has(line.id)}
                    disabled={!isDraft}
                    onToggle={() => onToggleLine(line.id)}
                    onManualMatch={(docId) => onManualMatch(line.id, docId)}
                    onUnmatch={() => onUnmatch(line.id)}
                    onPatch={(p) => onPatchLine(line.id, p)}
                    t={t}
                  />
                ))}
                {filteredLines.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-xs text-muted">
                      {t("amex.noLinesInFilter", "No hay cargos con este filtro.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Docs pane */}
        <div className="flex w-[24rem] shrink-0 flex-col bg-surface-0">
          <div className="flex shrink-0 items-center justify-between border-b border-subtle bg-surface-1 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-secondary">
              <FileText className="h-3 w-3" />
              {t("amex.cfdiPool", "Facturas (XML + PDF)")}
              <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-tertiary">
                {unmatchedDocs.length}/{detail.documents.length}
              </span>
            </div>
            <button
              onClick={onOpenDocsPicker}
              disabled={busy || !isDraft}
              className="flex items-center gap-1 rounded border border-amber-500/40 bg-warning-muted px-2 py-1 text-[10px] font-medium text-warning hover:bg-warning-muted disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              {t("amex.upload", "Subir")}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {detail.documents.length === 0 ? (
              <div
                onClick={onOpenDocsPicker}
                className="flex h-full min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded border border-dashed border-default p-4 text-center text-xs text-muted transition hover:border-warning hover:text-warning"
              >
                <Upload className="mb-2 h-5 w-5" />
                <div className="font-medium">
                  {t("amex.dropCfdi", "Suelta los XMLs + PDFs aquí")}
                </div>
                <div className="mt-1 text-[10px] text-muted">
                  {t(
                    "amex.dropCfdiHint",
                    "Las facturas se validan y se emparejan por monto y fecha.",
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {detail.documents.map((d) => (
                  <DocCard
                    key={d.id}
                    doc={d}
                    disabled={!isDraft}
                    onDelete={() => onDeleteDoc(d.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Line row ──────────────────────────────────────────────────────────────────

interface LineRowProps {
  line: Line;
  doc: CfdiDoc | undefined;
  unmatchedDocs: CfdiDoc[];
  projects: Project[];
  categories: Category[];
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onManualMatch: (docId: number) => void;
  onUnmatch: () => void;
  onPatch: (p: Partial<Line>) => void;
  t: (key: string, fallback: string) => string;
}

function LineRow(props: LineRowProps) {
  const {
    line,
    doc,
    unmatchedDocs,
    projects,
    categories,
    selected,
    disabled,
    onToggle,
    onManualMatch,
    onUnmatch,
    onPatch,
    t,
  } = props;

  return (
    <tr
      className={`border-b border-subtle/60 transition ${
        selected ? "bg-amber-500/5" : "hover:bg-surface-1"
      } ${line.status === "matched" ? "" : ""}`}
    >
      <td className="px-2 py-1.5 align-middle">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-3.5 w-3.5 accent-amber-500"
        />
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-[11px] text-secondary tabular-nums">
        {line.posted_date ? fmtDate(line.posted_date) : " - "}
      </td>
      <td className="max-w-[16rem] truncate px-2 py-1.5 text-secondary" title={line.description}>
        <div className="flex items-center gap-2">
          <LineStatusDot status={line.status} />
          <span className="truncate">{line.merchant ?? line.description}</span>
        </div>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-secondary tabular-nums">
        {fmtMoney(line.amount, line.currency)}
      </td>
      <td className="px-2 py-1.5">
        <select
          value={line.project_id ?? ""}
          disabled={disabled}
          onChange={(e) =>
            onPatch({ project_id: e.target.value ? Number(e.target.value) : null })
          }
          className="w-full rounded border border-subtle bg-surface-1 px-1.5 py-1 text-[11px] text-secondary focus:border-amber-500/50 focus:outline-none disabled:opacity-50"
        >
          <option value=""> - </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code ? `${p.code} · ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        <select
          value={line.category_code ?? ""}
          disabled={disabled}
          onChange={(e) => onPatch({ category_code: e.target.value || null })}
          className="w-full rounded border border-subtle bg-surface-1 px-1.5 py-1 text-[11px] text-secondary focus:border-amber-500/50 focus:outline-none disabled:opacity-50"
        >
          <option value=""> - </option>
          {categories.map((c) => (
            <option key={c.id} value={c.code}>
              {c.code} · {c.name}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1.5">
        {line.status === "matched" && doc ? (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-success" />
            <span className="truncate text-[11px] text-tertiary" title={doc.emisor_name ?? ""}>
              {doc.emisor_name ?? doc.emisor_rfc ?? doc.uuid?.slice(0, 8)}
            </span>
            <button
              onClick={onUnmatch}
              disabled={disabled}
              className="ml-1 rounded px-1 text-[10px] text-muted hover:bg-surface-2 hover:text-rose-300 disabled:opacity-50"
              title={t("amex.unmatch", "Desvincular")}
            >
              ×
            </button>
          </div>
        ) : (
          <select
            value=""
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "no_invoice") onPatch({ status: "no_invoice" });
              else if (v === "missing") onPatch({ status: "missing" });
              else if (v === "unmatched") onPatch({ status: "unmatched" });
              else if (v) onManualMatch(Number(v));
            }}
            className={`w-full rounded border bg-surface-1 px-1.5 py-1 text-[11px] focus:outline-none disabled:opacity-50 ${
              line.status === "missing"
                ? "border-rose-500/40 text-rose-200"
                : line.status === "no_invoice"
                  ? "border-default text-secondary"
                  : "border-amber-500/30 text-warning"
            }`}
          >
            <option value="">
              {line.status === "missing"
                ? t("amex.missingShort", " -  factura pendiente  - ")
                : line.status === "no_invoice"
                  ? t("amex.noInvoiceShort", " -  sin factura  - ")
                  : t("amex.chooseInvoice", " -  emparejar  - ")}
            </option>
            {unmatchedDocs.length > 0 && (
              <optgroup label={t("amex.availableCfdi", "Facturas disponibles")}>
                {unmatchedDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {fmtMoney(d.total ?? "0", "MXN")} ·{" "}
                    {d.emisor_name ?? d.emisor_rfc ?? d.uuid?.slice(0, 8) ?? "?"}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label={t("amex.markAs", "Marcar como…")}>
              <option value="no_invoice">
                {t("amex.markNoInvoice", "Sin factura (efectivo / no requerida)")}
              </option>
              <option value="missing">
                {t("amex.markMissing", "Factura pendiente")}
              </option>
              {line.status !== "unmatched" && (
                <option value="unmatched">
                  {t("amex.markUnmatched", "Volver a pendiente")}
                </option>
              )}
            </optgroup>
          </select>
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        {line.match_confidence !== "none" && (
          <span
            className="inline-block rounded bg-surface-2 px-1 py-0.5 font-mono text-[9px] uppercase text-secondary"
            title={`match: ${line.match_confidence}`}
          >
            {line.match_confidence === "manual" ? "M" : "A"}
          </span>
        )}
      </td>
    </tr>
  );
}

// ── Bulk toolbar ──────────────────────────────────────────────────────────────

interface BulkBarProps {
  count: number;
  projects: Project[];
  categories: Category[];
  onBulkAssign: (fields: Partial<Line>) => void;
  onClear: () => void;
  t: (key: string, fallback: string) => string;
}

function BulkBar({ count, projects, categories, onBulkAssign, onClear, t }: BulkBarProps) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <span className="rounded border border-amber-500/40 bg-warning-muted px-2 py-0.5 text-[11px] font-semibold text-warning">
        {count} {t("amex.selected", "seleccionados")}
      </span>
      <select
        onChange={(e) => {
          if (e.target.value) {
            onBulkAssign({ project_id: Number(e.target.value) });
            e.target.value = "";
          }
        }}
        className="rounded border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-secondary"
      >
        <option value="">{t("amex.bulkProject", "Asignar proyecto…")}</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.code ? `${p.code} · ` : ""}{p.name}
          </option>
        ))}
      </select>
      <select
        onChange={(e) => {
          if (e.target.value) {
            onBulkAssign({ category_code: e.target.value });
            e.target.value = "";
          }
        }}
        className="rounded border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-secondary"
      >
        <option value="">{t("amex.bulkCategory", "Asignar categoría…")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.code}>
            {c.code} · {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onBulkAssign({ status: "no_invoice" })}
        className="rounded border border-default bg-surface-2 px-2 py-1 text-[11px] text-tertiary hover:bg-surface-3"
      >
        {t("amex.bulkNoInvoice", "Marcar sin factura")}
      </button>
      <button
        onClick={onClear}
        className="ml-auto rounded px-1.5 py-0.5 text-[11px] text-muted hover:bg-surface-2 hover:text-secondary"
      >
        {t("amex.clear", "Limpiar")}
      </button>
    </div>
  );
}

// ── Document card ─────────────────────────────────────────────────────────────

function DocCard({
  doc,
  disabled,
  onDelete,
}: {
  doc: CfdiDoc;
  disabled: boolean;
  onDelete: () => void;
}) {
  const isMatched = doc.matched_line_id !== null;
  const isInvalid = doc.validation_status === "invalid";
  return (
    <div
      className={`group rounded border p-2 text-[11px] transition ${
        isMatched
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isInvalid
            ? "border-error bg-rose-500/5"
            : "border-subtle bg-surface-1/50 hover:border-default"
      }`}
    >
      <div className="flex items-start gap-1.5">
        <div className="mt-0.5 flex flex-col items-center gap-0.5">
          {doc.xml_filename && (
            <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[9px] text-tertiary">XML</span>
          )}
          {doc.pdf_filename && (
            <span className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[9px] text-tertiary">PDF</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-secondary">
            {doc.emisor_name ?? doc.emisor_rfc ?? " - "}
          </div>
          <div className="flex items-center gap-2 text-muted">
            <span className="font-mono tabular-nums">
              {doc.total ? fmtMoney(doc.total, "MXN") : " - "}
            </span>
            <span>·</span>
            <span>{doc.invoice_date ? fmtDate(doc.invoice_date) : " - "}</span>
          </div>
          {doc.uuid && (
            <div className="truncate font-mono text-[9px] text-muted" title={doc.uuid}>
              {doc.uuid}
            </div>
          )}
          {isMatched && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-300">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Asignado al cargo #{doc.matched_line_id}
            </div>
          )}
          {isInvalid && (
            <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-300">
              <AlertTriangle className="h-2.5 w-2.5" />
              {doc.validation_error ?? "Invalid XML"}
            </div>
          )}
        </div>
        <button
          onClick={onDelete}
          disabled={disabled}
          className="opacity-0 transition group-hover:opacity-100 text-muted hover:text-rose-300 disabled:opacity-0"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  onPickCsv,
  busy,
  error,
  children,
}: {
  onPickCsv: () => void;
  busy: boolean;
  error: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-surface-0 p-8 text-center">
      {children}
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-500/30 bg-warning-muted text-warning">
        <CreditCard className="h-6 w-6" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-primary">
          Conciliación Amex
        </h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">
          Sube el estado de cuenta mensual en CSV. Luego podrás subir los XMLs
          y PDFs que correspondan a cada cargo y conciliarlos uno por uno o en
          lote.
        </p>
      </div>
      <button
        onClick={onPickCsv}
        disabled={busy}
        className="flex items-center gap-2 rounded border border-amber-500/40 bg-warning-muted px-4 py-2 text-sm font-medium text-warning transition hover:border-amber-500/70 hover:bg-warning-muted disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Subir estado de cuenta (CSV)
      </button>
      {error && (
        <div className="mt-2 rounded border border-rose-500/40 bg-error-muted px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Small visual atoms ────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-surface-2",
    submitted: "bg-amber-400",
    manager_approved: "bg-sky-400",
    approved: "bg-emerald-400",
    rejected: "bg-rose-500",
  };
  return <span className={`h-1.5 w-1.5 rounded-full ${map[status] ?? "bg-surface-2"}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    draft: "Borrador",
    submitted: "Enviado",
    manager_approved: "Aprobado (Manager)",
    approved: "Aprobado",
    rejected: "Rechazado",
  };
  return (
    <span className="flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] uppercase text-tertiary">
      <StatusDot status={status} />
      {label[status] ?? status}
    </span>
  );
}

function LineStatusDot({ status }: { status: LineStatus }) {
  const map: Record<LineStatus, string> = {
    matched: "bg-emerald-400",
    unmatched: "bg-amber-400",
    no_invoice: "bg-surface-2",
    missing: "bg-rose-500",
  };
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${map[status]}`} />;
}

function ProgressPill({
  label,
  count,
  total,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  total: number;
  tone: "emerald" | "amber" | "zinc" | "rose";
  active: boolean;
  onClick: () => void;
}) {
  const tones: Record<string, string> = {
    emerald: active
      ? "border-emerald-500/60 bg-success-muted text-emerald-100"
      : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300 hover:bg-success-muted",
    amber: active
      ? "border-amber-500/60 bg-warning-muted text-amber-100"
      : "border-amber-500/20 bg-amber-500/5 text-warning hover:bg-warning-muted",
    zinc: active
      ? "border-default bg-surface-3 text-primary"
      : "border-default bg-surface-2/40 text-secondary hover:bg-surface-2",
    rose: active
      ? "border-rose-500/60 bg-error-muted text-rose-100"
      : "border-rose-500/20 bg-rose-500/5 text-rose-300 hover:bg-error-muted",
  };
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <button
      onClick={onClick}
      className={`flex min-w-[5rem] items-center gap-2 rounded border px-2.5 py-1 text-left transition ${tones[tone]}`}
    >
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] font-medium uppercase tracking-wider opacity-80">
          {label}
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums">
          {count}
          <span className="text-[10px] opacity-60">/{total}</span>
        </span>
      </span>
      <span className="ml-auto font-mono text-[9px] opacity-70">{pct}%</span>
    </button>
  );
}

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtMoney(amount: string | number, currency: string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return " - ";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
    return d.toLocaleDateString("es-MX", { month: "short", day: "2-digit", year: "numeric" });
  } catch {
    return iso;
  }
}

function humanError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
