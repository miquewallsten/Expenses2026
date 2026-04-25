"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Zap, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  companySetup: any;
  expensePolicy: any;
  accountingSetup: any;
  approvalSetup: any;
  workflowSetup: any;
  portalConfig?: any;
  onApplyDraft?: (draft: any) => void;
}

interface SuggestedPatches {
  company_setup: Record<string, unknown>;
  expense_policy: Record<string, unknown>;
  accounting_setup: Record<string, unknown>;
  approval_setup: Record<string, unknown>;
  workflow_setup: Record<string, unknown>;
}

interface AIResult {
  understanding: string;
  summary: string;
  suggested_patches: SuggestedPatches;
  risks_gaps: string[];
  next_steps: string[];
  detected_conflicts: Array<{ code: string; message: string; severity: string }>;
  action_state: string;
  ok: boolean;
}

// Quick prompt texts (sent to AI — kept in English)
const QUICK_PROMPT_TEXTS = [
  "Expenses must flow: employee submits → manager approves → accounting reviews. Set workflow_mode to manager_then_accounting, require manager approval, block on failed validation.",
  "Skip the manager step. All expenses go directly from employee submission to accounting for review. Set default_expense_workflow_mode to direct_accounting.",
  "Block submission if the expense fails document validation. Set block_submit_on_failed_validation to true.",
  "Allow submission with warnings but automatically route those expenses to accounting for extra review.",
  "Any expense in a foreign currency or marked as international must always route to accounting, regardless of approval mode.",
  "Employees must be able to save drafts and resubmit expenses that were returned by a reviewer.",
] as const;

