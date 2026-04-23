"use client";

/**
 * MyExpensesModule — workspace component for the "My Expenses" module.
 *
 * Renders a two-panel layout (list + upload  |  policy strip + detail)
 * that fills the full detail column provided by AppShell (detailFlush mode).
 *
 * All config is read from MyWorkContext so no employee-specific page
 * assumptions leak in.  The selection is kept in local state and broadcast
 * to context so MyWorkAssistant can react to it.
 *
 * Canonical expense draft state — including linked documents, parsed XML
 * data, and SAT validation status — is owned here.  EmployeeExpenseDetail
 * receives it as props and fires onDocRefreshNeeded to trigger a reload.
 */

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLayoutMode } from "@/hooks/useLayoutMode";
import EmployeeExpenseList from "@/components/employee/EmployeeExpenseList";
import EmployeeExpenseDetail from "@/components/employee/EmployeeExpenseDetail";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useUserContext } from "@/context/UserContext";
import { getAuthHeaders } from "@/lib/session";
import { MODULE_IDS, deriveExpenseDecision } from "@/lib/my-work/expenseDecision";
import {
  type ExtractedData,
  type ExpenseDocument,
  parseXmlExtracted,
  SUBMISSION_TYPES,
} from "@/lib/expenses/xmlExtract";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: number;
  description: string;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  report_id: number | null;
  created_at: string;
  expense_date?: string | null;
}

/**
 * Canonical expense draft state — the single source of truth for the
 * selected expense, its linked documents, and all derived XML / SAT data.
 * Owned by MyExpensesModule; passed down to EmployeeExpenseDetail as props.
 */
