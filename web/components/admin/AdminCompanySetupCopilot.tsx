"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Bot, Zap, Loader2, AlertTriangle, AlertCircle, CheckCircle2 } from "lucide-react";
import { getAuthHeaders } from "@/lib/session";
import {
  getPortalConfigConflicts,
  type PortalConfigConflict,
} from "@/lib/portal-config-conflicts";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

const COMPANY_SETUP_CODES = new Set([
  "MANAGER_FLOW_NO_MANAGERS",
  "MANAGER_WORKFLOW_NO_MANAGERS",
  "REQUIRE_MANAGER_ALL_NO_MANAGERS",
  "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
  "MULTI_COUNTRY_INTL_DISABLED",
]);

function buildLocalWarnings(setup: any, entities: any[]): string[] {
  const w: string[] = [];
  if (setup?.operates_multi_entity && entities.length === 0)
    w.push("Multi-entity enabled but no legal entities configured.");
  if (setup?.operates_multi_country) {
    const codes = new Set<string>();
    if (setup.country_code) codes.add(setup.country_code);
    entities.forEach((e) => { if (e.country_code) codes.add(e.country_code); });
    if (codes.size < 2)
      w.push("Multi-country enabled but only one country represented.");
  }
  if (!setup?.has_managers && setup?.approvals_module_enabled)
    w.push("Approvals module active but no managers configured.");
  return w;
}

