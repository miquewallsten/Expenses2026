"use client";

import { useState } from "react";
import { Bot, Zap, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  setup: any;
  legalEntities: any[];
  portalConfig?: any;
  onApplySetupDraft?: (draft: any) => void;
}

interface LegalEntitySuggestion {
  entity_name: string;
  country_code: string | null;
  base_currency: string | null;
  rfc: string | null;
  is_reimbursement_entity: boolean;
  is_invoice_receiver_entity: boolean;
}

interface AIResult {
  summary: string;
  company_profile: {
    company_type: string;
    operating_notes: string[];
  };
  setup_patch: Record<string, any>;
  expense_policy_patch: Record<string, any>;
  legal_entity_suggestions: LegalEntitySuggestion[];
  risks: string[];
}

// ── Quick prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS: { label: string; text: string }[] = [
  {
    label: "Mexico-only company with CFDI reimbursements",
    text:  "We are a Mexico-only company. We reimburse employees for expenses and require CFDI XML documents.",
  },
  {
    label: "Multiple legal entities",
    text:  "We operate multiple legal entities. Some are for invoicing, others for reimbursements.",
  },
  {
    label: "International expenses allowed",
    text:  "We allow employees to submit expenses in foreign currencies including USD. We need proof for international expenses.",
  },
  {
    label: "Projects only",
    text:  "We allocate all expenses to projects only. No clients or cost centers.",
  },
  {
    label: "Manager approval then accounting",
    text:  "Expenses must be approved by a direct manager before being reviewed by accounting.",
  },
  {
    label: "Also manage subcontractors",
    text:  "We have subcontractors who submit expenses through the platform. They need their own approval flow.",
  },
];

// ── Allowed setup_patch keys ──────────────────────────────────────────────────

const ALLOWED_SETUP_KEYS = new Set([
  "display_name", "country_code", "base_currency", "timezone", "language_code", "industry",
  "employee_count_range", "has_managers", "has_accounting_team", "has_subcontractors",
  "operates_multi_entity", "operates_multi_country",
  "allocation_dimensions", "allow_split_allocations",
  "expenses_module_enabled", "time_allocation_module_enabled", "subcontractor_module_enabled",
  "reimbursements_module_enabled", "approvals_module_enabled", "accounting_module_enabled",
  "archive_module_enabled", "ai_copilot_enabled",
]);

// ── Allowed expense_policy_patch keys ───────────────────────────────────────

const ALLOWED_POLICY_KEYS = new Set([
  "xml_required_mode", "pdf_pair_required_for_cfdi",
  "international_expenses_allowed", "tickets_allowed",
  "require_justification", "require_proof",
  "manager_approval_required", "accounting_review_required",
  "ai_policy_assist_enabled",
]);

const POLICY_PATCH_LABELS: Record<string, string> = {
  xml_required_mode:             "XML required",
  pdf_pair_required_for_cfdi:    "PDF pair for CFDI",
  international_expenses_allowed:"International expenses",
  tickets_allowed:               "Tickets allowed",
  require_justification:         "Justification required",
  require_proof:                 "Proof required",
  manager_approval_required:     "Manager approval",
  accounting_review_required:    "Accounting review",
  ai_policy_assist_enabled:      "AI assist",
};

const XML_MODE_LABELS: Record<string, string> = {
  never:    "Never",
  mxn_only: "MXN expenses only",
  always:   "All expenses",
};

function buildPolicySummaryLines(patch: Record<string, any>): string[] {
  const lines: string[] = [];
  if ("xml_required_mode" in patch)
    lines.push(`XML: ${XML_MODE_LABELS[patch.xml_required_mode] ?? patch.xml_required_mode}`);
  if ("pdf_pair_required_for_cfdi" in patch)
    lines.push(`CFDI PDF pair: ${patch.pdf_pair_required_for_cfdi ? "Required" : "Not required"}`);
  if ("international_expenses_allowed" in patch)
    lines.push(`International expenses: ${patch.international_expenses_allowed ? "Allowed" : "Blocked"}`);
  if ("tickets_allowed" in patch)
    lines.push(`Tickets: ${patch.tickets_allowed ? "Allowed" : "Blocked"}`);
  if ("require_proof" in patch)
    lines.push(`Proof: ${patch.require_proof ? "Required" : "Not required"}`);
  if ("require_justification" in patch)
    lines.push(`Justification: ${patch.require_justification ? "Required" : "Not required"}`);
  if ("manager_approval_required" in patch)
    lines.push(`Manager approval: ${patch.manager_approval_required ? "On" : "Off"}`);
  if ("accounting_review_required" in patch)
    lines.push(`Accounting review: ${patch.accounting_review_required ? "On" : "Off"}`);
  if ("ai_policy_assist_enabled" in patch)
    lines.push(`AI assist: ${patch.ai_policy_assist_enabled ? "On" : "Off"}`);
  return lines;
}

