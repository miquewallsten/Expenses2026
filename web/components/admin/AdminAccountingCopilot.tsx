"use client";

import { useState } from "react";
import { Bot, Zap, Loader2, CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
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

interface AIResult {
  summary: string;
  accounting_setup_patch: Record<string, any>;
  risks: string[];
  notes: string[];
}

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS: { label: string; text: string }[] = [
  {
    label: "Full accounting review for all expenses",
    text:  "Every expense must go through an accounting review before reimbursement, regardless of amount or category.",
  },
  {
    label: "CFDI XML required + póliza export",
    text:  "All expenses must have a valid CFDI XML document. Pólizas must be generated and reviewed before SAT export.",
  },
  {
    label: "Threshold-based accounting review",
    text:  "Only expenses above a threshold amount require accounting review. Smaller amounts can be auto-processed.",
  },
  {
    label: "Account codes and cost centers required",
    text:  "Every expense must have an account code and a cost center assigned before it can be approved.",
  },
  {
    label: "AI-assisted account code suggestion",
    text:  "Enable AI to suggest account codes based on expense description and category. Accountants still review.",
  },
  {
    label: "Final review before SAT export",
    text:  "No expense data should be exported to SAT or external systems without final accounting sign-off.",
  },
];

// ── Allowed patch keys ────────────────────────────────────────────────────────

const ALLOWED_PATCH_KEYS = new Set([
  "accounting_review_mode",
  "accounting_threshold_amount",
  "poliza_required",
  "account_code_required",
  "cost_center_required",
  "project_required",
  "client_required",
  "allow_accounting_override",
  "require_final_accounting_review_before_export",
  "archive_retention_years",
  "ai_accounting_assist_enabled",
]);

const PATCH_LABELS: Record<string, string> = {
  accounting_review_mode:                       "Accounting review mode",
  accounting_threshold_amount:                  "Accounting threshold",
  poliza_required:                               "Póliza required",
  account_code_required:                        "Account code required",
  cost_center_required:                         "Cost center required",
  project_required:                             "Project required",
  client_required:                              "Client required",
  allow_accounting_override:                    "Accounting override allowed",
  require_final_accounting_review_before_export:"Final review before export",
  archive_retention_years:                      "Archive retention (years)",
  ai_accounting_assist_enabled:                 "AI accounting assist",
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
    `accounting_module_enabled:${cs.accounting_module_enabled ?? "unset"}`,
    `operates_multi_entity:${cs.operates_multi_entity ?? "unset"}`,
    `operates_multi_country:${cs.operates_multi_country ?? "unset"}`,
    `xml_required_mode:${ep.xml_required_mode ?? "unset"}`,
    `pdf_pair_required_for_cfdi:${ep.pdf_pair_required_for_cfdi ?? "unset"}`,
    `international_expenses_allowed:${ep.international_expenses_allowed ?? "unset"}`,
    `allocation_dimensions:${ep.allocation_dimensions ?? "unset"}`,
    `current_accounting_review_mode:${ac.accounting_review_mode ?? "unset"}`,
    `current_poliza_required:${ac.poliza_required ?? "unset"}`,
    `current_account_code_required:${ac.account_code_required ?? "unset"}`,
    `current_cost_center_required:${ac.cost_center_required ?? "unset"}`,
    `current_project_required:${ac.project_required ?? "unset"}`,
    `current_allow_override:${ac.allow_accounting_override ?? "unset"}`,
    `current_final_review_required:${ac.require_final_accounting_review_before_export ?? "unset"}`,
    `current_ai_assist:${ac.ai_accounting_assist_enabled ?? "unset"}`,
    `current_approval_mode:${ap.approval_mode ?? "unset"}`,
    `current_escalate_policy_failures:${ap.escalate_policy_failures_to_accounting ?? "unset"}`,
    `current_workflow_mode:${wf.default_expense_workflow_mode ?? "unset"}`,
    derivedCtx,
  ].join(", ");
}