interface Props {
  companyId: number;
  setup: any;
  legalEntities: any[];
  portalConfig?: any;
  onApplySetupDraft?: (draft: any) => void;
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

const QUICK_PROMPT_TEXTS = [
  "We are a Mexico-only company. We reimburse employees for expenses and require CFDI XML documents. Set country_code to MX, base_currency to MXN, and xml_required_mode to always.",
  "We operate multiple legal entities. Some are for invoicing, others for reimbursements. Set operates_multi_entity to true.",
  "We allow employees to submit expenses in foreign currencies including USD. Set international_expenses_allowed to true and require proof for international expenses.",
  "We allocate all expenses to projects only. No clients or cost centers. Set allocation_dimensions to project.",
  "Expenses must be approved by a direct manager before being reviewed by accounting. Set has_managers to true and manager_approval_required to true.",
  "We have subcontractors who submit expenses through the platform. Set has_subcontractors to true and subcontractor_module_enabled to true.",
] as const;

export default function AdminCompanySetupCopilot({
  companyId,
  setup,
  legalEntities,
  portalConfig,
  onApplySetupDraft,
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
  const tcSetup = useTranslations("admin.copilot.setupPatchLabels");
  const tcPolicy = useTranslations("admin.copilot.policyPatchLabels");
  const tcXml = useTranslations("admin.copilot.xmlModeLabels");

  const quickPrompts = [
    { label: tc("quickPromptMexicoCfdi"),     text: QUICK_PROMPT_TEXTS[0] },
    { label: tc("quickPromptMultiEntity"),     text: QUICK_PROMPT_TEXTS[1] },
    { label: tc("quickPromptInternational"),   text: QUICK_PROMPT_TEXTS[2] },
    { label: tc("quickPromptProjectsOnly"),    text: QUICK_PROMPT_TEXTS[3] },
    { label: tc("quickPromptManagerApproval"), text: QUICK_PROMPT_TEXTS[4] },
    { label: tc("quickPromptSubcontractors"),  text: QUICK_PROMPT_TEXTS[5] },
  ];

  const setupPatchLabels: Record<string, string> = {
    display_name:                   tcSetup("display_name"),
    country_code:                   tcSetup("country_code"),
    base_currency:                  tcSetup("base_currency"),
    timezone:                       tcSetup("timezone"),
    language_code:                  tcSetup("language_code"),
    industry:                       tcSetup("industry"),
    employee_count_range:           tcSetup("employee_count_range"),
    has_managers:                   tcSetup("has_managers"),
    has_accounting_team:            tcSetup("has_accounting_team"),
    has_subcontractors:             tcSetup("has_subcontractors"),
    operates_multi_entity:          tcSetup("operates_multi_entity"),
    operates_multi_country:         tcSetup("operates_multi_country"),
    allocation_dimensions:          tcSetup("allocation_dimensions"),
    allow_split_allocations:        tcSetup("allow_split_allocations"),
    expenses_module_enabled:        tcSetup("expenses_module_enabled"),
    time_allocation_module_enabled: tcSetup("time_allocation_module_enabled"),
    subcontractor_module_enabled:   tcSetup("subcontractor_module_enabled"),
    approvals_module_enabled:       tcSetup("approvals_module_enabled"),
    accounting_module_enabled:      tcSetup("accounting_module_enabled"),
    archive_module_enabled:         tcSetup("archive_module_enabled"),
    ai_copilot_enabled:             tcSetup("ai_copilot_enabled"),
  };

  const buildPolicySummaryLines = (patch: Record<string, unknown>): string[] => {
    const lines: string[] = [];
    if ("xml_required_mode" in patch)
      lines.push(`${tcPolicy("xml_required_mode")}: ${tcXml(patch.xml_required_mode as any) ?? patch.xml_required_mode}`);
    if ("pdf_pair_required_for_cfdi" in patch)
      lines.push(`${tcPolicy("pdf_pair_required_for_cfdi")}: ${patch.pdf_pair_required_for_cfdi ? tc("requiredLabel") : tc("notRequiredLabel")}`);
    if ("international_expenses_allowed" in patch)
      lines.push(`${tcPolicy("international_expenses_allowed")}: ${patch.international_expenses_allowed ? tc("allowedLabel") : tc("blockedLabel")}`);
    if ("tickets_allowed" in patch)
      lines.push(`${tcPolicy("tickets_allowed")}: ${patch.tickets_allowed ? tc("allowedLabel") : tc("blockedLabel")}`);
    if ("require_proof" in patch)
      lines.push(`${tcPolicy("require_proof")}: ${patch.require_proof ? tc("requiredLabel") : tc("notRequiredLabel")}`);
    if ("require_justification" in patch)
      lines.push(`${tcPolicy("require_justification")}: ${patch.require_justification ? tc("requiredLabel") : tc("notRequiredLabel")}`);
    if ("manager_approval_required" in patch)
      lines.push(`${tcPolicy("manager_approval_required")}: ${patch.manager_approval_required ? tc("valueOn") : tc("valueOff")}`);
    if ("accounting_review_required" in patch)
      lines.push(`${tcPolicy("accounting_review_required")}: ${patch.accounting_review_required ? tc("valueOn") : tc("valueOff")}`);
    if ("ai_policy_assist_enabled" in patch)
      lines.push(`${tcPolicy("ai_policy_assist_enabled")}: ${patch.ai_policy_assist_enabled ? tc("valueOn") : tc("valueOff")}`);
    return lines;
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
    const setupPatch  = result?.suggested_patches?.company_setup ?? {};
    const policyPatch = result?.suggested_patches?.expense_policy ?? {};
    if (!Object.keys(setupPatch).length && !Object.keys(policyPatch).length) return;
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch(`${API}/admin/setup-orchestrator/apply/${companyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          patches: {
            company_setup: setupPatch,
            expense_policy: policyPatch,
            accounting_setup: {}, approval_setup: {}, workflow_setup: {},
          },
          session_id: null,
        }),
      });
      if (res.ok) {
        onApplySetupDraft?.({ ...setupPatch, ...policyPatch });
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

  const setupPatchEntries = result?.suggested_patches?.company_setup
    ? Object.entries(result.suggested_patches.company_setup).filter(([k]) => k in setupPatchLabels)
    : [];

  const policyPatchLines = result?.suggested_patches?.expense_policy
    ? buildPolicySummaryLines(result.suggested_patches.expense_policy)
    : [];

  const hasPatches = setupPatchEntries.length > 0 || policyPatchLines.length > 0;

  const configConflicts: PortalConfigConflict[] = portalConfig
    ? getPortalConfigConflicts(portalConfig).filter((c) => COMPANY_SETUP_CODES.has(c.code))
    : [];
  const localWarnings = buildLocalWarnings(setup, legalEntities);
  const allIssues = [
    ...configConflicts.map((c) => ({ text: c.message, level: c.severity })),
    ...localWarnings.map((w) => ({ text: w, level: "warning" as const })),
  ];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">{tc("setupTitle")}</span>
        <span className="ml-auto rounded border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/40">
          {tc("ai")}
        </span>
      </div>

      {/* Config issues */}
      {allIssues.length > 0 && (
        <div className="space-y-1">
          {allIssues.map((issue, i) => (
            <div
              key={i}
              className={`flex items-start gap-1.5 rounded border px-2.5 py-1.5 ${
                issue.level === "critical"
                  ? "border-red-500/15 bg-red-500/[0.04]"
                  : "border-amber-500/[0.12] bg-amber-500/[0.03]"
              }`}
            >
              {issue.level === "critical"
                ? <AlertCircle   className="mt-0.5 h-2.5 w-2.5 shrink-0 text-red-400/60" />
                : <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-400/55" />
              }
              <p className={`text-[9.5px] leading-snug ${
                issue.level === "critical" ? "text-red-300/65" : "text-amber-300/65"
              }`}>{issue.text}</p>
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
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder={tc("setupPromptPlaceholder")}
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
            {tc("aiOfflineSetup")}
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

          {/* Company setup patch */}
          {setupPatchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.06] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                {tc("suggestedSetupChanges")}
              </p>
              {setupPatchEntries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-3 py-2 last:border-0">
                  <span className="text-[10px] text-white/35">{setupPatchLabels[k] ?? k}</span>
                  <span className="text-[10px] font-medium text-white/55">
                    {typeof v === "boolean" ? (v ? tc("valueOn") : tc("valueOff")) : String(v).replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Expense Policy suggestions */}
          {policyPatchLines.length > 0 && (
            <div className="overflow-hidden rounded border border-sky-500/[0.10] bg-sky-500/[0.03]">
              <p className="border-b border-sky-500/[0.08] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-sky-300/40">
                {tc("suggestedForExpensePolicy")}
              </p>
              <div className="px-3 py-2 space-y-1">
                {policyPatchLines.map((line, i) => (
                  <p key={i} className="text-[10px] text-white/35 leading-snug">· {line}</p>
                ))}
              </div>
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
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/35">{tc("riskNotes")}</p>
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
          {hasPatches && (
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
                  : <><Zap className="h-3 w-3" /> {tc("applySetupDraft")}</>
                }
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