const SETUP_PATCH_LABELS: Record<string, string> = {
  display_name:                    "Display name",
  country_code:                    "Country",
  base_currency:                   "Base currency",
  timezone:                        "Timezone",
  language_code:                   "Language",
  industry:                        "Industry",
  employee_count_range:            "Employee range",
  has_managers:                    "Has managers",
  has_accounting_team:             "Accounting team",
  has_subcontractors:              "Has subcontractors",
  operates_multi_entity:           "Multi-entity",
  operates_multi_country:          "Multi-country",
  allocation_dimensions:           "Allocation dims",
  allow_split_allocations:         "Split allocations",
  expenses_module_enabled:         "Expenses module",
  time_allocation_module_enabled:  "Time allocation",
  subcontractor_module_enabled:    "Subcontractors",
  reimbursements_module_enabled:   "Reimbursements",
  approvals_module_enabled:        "Approvals",
  accounting_module_enabled:       "Accounting",
  archive_module_enabled:          "Archive",
  ai_copilot_enabled:              "AI Copilot",
};

function patchValueLabel(v: any): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  return String(v).replace(/_/g, " ");
}

// ── Context builder ───────────────────────────────────────────────────────────

function buildDerivedContext(portalConfig?: any): string {
  const d = portalConfig?.derived;
  if (!d) return "derived:unavailable";
  return [
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
  ].join(", ");
}

function buildSetupContext(setup: any, legalEntities: any[], portalConfig?: any): string {
  const s = setup ?? {};
  const parts = [
    `country_code:${s.country_code ?? "unset"}`,
    `base_currency:${s.base_currency ?? "unset"}`,
    `industry:${s.industry ?? "unset"}`,
    `employee_count_range:${s.employee_count_range ?? "unset"}`,
    `has_managers:${s.has_managers ?? "unset"}`,
    `has_accounting_team:${s.has_accounting_team ?? "unset"}`,
    `has_subcontractors:${s.has_subcontractors ?? "unset"}`,
    `operates_multi_entity:${s.operates_multi_entity ?? "unset"}`,
    `operates_multi_country:${s.operates_multi_country ?? "unset"}`,
    `allocation_dimensions:${s.allocation_dimensions ?? "unset"}`,
    `allow_split_allocations:${s.allow_split_allocations ?? "unset"}`,
    `expenses_module_enabled:${s.expenses_module_enabled ?? "unset"}`,
    `approvals_module_enabled:${s.approvals_module_enabled ?? "unset"}`,
    `accounting_module_enabled:${s.accounting_module_enabled ?? "unset"}`,
    `legal_entities_count:${legalEntities?.length ?? 0}`,
    buildDerivedContext(portalConfig),
  ];
  return parts.join(", ");
}

