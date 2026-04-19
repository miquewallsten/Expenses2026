"use client";

import { useState } from "react";
import { Bot, Zap, Loader2, CheckCircle2 } from "lucide-react";

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

interface AIResult {
  summary: string;
  workflow_setup_patch: Record<string, any>;
  risks: string[];
  notes: string[];
}

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS: { label: string; text: string }[] = [
  {
    label: "Standard employee → manager → accounting",
    text:  "Expenses should flow from employee submission to manager approval, then to accounting for final review.",
  },
  {
    label: "Direct accounting review",
    text:  "All submitted expenses should go directly to accounting for review without a manager step.",
  },
  {
    label: "Block failed validation submissions",
    text:  "Employees should not be able to submit an expense if it has failed document validation.",
  },
  {
    label: "Allow warnings but route to accounting",
    text:  "Employees can submit expenses that have validation warnings, but those expenses should be automatically routed to accounting for review.",
  },
  {
    label: "International expenses always go to accounting",
    text:  "Any international or foreign-currency expense must always be routed to accounting regardless of other routing rules.",
  },
  {
    label: "Employees can save drafts and resubmit",
    text:  "Employees should be able to save incomplete expenses as drafts and resubmit expenses that were returned to them.",
  },
];

// ── Allowed patch keys ────────────────────────────────────────────────────────

const ALLOWED_PATCH_KEYS = new Set([
  "default_expense_workflow_mode",
  "auto_submit_on_complete_upload",
  "block_submit_on_failed_validation",
  "allow_submit_with_warnings",
  "auto_assign_review_stage",
  "route_policy_failures_to",
  "route_missing_documents_to",
  "route_international_expenses_to",
  "allow_draft_save",
  "allow_resubmit_after_return",
  "show_next_action_guidance",
  "ai_workflow_assist_enabled",
  "ai_workflow_notes",
]);

const PATCH_LABELS: Record<string, string> = {
  default_expense_workflow_mode: "Workflow mode",
  auto_submit_on_complete_upload:"Auto-submit on upload",
  block_submit_on_failed_validation: "Block on failed validation",
  allow_submit_with_warnings:    "Allow submit with warnings",
  auto_assign_review_stage:      "Auto-assign review stage",
  route_policy_failures_to:      "Route policy failures to",
  route_missing_documents_to:    "Route missing documents to",
  route_international_expenses_to: "Route international to",
  allow_draft_save:              "Allow draft save",
  allow_resubmit_after_return:   "Allow resubmit after return",
  show_next_action_guidance:     "Show next-action guidance",
  ai_workflow_assist_enabled:    "AI assist",
  ai_workflow_notes:             "AI notes",
};

