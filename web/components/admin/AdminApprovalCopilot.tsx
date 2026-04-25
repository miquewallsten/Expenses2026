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

// ── Quick prompt texts (not translated — sent to AI) ─────────────────────────

const QUICK_PROMPT_TEXTS = [
  "All expense reports must be approved by the employee's direct manager before being processed. Set approval_mode to manager_only or manager_then_accounting and require_manager_for_all_employees to true.",
  "Manager approval should only be required for expense reports above MXN 5,000. Use threshold_based approval mode.",
  "Every expense report must go through an accounting review regardless of amount. Set require_accounting_for_all_expenses to true.",
  "Any expense that violates a policy rule should escalate directly to accounting automatically.",
  "All international or foreign-currency expenses must be escalated to accounting for additional review.",
  "Employees should be allowed to correct and resubmit expense reports after rejection.",
] as const;

const PATCH_LABEL_KEYS: Record<string, string> = {
  approval_mode:                         "patchApprovalMode",
  manager_threshold_amount:              "patchManagerThreshold",
  accounting_threshold_amount:           "patchAccountingThreshold",
  require_manager_for_all_employees:     "patchRequireManagerAll",
  require_accounting_for_all_expenses:   "patchRequireAccountingAll",
  allow_self_submission_without_manager: "patchSelfSubmissionAllowed",
  allow_resubmission_after_rejection:    "patchResubmissionAllowed",
  escalate_policy_failures_to_accounting:"patchEscalatePolicyFailures",
  escalate_international_to_accounting:  "patchEscalateInternational",
  escalate_missing_documents_to_manager: "patchEscalateMissingDocs",
  ai_approval_assist_enabled:            "patchAiAssist",
  ai_approval_notes:                     "patchAiNotes",
};

// ── Context builder ───────────────────────────────────────────────────────────

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminApprovalCopilot({
  companyId,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
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
  const t  = useTranslations("admin.approvalSetup");
  const tc = useTranslations("admin.copilot");

  const QUICK_PROMPTS: { label: string; text: string }[] = [
    { label: t("quickPromptManagersAll"),    text: QUICK_PROMPT_TEXTS[0] },
    { label: t("quickPromptHighValueOnly"),  text: QUICK_PROMPT_TEXTS[1] },
    { label: t("quickPromptAccountingAll"), text: QUICK_PROMPT_TEXTS[2] },
    { label: t("quickPromptPolicyFailures"), text: QUICK_PROMPT_TEXTS[3] },
    { label: t("quickPromptInternational"),  text: QUICK_PROMPT_TEXTS[4] },
    { label: t("quickPromptResubmission"),   text: QUICK_PROMPT_TEXTS[5] },
  ];

  function patchValueLabel(v: any): string {
    if (typeof v === "boolean") return v ? tc("valueOn") : tc("valueOff");
    if (typeof v === "number")  return String(v);
    return String(v).replace(/_/g, " ");
  }

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

  const handleSubmit = ()            => runQuery(prompt);
  const handleQuick  = (text: string) => { setPrompt(text); runQuery(text); };

  const handleApply = async () => {
    const patch = result?.suggested_patches?.approval_setup ?? {};
    if (!Object.keys(patch).length) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`${API}/admin/setup-orchestrator/apply/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patches: {
            company_setup: {}, expense_policy: {}, accounting_setup: {},
            approval_setup: patch,
            workflow_setup: {},
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

  const patchEntries = result?.suggested_patches?.approval_setup
    ? Object.entries(result.suggested_patches.approval_setup).filter(([k]) => k in PATCH_LABEL_KEYS)
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">{tc("approvalTitle")}</span>
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
          placeholder={tc("approvalPromptPlaceholder")}
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
          {QUICK_PROMPTS.map(({ label, text }) => (
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
            {tc("aiOfflineApproval")}
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

          {/* Approval setup patch */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                {tc("suggestedApprovalSetup")}
              </p>
              <table className="w-full">
                <tbody>
                  {patchEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-1.5 text-[10px] text-white/35">
                        {PATCH_LABEL_KEYS[k] ? t(PATCH_LABEL_KEYS[k] as any) : k}
                      </td>
                      <td className="px-3 py-1.5 text-right text-[10px] font-medium text-white/55">
                        {patchValueLabel(v)}
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

          {/* Risks & conflicts */}
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
                  : <><Zap className="h-3 w-3" /> {tc("applyApprovalDraft")}</>
                }
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