function buildSystemPrompt(userText: string, setup: any, legalEntities: any[], portalConfig?: any): string {
  const ctx = buildSetupContext(setup, legalEntities, portalConfig);
  return [
    "You are a senior financial operations and enterprise configuration consultant",
    "setting up a modular finance operations platform.",
    "Your job is to translate the user's description into a structured platform configuration.",
    "Be pragmatic — only change fields that the user's description clearly implies.",
    "Reason holistically over all five setup domains (company structure, expense rules,",
    "accounting controls, approval logic, workflow routing) when identifying risks",
    "and suggesting configurations.",
    "",
    `Current company setup context: ${ctx}.`,
    "",
    `User instruction: "${userText.trim()}".`,
    "",
    "Reply ONLY with a single valid JSON object. No markdown fences, no prose outside the JSON.",
    "Schema:",
    '{',
    '  "summary": string,',
    '  "company_profile": { "company_type": string, "operating_notes": string[] },',
    '  "setup_patch": { ...only changed company setup fields },',
    '  "expense_policy_patch": { ...only changed expense policy fields },',
    '  "legal_entity_suggestions": [',
    '    { "entity_name": string, "country_code": string|null, "base_currency": string|null,',
    '      "rfc": string|null, "is_reimbursement_entity": boolean, "is_invoice_receiver_entity": boolean }',
    '  ],',
    '  "risks": string[]',
    '}',
    "",
    "setup_patch allowed keys: display_name, country_code, base_currency, timezone, language_code,",
    "industry, employee_count_range, has_managers, has_accounting_team, has_subcontractors,",
    "operates_multi_entity, operates_multi_country, allocation_dimensions, allow_split_allocations,",
    "expenses_module_enabled, time_allocation_module_enabled, subcontractor_module_enabled,",
    "reimbursements_module_enabled, approvals_module_enabled, accounting_module_enabled,",
    "archive_module_enabled, ai_copilot_enabled.",
    "",
    "expense_policy_patch allowed keys: xml_required_mode (never|mxn_only|always),",
    "pdf_pair_required_for_cfdi (boolean), tickets_allowed (boolean),",
    "international_expenses_allowed (boolean), require_justification (boolean),",
    "require_proof (boolean), allow_split_allocations (boolean),",
    "allocation_dimensions (string), manager_approval_required (boolean),",
    "accounting_review_required (boolean).",
    "",
    "risks: 2-4 concise strings about compliance gaps, missing controls, or operational friction.",
    "Do not include any key not listed above. Do not repeat fields already at the correct value.",
  ].join(" ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminCompanySetupCopilot({
  companyId,
  setup,
  legalEntities,
  portalConfig,
  onApplySetupDraft,
}: Props) {
  const [prompt, setPrompt]       = useState("");
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<AIResult | null>(null);
  const [offline, setOffline]     = useState(false);
  const [parseError, setParseError] = useState(false);
  const [applied, setApplied]     = useState(false);

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setOffline(false);
    setParseError(false);
    setResult(null);
    setApplied(false);

    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({
          prompt: buildSystemPrompt(text, setup, legalEntities, portalConfig),
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
        typeof (parsed as any).company_profile !== "object" ||
        typeof (parsed as any).setup_patch !== "object" ||
        typeof (parsed as any).expense_policy_patch !== "object" ||
        !Array.isArray((parsed as any).legal_entity_suggestions) ||
        !Array.isArray((parsed as any).risks)
      ) {
        setParseError(true);
        return;
      }

      const p = parsed as any;

      // Sanitise setup_patch
      const rawSetupPatch = p.setup_patch as Record<string, any>;
      const cleanSetupPatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawSetupPatch ?? {})) {
        if (!ALLOWED_SETUP_KEYS.has(k)) continue;
        if (typeof v !== "boolean" && typeof v !== "string") continue;
        cleanSetupPatch[k] = v;
      }

      // Sanitise expense_policy_patch
      const rawPolicyPatch = p.expense_policy_patch as Record<string, any>;
      const cleanPolicyPatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawPolicyPatch ?? {})) {
        if (!ALLOWED_POLICY_KEYS.has(k)) continue;
        if (typeof v !== "boolean" && typeof v !== "string") continue;
        cleanPolicyPatch[k] = v;
      }

      // Sanitise legal_entity_suggestions
      const cleanEntities: LegalEntitySuggestion[] = (p.legal_entity_suggestions as any[])
        .filter((e) => typeof e?.entity_name === "string")
        .slice(0, 10)
        .map((e) => ({
          entity_name:                e.entity_name,
          country_code:               typeof e.country_code === "string" ? e.country_code : null,
          base_currency:              typeof e.base_currency === "string" ? e.base_currency : null,
          rfc:                        typeof e.rfc === "string" ? e.rfc : null,
          is_reimbursement_entity:    !!e.is_reimbursement_entity,
          is_invoice_receiver_entity: !!e.is_invoice_receiver_entity,
        }));

      setResult({
        summary:       (p.summary as string).slice(0, 500),
        company_profile: {
          company_type:    typeof p.company_profile?.company_type === "string" ? p.company_profile.company_type : "",
          operating_notes: (p.company_profile?.operating_notes as any[] ?? [])
            .filter((n): n is string => typeof n === "string").slice(0, 6),
        },
        setup_patch:             cleanSetupPatch,
        expense_policy_patch:    cleanPolicyPatch,
        legal_entity_suggestions: cleanEntities,
        risks: (p.risks as any[]).filter((r): r is string => typeof r === "string").slice(0, 6),
      });
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit   = () => runQuery(prompt);
  const handleQuick    = (text: string) => { setPrompt(text); runQuery(text); };

  const handleApply = () => {
    if (!result?.setup_patch) return;
    onApplySetupDraft?.(result.setup_patch);
    setApplied(true);
  };

  const setupPatchEntries = result?.setup_patch
    ? Object.entries(result.setup_patch).filter(([k]) => k in SETUP_PATCH_LABELS)
    : [];

  const policyPatchLines = result?.expense_policy_patch
    ? buildPolicySummaryLines(result.expense_policy_patch)
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">Setup Copilot</span>
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
          placeholder="Describe your company, legal entities, employee model, approvals, and how you want expenses to work…"
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
      {offline && (
        <div className="rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
          <p className="text-[10px] text-white/30">
            AI setup copilot is offline. Structured setup remains available.
          </p>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
          <p className="text-[10px] text-amber-300/50">AI returned an unexpected format. Try rephrasing.</p>
        </div>
      )}

      {/* C — AI interpretation */}
      {result && (
        <div className="space-y-3">

          {/* Summary */}
          <div className="rounded border border-indigo-500/[0.12] bg-indigo-500/[0.04] px-3 py-2.5">
            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/40">Summary</p>
            <p className="text-[10px] leading-snug text-white/40">{result.summary}</p>
          </div>

          {/* Company profile */}
          {(result.company_profile.company_type || result.company_profile.operating_notes.length > 0) && (
            <div className="overflow-hidden rounded border border-white/[0.07]">
              <div className="border-b border-white/[0.05] bg-black/15 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">Company profile</p>
              </div>
              <div className="px-3 py-2.5 space-y-1">
                {result.company_profile.company_type && (
                  <p className="text-[10px] text-white/50">
                    <span className="text-white/25">Type: </span>{result.company_profile.company_type}
                  </p>
                )}
                {result.company_profile.operating_notes.map((note, i) => (
                  <p key={i} className="text-[10px] text-white/38 leading-snug">· {note}</p>
                ))}
              </div>
            </div>
          )}

          {/* Setup patch */}
          {setupPatchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07]">
              <div className="border-b border-white/[0.05] bg-black/15 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">
                  Suggested setup changes
                </p>
              </div>
              {setupPatchEntries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-white/[0.04] px-3 py-2 last:border-0">
                  <span className="text-[10px] text-white/38">{SETUP_PATCH_LABELS[k] ?? k}</span>
                  <span className="font-mono text-[10px] text-indigo-300/70">{patchValueLabel(v)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Expense Policy suggestion card */}
          {policyPatchLines.length > 0 && (
            <div className="overflow-hidden rounded border border-sky-500/[0.10] bg-sky-500/[0.03]">
              <div className="border-b border-sky-500/[0.08] bg-black/10 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-sky-300/40">
                  Also suggested for Expense Policy
                </p>
              </div>
              <div className="px-3 py-2 space-y-1">
                {policyPatchLines.map((line, i) => (
                  <p key={i} className="text-[10px] text-white/35 leading-snug">· {line}</p>
                ))}
              </div>
              <div className="border-t border-sky-500/[0.06] px-3 py-1.5">
                <p className="text-[9px] text-white/20">
                  Navigate to <span className="text-sky-300/40">Expense Policy</span> to review and apply these changes.
                </p>
              </div>
            </div>
          )}

          {/* Legal entity suggestions */}
          {result.legal_entity_suggestions.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07]">
              <div className="border-b border-white/[0.05] bg-black/15 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">
                  Recommended legal entities
                </p>
              </div>
              {result.legal_entity_suggestions.map((e, i) => (
                <div key={i} className="border-b border-white/[0.04] px-3 py-2.5 last:border-0">
                  <p className="text-[11px] font-medium text-white/55">{e.entity_name}</p>
                  <p className="mt-0.5 text-[9px] text-white/28">
                    {[
                      e.country_code,
                      e.base_currency,
                      e.rfc ? `RFC: ${e.rfc}` : null,
                      e.is_reimbursement_entity ? "Reimbursement" : null,
                      e.is_invoice_receiver_entity ? "Invoice receiver" : null,
                    ].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Risks */}
          {result.risks.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/20">Risk notes</p>
              {result.risks.map((r, i) => (
                <div key={i} className="flex items-start gap-2 rounded border border-amber-500/[0.10] bg-amber-500/[0.03] px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/45" />
                  <p className="text-[10px] leading-snug text-amber-300/55">{r}</p>
                </div>
              ))}
            </div>
          )}

          {/* Apply button */}
          {setupPatchEntries.length > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applied}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-600/20 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/80 transition-colors hover:bg-indigo-600/30 disabled:opacity-40"
            >
              {applied
                ? <><CheckCircle2 className="h-3 w-3" /> Draft applied</>
                : "Apply Setup Draft"
              }
            </button>
          )}

        </div>
      )}
    </div>
  );
}