function patchValueLabel(v: any): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (typeof v === "number")  return String(v);
  return String(v).replace(/_/g, " ");
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildContext(
  companySetup: any,
  expensePolicy: any,
  accountingSetup: any,
  approvalSetup: any,
  workflowSetup: any,
  portalConfig?: any,
): string {
  const cs = companySetup    ?? {};
  const ep = expensePolicy   ?? {};
  const ac = accountingSetup ?? {};
  const ap = approvalSetup   ?? {};
  const wf = workflowSetup   ?? {};
  const d  = portalConfig?.derived;
  const derivedCtx = d ? [
    `derived_modules:[${(d.enabled_modules ?? []).join(",")}]`,
    `derived_manager_flow:${d.manager_flow_enabled ?? "unset"}`,
    `derived_accounting_flow:${d.accounting_flow_enabled ?? "unset"}`,
    `derived_workflow_mode:${d.workflow_mode ?? "unset"}`,
    `derived_xml_mode:${d.xml_required_mode ?? "unset"}`,
    `derived_pdf_pair:${d.pdf_pair_required_for_cfdi ?? "unset"}`,
    `derived_intl_allowed:${d.international_expenses_allowed ?? "unset"}`,
    `derived_allocation:[${(d.allocation_dimensions ?? []).join(",")}]`,
    `derived_allow_split:${d.allow_split_allocations ?? "unset"}`,
    `derived_tickets:${d.tickets_allowed ?? "unset"}`,
  ].join(", ") : "derived:unavailable";
  return [
    `has_managers:${cs.has_managers ?? "unset"}`,
    `has_accounting_team:${cs.has_accounting_team ?? "unset"}`,
    `operates_multi_entity:${cs.operates_multi_entity ?? "unset"}`,
    `operates_multi_country:${cs.operates_multi_country ?? "unset"}`,
    `xml_required_mode:${ep.xml_required_mode ?? "unset"}`,
    `international_expenses_allowed:${ep.international_expenses_allowed ?? "unset"}`,
    `accounting_review_mode:${ac.accounting_review_mode ?? "unset"}`,
    `current_approval_mode:${ap.approval_mode ?? "unset"}`,
    `current_workflow_mode:${wf.default_expense_workflow_mode ?? "unset"}`,
    `current_block_on_failure:${wf.block_submit_on_failed_validation ?? "unset"}`,
    `current_allow_draft_save:${wf.allow_draft_save ?? "unset"}`,
    `current_route_policy_failures:${wf.route_policy_failures_to ?? "unset"}`,
    `current_route_international:${wf.route_international_expenses_to ?? "unset"}`,
    derivedCtx,
  ].join(", ");
}