interface ExpenseDraftState {
  expenseId:   number;
  expenseDate: string | null;
  amount:      number;
  description: string;
  status:      string;
  linkedDocs:  ExpenseDocument[];
  loadingDocs: boolean;
  hasXml:      boolean;
  hasPdf:      boolean;
  parsedXml:   ExtractedData | null;
  satStatus:   "valid" | "warning" | "error" | null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MyExpensesModule() {
  const { effectiveConfig, setSelectedItem, clearSelectedItem } = useMyWorkContext();
  const { userIdStr, companyId } = useUserContext();
  const te = useTranslations("employee");
  const tc = useTranslations("common");

  // ── Local state ────────────────────────────────────────────────────────────
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [selected, setSelected]     = useState<Expense | null>(null);
  const [loading, setLoading]       = useState(true);
  const [uploading, setUploading]   = useState(false);
  const [dragOver, setDragOver]     = useState(false);
  const [draftState, setDraftState] = useState<ExpenseDraftState | null>(null);

  // ── Simple-expense (document-free) form state ─────────────────────────────
  const [showSimpleForm, setShowSimpleForm] = useState(false);
  const [simpleDesc, setSimpleDesc]         = useState("");
  const [simpleAmount, setSimpleAmount]     = useState("");
  const [simpleDate, setSimpleDate]         = useState(() => new Date().toISOString().substring(0, 10));
  const [simpleSubmitting, setSimpleSubmitting] = useState(false);
  const [simpleError, setSimpleError]       = useState<string | null>(null);

  // Keep a ref to the current selection so loadExpenses can read it without
  // being re-created every time `selected` changes.
  const selectedRef = useRef<Expense | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Responsive layout ──────────────────────────────────────────────────────────────
  // Breakpoint and pane visibility are centralised via useLayoutMode.
  // activeMobilePane derives from selected: "detail" when an expense is
  // selected, "list" otherwise.  On tablet/desktop both panes are visible.
  const { isMobile, moduleIsNarrow, activeMobilePane } = useLayoutMode({
    hasDetail: selected !== null,
  });

  // ── Selection sync ─────────────────────────────────────────────────────────
  // Every selection change updates local state AND broadcasts to MyWorkContext
  // so MyWorkAssistant and other portal components see the current item.

  const selectExpense = useCallback((exp: Expense | null) => {
    selectedRef.current = exp;
    setSelected(exp);
    if (!exp) {
      setDraftState(null);
      clearSelectedItem();
    } else {
      // Broadcast basic fields immediately so Copilot has something to show
      // while loadDraftDocs fetches document state.
      // IMPORTANT: merge into existing extra rather than replacing it so that
      // any already-loaded doc state (has_xml, sat_status, etc.) is preserved
      // when this is called with the same expense id (e.g. after a list refresh).
      setSelectedItem((prev) => ({
        expenseId: exp.id,
        extra: {
          // Keep prior doc state only when the expense id hasn't changed.
          ...(prev?.expenseId === exp.id ? (prev?.extra ?? {}) : {}),
          status:            exp.status,
          detected_category: exp.detected_category,
          account_code:      exp.account_code,
          description:       exp.description,
        },
      }));
    }
  }, [setSelectedItem, clearSelectedItem]);

  // ── Canonical draft state loader ──────────────────────────────────────────
  // Fetches linked documents + full expense in parallel.  Parses XML and
  // SAT validation results.  Updates draftState (the single source of truth
  // for doc completeness / parsed XML) and re-broadcasts to context so
  // the Copilot assistant and deriveExpenseDecision see the full picture.
  const loadDraftDocs = useCallback(async (expenseId: number) => {
    const headers = { ...getAuthHeaders() };

    // Mark loading — seed a stub if this is a new selection.
    setDraftState((prev) =>
      prev?.expenseId === expenseId
        ? { ...prev, loadingDocs: true }
        : {
            expenseId,
            expenseDate: null,
            amount:      selectedRef.current?.amount      ?? 0,
            description: selectedRef.current?.description ?? "",
            status:      selectedRef.current?.status      ?? "",
            linkedDocs:  [],
            loadingDocs: true,
            hasXml:      false,
            hasPdf:      false,
            parsedXml:   null,
            satStatus:   null,
          },
    );

    try {
      const [docsRes, expRes] = await Promise.all([
        fetch(`${API}/expenses/documents/by-expense/${expenseId}`, { headers }),
        fetch(`${API}/expenses/${expenseId}`, { headers }),
      ]);

      const docs: ExpenseDocument[] = docsRes.ok ? await docsRes.json() : [];
      const expense: Expense | null  = expRes.ok  ? await expRes.json()  : null;

      let parsedXml: ExtractedData | null = null;
      let satStatus: "valid" | "warning" | "error" | null = null;

      const xmlDoc = docs.find((d) => d.document_type === "cfdi_xml");
      if (xmlDoc) {
        const [docRes, valRes] = await Promise.all([
          fetch(`${API}/expenses/documents/${xmlDoc.id}`, { headers }),
          fetch(`${API}/expenses/documents/${xmlDoc.id}/validation-results`, { headers }),
        ]);
        if (docRes.ok) {
          const docData = await docRes.json();
          if (typeof docData.content_text === "string") {
            parsedXml = parseXmlExtracted(docData.content_text) ?? null;
          }
        }
        // Trigger re-validation so stored results reflect live SAT SOAP.
        fetch(`${API}/expenses/documents/${xmlDoc.id}/validate`, { method: "POST", headers }).catch(() => {});
        if (valRes.ok) {
          const vals: Array<{ rule_code: string; status: string }> = await valRes.json();
          // Only SAT_VALIDATION drives satStatus — other rules (e.g. MISSING_PDF) are separate concerns.
          const satRule = vals.find((v) => v.rule_code === "SAT_VALIDATION");
          if (satRule) {
            satStatus = satRule.status === "failed" ? "error" : satRule.status === "warning" ? "warning" : "valid";
          } else {
            // No stored SAT result yet — default to valid if XML parsed OK.
            satStatus = parsedXml ? "valid" : null;
          }
        }
      }

      const submDocs = docs.filter((d) => !d.document_type || SUBMISSION_TYPES.has(d.document_type));
      const hasXml   = submDocs.some((d) => d.document_type === "cfdi_xml");
      const hasPdf   = submDocs.some((d) =>
        ["cfdi_pdf", "pdf", "pdf_unclassified"].includes(d.document_type ?? ""),
      );

      const newState: ExpenseDraftState = {
        expenseId,
        expenseDate: expense?.expense_date ?? null,
        amount:      expense?.amount      ?? selectedRef.current?.amount      ?? 0,
        description: expense?.description ?? selectedRef.current?.description ?? "",
        status:      expense?.status      ?? selectedRef.current?.status      ?? "",
        linkedDocs:  docs,
        loadingDocs: false,
        hasXml,
        hasPdf,
        parsedXml,
        satStatus,
      };

      // Only commit if the expense is still selected (guard against races).
      setDraftState((prev) => (prev?.expenseId === expenseId ? newState : prev));

      // Also keep the list item fresh (backend may have enriched description/amount).
      if (expense) {
        setExpenses((prev) =>
          prev.map((e) => e.id === expense.id
            ? { ...e, amount: expense.amount, description: expense.description }
            : e,
          ),
        );
        if (selectedRef.current?.id === expense.id) {
          selectedRef.current = { ...selectedRef.current, ...expense };
        }
      }

      // Broadcast full enriched state to context (Copilot + decision engine).
      setSelectedItem({
        expenseId,
        extra: {
          status:            expense?.status      ?? selectedRef.current?.status      ?? "",
          detected_category: expense?.detected_category ?? selectedRef.current?.detected_category ?? null,
          account_code:      expense?.account_code      ?? selectedRef.current?.account_code      ?? null,
          description:       expense?.description ?? selectedRef.current?.description ?? "",
          has_xml:    hasXml,
          has_pdf:    hasPdf,
          sat_status: satStatus,
          xml_uuid:   parsedXml?.uuid          ?? null,
          xml_fecha:  parsedXml?.fecha         ?? null,
          xml_total:  parsedXml?.total         ?? null,
          xml_emisor: parsedXml?.emisor_nombre ?? null,
          vendor_name: parsedXml?.emisor_nombre ?? null,
          vendor_rfc:  parsedXml?.emisor_rfc    ?? null,
          xml_moneda:  parsedXml?.moneda        ?? null,
        },
      });
    } catch {
      setDraftState((prev) => (prev?.expenseId === expenseId ? { ...prev, loadingDocs: false } : prev));
    }
  }, [userIdStr, setSelectedItem]);

  // Reload draft state whenever the selected expense changes.
  // Use the full object as dep (not selected?.id) so this re-fires when a
  // new Expense object is set even if the id happens to be the same
  // (e.g. after a list refresh that re-creates the same expense object).
  useEffect(() => {
    if (!selected) return;
    loadDraftDocs(selected.id);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  // Callback for EmployeeExpenseDetail to trigger a doc refresh (after upload).
  const handleDocRefreshNeeded = useCallback(() => {
    if (selectedRef.current?.id) loadDraftDocs(selectedRef.current.id);
  }, [loadDraftDocs]);

  // ── Expense list ───────────────────────────────────────────────────────────

  const loadExpenses = useCallback((selectNewest = false, preferExpenseId?: number) => {
    setLoading(true);
    fetch(`${API}/expenses/`, { headers: { ...getAuthHeaders() } })
      .then((r) => r.json())
      .then((data: Expense[]) => {
        setExpenses(data);
        if (preferExpenseId != null) {
          const target = data.find((e) => e.id === preferExpenseId);
          if (target) { selectExpense(target); return; }
        }
        if (selectNewest && data.length) {
          selectExpense([...data].sort((a, b) => b.id - a.id)[0]);
        } else if (data.length) {
          // Keep the current selection if it is still present in the refreshed
          // list; fall back to the first item otherwise.
          const current = selectedRef.current;
          const kept = current ? (data.find((e) => e.id === current.id) ?? null) : null;
          selectExpense(kept ?? data[0]);
        } else {
          selectExpense(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userIdStr, selectExpense]);

  useEffect(() => { loadExpenses(false); }, [loadExpenses]);

  // ── File upload ────────────────────────────────────────────────────────────

  const uploadFiles = useCallback(async (files: FileList) => {
    const cid = companyId ?? 1;
    setUploading(true);
    const settled = await Promise.allSettled(
      Array.from(files).map(async (file) => {
        const content = await file.text().catch(() => "");
        const res = await fetch(`${API}/expenses/documents`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body:    JSON.stringify({ company_id: cid, filename: file.name, content_text: content }),
        });
        if (!res.ok) return null;
        return res.json() as Promise<{ expense_id: number; document_type: string | null } | null>;
      }),
    );
    const docs = settled
      .filter(
        (r): r is PromiseFulfilledResult<{ expense_id: number; document_type: string | null }> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .map((r) => r.value);

    const xmlDoc      = docs.find((d) => d.document_type === "cfdi_xml");
    const preferredId = (xmlDoc ?? docs[0])?.expense_id ?? null;
    setUploading(false);
    loadExpenses(preferredId == null, preferredId ?? undefined);
  }, [companyId, userIdStr, loadExpenses]);

  // ── Decision context ──────────────────────────────────────────────────────

  const decision = useMemo(() => deriveExpenseDecision({
    item: selected ? {
      ...selected,
      // Merge canonical doc state so deriveNextAction is document-aware
      has_xml:    draftState?.hasXml    ?? undefined,
      has_pdf:    draftState?.hasPdf    ?? undefined,
      sat_status: draftState?.satStatus ?? undefined,
      xml_uuid:   draftState?.parsedXml?.uuid          ?? undefined,
      xml_emisor: draftState?.parsedXml?.emisor_nombre ?? undefined,
      xml_fecha:  draftState?.parsedXml?.fecha         ?? undefined,
    } : null,
    actions:  null,
    blockers: null,
    policy:   effectiveConfig?.expense_policy ?? null,
    derived:  effectiveConfig?.derived ?? null,
    userRole: null,
    module: {
      moduleId:           MODULE_IDS.MY_EXPENSES,
      accountingSetup:    null,
      allocationPresence: null,
    },
  }), [selected, effectiveConfig, draftState]);

  const policyHint: string | null = decision.assistantContext.policyNotes.length > 0
    ? decision.assistantContext.policyNotes.join(" · ")
    : null;

  const docFreeAllowed = (effectiveConfig?.derived as { allow_document_free_expenses?: boolean } | null | undefined)?.allow_document_free_expenses ?? false;

  // ── Simple expense creation (document-free) ────────────────────────────────
  const handleCreateSimple = useCallback(async () => {
    if (!simpleDesc.trim() || !simpleAmount) return;
    const cid = companyId ?? 1;
    setSimpleSubmitting(true);
    setSimpleError(null);
    try {
      const res = await fetch(`${API}/expenses/`, {
        method:  "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body:    JSON.stringify({
          company_id:   cid,
          amount:       parseFloat(simpleAmount),
          description:  simpleDesc.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? "Failed to create expense");
      }
      const created: Expense = await res.json();
      setShowSimpleForm(false);
      setSimpleDesc("");
      setSimpleAmount("");
      setSimpleDate(new Date().toISOString().substring(0, 10));
      loadExpenses(false, created.id);
    } catch (e) {
      setSimpleError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSimpleSubmitting(false);
    }
  }, [simpleDesc, simpleAmount, companyId, userIdStr, loadExpenses]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── List pane — hidden on mobile when detail is showing ──────────── */}
      <div
        className={[
          moduleIsNarrow && activeMobilePane === "detail" ? "hidden" : "flex",
          isMobile ? "w-full border-b" : "w-72 border-r",
          "shrink-0 flex-col overflow-hidden border-white/[0.07]",
        ].join(" ")}
      >
        {/* Upload zone — tap-friendly on mobile */}
        {showSimpleForm ? (
          /* ── Simple-expense inline form ────────────────────────────────── */
          <div className="mx-3 mt-2 mb-1 shrink-0 rounded border border-white/[0.09] bg-white/[0.02] px-3 py-2.5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">{te("quickExpenseTitle")}</p>
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                type="text"
                placeholder={te("descriptionPlaceholder")}
                value={simpleDesc}
                onChange={(e) => setSimpleDesc(e.target.value)}
                className="w-full rounded border border-white/[0.08] bg-transparent px-2.5 py-1.5 text-xs text-white/80 placeholder-white/20 outline-none focus:border-white/[0.18]"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder={te("amountPlaceholder")}
                  value={simpleAmount}
                  onChange={(e) => setSimpleAmount(e.target.value)}
                  min="0"
                  step="0.01"
                  className="w-28 rounded border border-white/[0.08] bg-transparent px-2.5 py-1.5 text-xs text-white/80 placeholder-white/20 outline-none focus:border-white/[0.18]"
                />
                <input
                  type="date"
                  value={simpleDate}
                  onChange={(e) => setSimpleDate(e.target.value)}
                  className="flex-1 rounded border border-white/[0.08] bg-transparent px-2.5 py-1.5 text-xs text-white/80 outline-none focus:border-white/[0.18]"
                />
              </div>
              {simpleError && <p className="text-[10px] text-red-400">{simpleError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateSimple}
                  disabled={simpleSubmitting || !simpleDesc.trim() || !simpleAmount}
                  className="flex-1 rounded bg-indigo-600 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {simpleSubmitting ? te("creating") : te("create")}
                </button>
                <button
                  onClick={() => { setShowSimpleForm(false); setSimpleError(null); }}
                  className="rounded border border-white/[0.1] px-3 py-1.5 text-[11px] text-white/50 transition-colors hover:text-white/70"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (!uploading && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
            }}
            onClick={() => { if (!uploading) fileInputRef.current?.click(); }}
            className={[
              "mx-3 mt-2 mb-1 shrink-0 rounded border-2 border-dashed px-4 text-center transition-colors",
              isMobile ? "py-4" : "py-2.5",
              uploading
                ? "cursor-not-allowed border-indigo-500/30 bg-indigo-500/[0.04]"
                : dragOver
                ? "cursor-copy border-indigo-500/50 bg-indigo-500/[0.07]"
                : "cursor-pointer border-white/[0.09] bg-white/[0.02] hover:border-white/[0.15]",
            ].join(" ")}
          >
            <p className={isMobile ? "text-xs text-white/30" : "text-[10px] text-white/30"}>
              {uploading
                ? tc("uploading")
                : isMobile
                ? te("tapToUpload")
                : te("dragDropUpload")}
            </p>
          </div>
        )}

        {policyHint && (
          <p className="mx-3 mb-1.5 text-[9px] leading-snug text-white/22">{policyHint}</p>
        )}

        {docFreeAllowed && !showSimpleForm && (
          <button
            onClick={() => setShowSimpleForm(true)}
            className="mx-3 mb-1.5 shrink-0 text-left text-[10px] text-indigo-400/70 hover:text-indigo-300/90 transition-colors"
          >
            {te("createWithoutDoc")}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".xml,.pdf,.jpg,.jpeg,.png"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) { uploadFiles(e.target.files); e.target.value = ""; }
          }}
        />

        <EmployeeExpenseList
          expenses={expenses}
          selectedId={selected?.id ?? null}
          onSelect={selectExpense}
          loading={loading}
          uploading={uploading}
          onNewExpense={() => { if (!uploading) fileInputRef.current?.click(); }}
          onNewSimpleExpense={docFreeAllowed ? () => setShowSimpleForm(true) : undefined}
        />
      </div>

      {/* ── Detail pane — hidden on mobile when list is showing ──────────── */}
      <div className={`${activeMobilePane === "list" ? "hidden" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}>

        <EmployeeExpenseDetail
          expenseId={selected?.id ?? null}
          expensePolicy={effectiveConfig?.expense_policy ?? null}
          approvalSetup={effectiveConfig?.approval_setup ?? null}
          workflowSetup={effectiveConfig?.workflow_setup ?? null}
          derived={effectiveConfig?.derived ?? null}
          linkedDocs={draftState?.linkedDocs ?? []}
          loadingDocs={draftState?.loadingDocs ?? false}
          parsedXml={draftState?.parsedXml ?? null}
          satStatus={draftState?.satStatus ?? null}
          onDocRefreshNeeded={handleDocRefreshNeeded}
          onBack={() => selectExpense(null)}
          onDeleted={() => {
            selectExpense(null);
            loadExpenses(false);
          }}
          onExpenseUpdated={(expense) => {
            // Keep draftState and list in sync when the detail pane patches the expense.
            setDraftState((prev) =>
              prev?.expenseId === expense.id
                ? {
                    ...prev,
                    expenseDate: expense.expense_date ?? prev.expenseDate,
                    amount:      expense.amount,
                    description: expense.description,
                    status:      expense.status,
                  }
                : prev,
            );
            setExpenses((prev) =>
              prev.map((e) => e.id === expense.id
                ? { ...e, amount: expense.amount, description: expense.description }
                : e,
              ),
            );
          }}
        />
      </div>

    </div>
  );
}