function buildSystemPrompt(userText: string, ctx: string): string {
  return [
    "You are a financial controls and accounting configuration specialist",
    "for a modular expense management platform used in Mexico and Latin America.",
    "Your job is to translate the user's instruction into a structured accounting setup patch.",
    "Only change fields that are clearly implied by the user's description.",
    "Reason holistically over all five setup domains (company structure, expense rules,",
    "accounting controls, approval logic, workflow routing) when identifying risks",
    "and suggesting configurations. Consider CFDI/SAT compliance, póliza generation,",
    "account coding, cost center allocation, and period close requirements.",
    "",
    `Current platform context: ${ctx}.`,
    "",
    `User instruction: "${userText.trim()}".`,
    "",
    "Reply ONLY with a single valid JSON object. No markdown fences, no prose outside the JSON.",
    "Schema:",
    "{",
    '  "summary": string,',
    '  "accounting_setup_patch": {',
    '    "accounting_review_mode"?: "none"|"all"|"threshold",',
    '    "accounting_threshold_amount"?: number|null,',
    '    "poliza_required"?: boolean,',
    '    "account_code_required"?: boolean,',
    '    "cost_center_required"?: boolean,',
    '    "project_required"?: boolean,',
    '    "client_required"?: boolean,',
    '    "allow_accounting_override"?: boolean,',
    '    "require_final_accounting_review_before_export"?: boolean,',
    '    "archive_retention_years"?: number|null,',
    '    "ai_accounting_assist_enabled"?: boolean',
    "  },",
    '  "risks": string[],',
    '  "notes": string[]',
    "}",
    "",
    "risks: 2–4 concise strings about SAT compliance gaps, coding coverage gaps,",
    "period close risks, or missing controls.",
    "notes: 1–3 concise operational notes about the suggested configuration.",
    "Do not include any key not listed above.",
  ].join(" ");
}

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

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setOffline(false);
    setParseError(false);
    setResult(null);
    setApplied(false);

    try {
      const ctx = buildContext(
        companySetup, expensePolicy, accountingSetup,
        approvalSetup, workflowSetup, portalConfig,
      );

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

      // Strip markdown fences if the model wraps output
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
      if (!jsonStr.startsWith("{")) { setParseError(true); return; }

      let parsed: unknown;
      try { parsed = JSON.parse(jsonStr); }
      catch { setParseError(true); return; }

      if (
        typeof parsed !== "object" || parsed === null ||
        typeof (parsed as any).summary !== "string" ||
        typeof (parsed as any).accounting_setup_patch !== "object" ||
        !Array.isArray((parsed as any).risks) ||
        !Array.isArray((parsed as any).notes)
      ) {
        setParseError(true);
        return;
      }

      const p = parsed as any;

      // Sanitise accounting_setup_patch — only known keys, known value types
      const rawPatch = p.accounting_setup_patch as Record<string, any>;
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
        summary:               (p.summary as string).slice(0, 500),
        accounting_setup_patch: cleanPatch,
        risks: (p.risks as any[])
          .filter((r): r is string => typeof r === "string")
          .map((r) => r.slice(0, 300))
          .slice(0, 6),
        notes: (p.notes as any[])
          .filter((n): n is string => typeof n === "string")
          .map((n) => n.slice(0, 300))
          .slice(0, 4),
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
    if (!result?.accounting_setup_patch) return;
    onApplyDraft?.(result.accounting_setup_patch);
    setApplied(true);
  };

  const patchEntries = result?.accounting_setup_patch
    ? Object.entries(result.accounting_setup_patch).filter(([k]) => k in PATCH_LABELS)
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
        <span className="text-[11px] font-semibold text-white/45">Accounting Copilot</span>
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
          placeholder="Describe your accounting review requirements, CFDI controls, coding rules, and period close process…"
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
            AI accounting copilot is offline. Manual configuration remains available in the setup panel.
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

          {/* Accounting setup patch */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                Suggested accounting setup
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

          {/* Operational notes */}
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
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Compliance gaps</p>
              {result.risks.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded border border-amber-500/[0.10] bg-amber-500/[0.03] px-3 py-2"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/45" />
                  <p className="text-[10px] leading-snug text-amber-300/55">{r}</p>
                </div>
              ))}
            </div>
          )}

          {/* Apply button — does NOT auto-save; applies draft to parent form only */}
          {patchEntries.length > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {applied
                ? <><CheckCircle2 className="h-3 w-3 text-emerald-400/60" /> Draft applied</>
                : <><Zap className="h-3 w-3" /> Apply Accounting Draft</>
              }
            </button>
          )}

        </div>
      )}

    </div>
  );
}