// Patch label map is built inside component using translations.

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminWorkflowCopilot({
  companyId,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  workflowSetup,
  portalConfig,
  onApplyDraft,
}: Props) {
  const [prompt, setPrompt]         = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<AIResult | null>(null);
  const [offline, setOffline]       = useState(false);
  const [parseError, setParseError] = useState(false);
  const [applied, setApplied]       = useState(false);
  const [applying, setApplying]     = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const locale = useLocale();
  const tc = useTranslations("admin.copilot");
  const tcPatch = useTranslations("admin.copilot.workflowPatchLabels");

  const quickPrompts = [
    { label: tc("quickPromptStandardFlow"),           text: QUICK_PROMPT_TEXTS[0] },
    { label: tc("quickPromptDirectAccounting"),       text: QUICK_PROMPT_TEXTS[1] },
    { label: tc("quickPromptBlockFailed"),            text: QUICK_PROMPT_TEXTS[2] },
    { label: tc("quickPromptAllowWarnings"),          text: QUICK_PROMPT_TEXTS[3] },
    { label: tc("quickPromptInternationalAccounting"),text: QUICK_PROMPT_TEXTS[4] },
    { label: tc("quickPromptDraftResubmit"),          text: QUICK_PROMPT_TEXTS[5] },
  ];

  const patchLabels: Record<string, string> = {
    default_expense_workflow_mode:    tcPatch("default_expense_workflow_mode"),
    auto_submit_on_complete_upload:   tcPatch("auto_submit_on_complete_upload"),
    block_submit_on_failed_validation:tcPatch("block_submit_on_failed_validation"),
    allow_submit_with_warnings:       tcPatch("allow_submit_with_warnings"),
    auto_assign_review_stage:         tcPatch("auto_assign_review_stage"),
    route_policy_failures_to:         tcPatch("route_policy_failures_to"),
    route_missing_documents_to:       tcPatch("route_missing_documents_to"),
    route_international_expenses_to:  tcPatch("route_international_expenses_to"),
    allow_draft_save:                 tcPatch("allow_draft_save"),
    allow_resubmit_after_return:      tcPatch("allow_resubmit_after_return"),
    show_next_action_guidance:        tcPatch("show_next_action_guidance"),
    ai_workflow_assist_enabled:       tcPatch("ai_workflow_assist_enabled"),
    ai_workflow_notes:                tcPatch("ai_workflow_notes"),
  };

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setOffline(false);
    setParseError(false);
    setResult(null);
    setApplied(false);
    setApplyError(null);

    try {
      const res = await fetch(`${API}/admin/setup-orchestrator/analyze/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ prompt: text, locale }),
      });

      if (!res.ok) { setOffline(true); return; }

      const data = await res.json() as AIResult;
      if (!data?.ok) { setParseError(true); return; }

      setResult(data);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = ()             => runQuery(prompt);
  const handleQuick  = (text: string) => { setPrompt(text); runQuery(text); };

  const handleApply = async () => {
    const patch = result?.suggested_patches?.workflow_setup ?? {};
    if (!Object.keys(patch).length) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`${API}/admin/setup-orchestrator/apply/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patches: {
            company_setup: {}, expense_policy: {}, accounting_setup: {}, approval_setup: {},
            workflow_setup: patch,
          },
          session_id: null,
        }),
      });
      if (res.ok) {
        onApplyDraft?.(patch);
        setApplied(true);
      } else {
        const body = await res.json().catch(() => ({}));
        setApplyError((body as { error?: string }).error ?? `Apply failed (${res.status})`);
      }
    } catch {
      setApplyError("Network error");
    } finally {
      setApplying(false);
    }
  };

  const patchEntries = result?.suggested_patches?.workflow_setup
    ? Object.entries(result.suggested_patches.workflow_setup).filter(([k]) => k in patchLabels)
    : [];

  const formatPatchValue = (v: unknown): string => {
    if (typeof v === "boolean") return v ? tc("valueOn") : tc("valueOff");
    if (typeof v === "number") return String(v);
    return String(v).replace(/_/g, " ");
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">{tc("workflowTitle")}</span>
        <span className="ml-auto rounded border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/40">
          {tc("ai")}
        </span>
      </div>

      {/* A — Prompt input */}
      <div className="space-y-1.5">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={tc("workflowPromptPlaceholder")}
          className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/55 placeholder-white/18 outline-none focus:border-indigo-500/35"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {loading ? tc("analysing") : tc("analyse")}
        </button>
      </div>

      {/* B — Quick prompts */}
      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/20">{tc("quickPrompts")}</p>
        <div className="flex flex-wrap gap-1">
          {quickPrompts.map(({ label, text }) => (
            <button
              key={label}
              type="button"
              disabled={loading}
              onClick={() => handleQuick(text)}
              className="rounded border border-white/[0.07] bg-white/[0.02] px-2 py-0.5 text-[9px] text-white/30 transition-colors hover:border-white/[0.14] hover:text-white/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Offline fallback */}
      {offline && !loading && (
        <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] text-white/30">
            {tc("aiOfflineWorkflow")}
          </p>
        </div>
      )}

      {/* Parse error */}
      {parseError && !loading && (
        <div className="rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
          <p className="text-[10px] text-amber-300/50">{tc("parseError")}</p>
        </div>
      )}

      {/* C — AI interpretation */}
      {result && (
        <div className="space-y-3">

          {/* Summary */}
          <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/22">{tc("summary")}</p>
            <p className="text-[10px] leading-relaxed text-white/45">{result.understanding || result.summary}</p>
          </div>

          {/* Workflow setup patch */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                {tc("suggestedWorkflowSetup")}
              </p>
              <table className="w-full">
                <tbody>
                  {patchEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-1.5 text-[10px] text-white/35">
                        {patchLabels[k] ?? k}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[10px] font-medium text-white/55">
                        {formatPatchValue(v)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Next steps */}
          {(result.next_steps?.length ?? 0) > 0 && (
            <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">{tc("operationalNotes")}</p>
              <ul className="space-y-1">
                {result.next_steps.map((n, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/38">
                    <span className="mt-0.5 text-white/18">·</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks & gaps */}
          {(result.risks_gaps?.length ?? 0) > 0 && (
            <div className="rounded border border-amber-500/12 bg-amber-500/[0.03] px-3 py-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/35">{tc("workflowGaps")}</p>
              <ul className="space-y-1">
                {result.risks_gaps.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-amber-300/45">
                    <span className="mt-0.5 text-amber-400/25">·</span>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Apply button */}
          {patchEntries.length > 0 && (
            <div className="space-y-1.5">
              {applyError && (
                <div className="flex items-center gap-1.5 rounded border border-red-500/15 bg-red-500/[0.06] px-2.5 py-1.5">
                  <AlertCircle className="h-3 w-3 shrink-0 text-red-400/60" />
                  <span className="text-[9.5px] text-red-300/60">{applyError}</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleApply}
                disabled={applied || applying}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {applied
                  ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> {tc("draftApplied")}</>
                  : applying
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Applying…</>
                  : <><Zap className="h-3 w-3" /> {tc("applyWorkflowDraft")}</>
                }
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