function buildSystemPrompt(userText: string, ctx: string): string {
  return [
    "You are a finance operations workflow architect designing expense routing,",
    "submission controls, and review paths based on company, policy, accounting,",
    "and approval settings.",
    "Your job is to translate the user's instruction into a structured workflow setup patch.",
    "Only change fields that are clearly implied by the user's description.",
    "Reason holistically over all five setup domains (company structure, expense rules,",
    "accounting controls, approval logic, workflow routing) when identifying risks",
    "and suggesting configurations.",
    "",
    `Current platform context: ${ctx}.`,
    "",
    `User instruction: "${userText.trim()}".`,
    "",
    "Reply ONLY with a single valid JSON object. No markdown fences, no prose outside the JSON.",
    "Schema:",
    "{",
    '  "summary": string,',
    '  "workflow_setup_patch": {',
    '    "default_expense_workflow_mode"?: "standard"|"manager_only"|"accounting_only"|"manager_then_accounting"|"direct_accounting"|"policy_driven",',
    '    "auto_submit_on_complete_upload"?: boolean,',
    '    "block_submit_on_failed_validation"?: boolean,',
    '    "allow_submit_with_warnings"?: boolean,',
    '    "auto_assign_review_stage"?: boolean,',
    '    "route_policy_failures_to"?: "manager"|"accounting"|"employee"|"none",',
    '    "route_missing_documents_to"?: "manager"|"accounting"|"employee"|"none",',
    '    "route_international_expenses_to"?: "manager"|"accounting"|"employee"|"none",',
    '    "allow_draft_save"?: boolean,',
    '    "allow_resubmit_after_return"?: boolean,',
    '    "show_next_action_guidance"?: boolean,',
    '    "ai_workflow_assist_enabled"?: boolean',
    "  },",
    '  "risks": string[],',
    '  "notes": string[]',
    "}",
    "",
    "risks: 2–4 concise strings about compliance gaps, routing blind spots, or submission control risks.",
    "notes: 1–3 concise operational notes about the suggested configuration.",
    "Do not include any key not listed above.",
  ].join(" ");
}

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

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setOffline(false);
    setParseError(false);
    setResult(null);
    setApplied(false);

    try {
      const ctx = buildContext(companySetup, expensePolicy, accountingSetup, approvalSetup, workflowSetup, portalConfig);

      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({
          prompt:  buildSystemPrompt(text, ctx),
          context: `company_id:${companyId}`,
        }),
      });

      if (!res.ok) { setOffline(true); return; }

      const data = await res.json();
      const raw: string = typeof data?.content === "string" ? data.content : "";

      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      if (!jsonStr.startsWith("{")) { setParseError(true); return; }

      let parsed: unknown;
      try { parsed = JSON.parse(jsonStr); }
      catch { setParseError(true); return; }

      if (
        typeof parsed !== "object" || parsed === null ||
        typeof (parsed as any).summary !== "string" ||
        typeof (parsed as any).workflow_setup_patch !== "object" ||
        !Array.isArray((parsed as any).risks) ||
        !Array.isArray((parsed as any).notes)
      ) {
        setParseError(true);
        return;
      }

      const p = parsed as any;

      // Sanitise workflow_setup_patch
      const rawPatch = p.workflow_setup_patch as Record<string, any>;
      const cleanPatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawPatch ?? {})) {
        if (!ALLOWED_PATCH_KEYS.has(k)) continue;
        if (
          typeof v !== "boolean" &&
          typeof v !== "string" &&
          typeof v !== "number" &&
          v !== null
        ) continue;
        cleanPatch[k] = v;
      }

      setResult({
        summary:             (p.summary as string).slice(0, 500),
        workflow_setup_patch: cleanPatch,
        risks: (p.risks as any[]).filter((r): r is string => typeof r === "string").slice(0, 6),
        notes: (p.notes as any[]).filter((n): n is string => typeof n === "string").slice(0, 4),
      });
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = ()             => runQuery(prompt);
  const handleQuick  = (text: string) => { setPrompt(text); runQuery(text); };

  const handleApply = () => {
    if (!result?.workflow_setup_patch) return;
    onApplyDraft?.(result.workflow_setup_patch);
    setApplied(true);
  };

  const patchEntries = result?.workflow_setup_patch
    ? Object.entries(result.workflow_setup_patch).filter(([k]) => k in PATCH_LABELS)
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">Workflow Copilot</span>
        <span className="ml-auto rounded border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/40">
          AI
        </span>
      </div>

      {/* A — Prompt input */}
      <div className="space-y-1.5">
        <textarea
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Describe how expenses should move from employee submission to final accounting control..."
          className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/55 placeholder-white/18 outline-none focus:border-indigo-500/35"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {loading ? "Analysing…" : "Analyse"}
        </button>
      </div>

      {/* B — Quick prompts */}
      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/20">Quick prompts</p>
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
            AI workflow copilot is offline. Manual configuration remains available in the studio.
          </p>
        </div>
      )}

      {/* Parse error */}
      {parseError && !loading && (
        <div className="rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
          <p className="text-[10px] text-amber-300/50">AI returned an unexpected format. Try rephrasing.</p>
        </div>
      )}

      {/* C — AI interpretation */}
      {result && (
        <div className="space-y-3">

          {/* Summary */}
          <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/22">Summary</p>
            <p className="text-[10px] leading-relaxed text-white/45">{result.summary}</p>
          </div>

          {/* Workflow setup patch */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                Suggested workflow setup
              </p>
              <table className="w-full">
                <tbody>
                  {patchEntries.map(([k, v]) => (
                    <tr key={k} className="border-b border-white/[0.04] last:border-0">
                      <td className="px-3 py-1.5 text-[10px] text-white/35">
                        {PATCH_LABELS[k] ?? k}
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

          {/* Notes */}
          {result.notes.length > 0 && (
            <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">Operational notes</p>
              <ul className="space-y-1">
                {result.notes.map((n, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[10px] text-white/38">
                    <span className="mt-0.5 text-white/18">·</span>
                    {n}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Risks */}
          {result.risks.length > 0 && (
            <div className="rounded border border-amber-500/12 bg-amber-500/[0.03] px-3 py-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/35">Workflow gaps</p>
              <ul className="space-y-1">
                {result.risks.map((r, i) => (
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
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applied
                ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> Draft applied</>
                : <><Zap className="h-3 w-3" /> Apply Workflow Draft</>
              }
            </button>
          )}

        </div>
      )}

    </div>
  );
}
