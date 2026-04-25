"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Zap, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// Accounting-relevant conflict codes for the pre-flight section
const ACCOUNTING_CODES = new Set([
  "POLIZA_REQUIRED_NO_XML_MODE",
  "PDF_PAIR_REQUIRED_NO_XML_MODE",
  "ACCOUNTING_DISABLED_REVIEW_ACTIVE",
  "ACCOUNTING_DISABLED_STRICT_RULES",
  "PROJECT_REQUIRED_NOT_IN_DIMS",
  "CLIENT_REQUIRED_NOT_IN_DIMS",
  "COST_CENTER_REQUIRED_NOT_IN_DIMS",
  "REIMBURSEMENTS_MULTI_ENTITY_NO_ENTITY_REQUIRED",
]);

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPT_TEXTS = [
  "Every expense must go through an accounting review before reimbursement, regardless of amount. Set accounting_review_mode to all.",
  "All expenses must have a valid CFDI XML. Pólizas must be generated and reviewed before SAT export. Set poliza_required and require_final_accounting_review_before_export to true.",
  "Only expenses above MXN 2,000 require accounting review. Set accounting_review_mode to threshold.",
  "Every expense must have an account code and a cost center assigned before it can be approved.",
  "Enable AI account code suggestions based on expense description. Accountants still manually review.",
  "No expense data should be exported without final accounting sign-off. Block export until fully reviewed.",
];

const PATCH_LABEL_KEYS: Record<string, string> = {
  accounting_review_mode:                        "patchAccountingReviewMode",
  accounting_threshold_amount:                   "patchAccountingThreshold",
  poliza_required:                               "patchPolizaRequired",
  account_code_required:                         "patchAccountCodeRequired",
  cost_center_required:                          "patchCostCenterRequired",
  project_required:                              "patchProjectRequired",
  client_required:                               "patchClientRequired",
  allow_accounting_override:                     "patchAccountingOverride",
  require_final_accounting_review_before_export: "patchFinalReviewBeforeExport",
  archive_retention_years:                       "patchArchiveRetention",
  ai_accounting_assist_enabled:                  "patchAiAccountingAssist",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAccountingCopilot({
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
  const ta = useTranslations("admin.accountingSetup");

  const QUICK_PROMPTS = [
    { label: tc("quickPromptAccountingReviewAll"), text: QUICK_PROMPT_TEXTS[0] },
    { label: tc("quickPromptCfdiPoliza"),          text: QUICK_PROMPT_TEXTS[1] },
    { label: tc("quickPromptThresholdAccounting"), text: QUICK_PROMPT_TEXTS[2] },
    { label: tc("quickPromptAccountCodesRequired"),text: QUICK_PROMPT_TEXTS[3] },
    { label: tc("quickPromptAiAccountCode"),       text: QUICK_PROMPT_TEXTS[4] },
    { label: tc("quickPromptFinalReviewSat"),      text: QUICK_PROMPT_TEXTS[5] },
  ];

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
    const patch = result?.suggested_patches?.accounting_setup ?? {};
    if (!Object.keys(patch).length) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`${API}/admin/setup-orchestrator/apply/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patches: {
            company_setup: {}, expense_policy: {},
            accounting_setup: patch,
            approval_setup: {}, workflow_setup: {},
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

  const patchValueLabel = (v: unknown): string => {
    if (typeof v === "boolean") return v ? tc("valueOn") : tc("valueOff");
    if (v === null) return "—";
    return String(v);
  };

  const patchEntries = result?.suggested_patches?.accounting_setup
    ? Object.entries(result.suggested_patches.accounting_setup).filter(([k]) => k in PATCH_LABEL_KEYS)
    : [];

  // Pre-flight: accounting-relevant cross-domain conflicts
  const configConflicts: PortalConfigConflict[] = portalConfig
    ? getPortalConfigConflicts(portalConfig).filter((c) => ACCOUNTING_CODES.has(c.code))
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">{tc("accountingTitle")}</span>
        <span className="ml-auto rounded border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/40">
          AI
        </span>
      </div>

      {/* Pre-flight: accounting config conflicts */}
      {!result && configConflicts.length > 0 && (
        <div className="space-y-1">
          {configConflicts.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 rounded border px-2.5 py-1.5 ${
                c.severity === "critical"
                  ? "border-red-500/15 bg-red-500/[0.04]"
                  : "border-amber-500/[0.12] bg-amber-500/[0.03]"
              }`}
            >
              {c.severity === "critical"
                ? <AlertCircle   className="mt-0.5 h-3 w-3 shrink-0 text-red-400/55" />
                : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/45" />
              }
              <p className={`text-[10px] leading-snug ${
                c.severity === "critical" ? "text-red-300/60" : "text-amber-300/55"
              }`}>{c.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* A — Prompt input */}
      <div className="space-y-1.5">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
          }}
          placeholder={tc("accountingPromptPlaceholder")}
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
            {tc("aiOfflineAccounting")}
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

          {/* Accounting setup patch */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                {tc("suggestedAccountingSetup")}
              </p>
              <table className="w-full">
                <tbody>
                  {patchEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-1.5 text-[10px] text-white/35">
                        {ta(PATCH_LABEL_KEYS[k] ?? k)}
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

          {/* Operational notes */}
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
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/35">{tc("complianceGaps")}</p>
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
                  : <><Zap className="h-3 w-3" /> {tc("applyAccountingDraft")}</>
                }
              </button>
            </div>
          )}

        </div>
      )}

    </div>
  );
}
