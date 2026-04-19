"use client";

import { useState } from "react";
import { Bot, Zap, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Props {
  companyId: number;
  policy: any;
  onApplySuggestion?: (partialPolicy: any) => void;
}

interface AISuggestion {
  summary: string;
  policy_patch: Record<string, any>;
  risks: string[];
}

// ── Quick prompt definitions ──────────────────────────────────────────────────

const QUICK_PROMPTS: { label: string; text: string }[] = [
  {
    label: "Require XML for MXN only",
    text: "Set xml_required_mode to mxn_only. Keep everything else at reasonable defaults.",
  },
  {
    label: "Require XML and PDF for all CFDI",
    text: "Set xml_required_mode to always and enable pdf_pair_required_for_cfdi.",
  },
  {
    label: "Allow international expenses with proof",
    text: "Enable international_expenses_allowed and require_proof.",
  },
  {
    label: "Block tickets",
    text: "Set tickets_allowed to false.",
  },
  {
    label: "Project-only allocation",
    text: "Set allocation_dimensions to project only.",
  },
  {
    label: "Manager approval required",
    text: "Enable manager_approval_required and accounting_review_required.",
  },
];

// ── Display helpers ───────────────────────────────────────────────────────────

const PATCH_LABELS: Record<string, string> = {
  xml_required_mode:             "XML required",
  pdf_pair_required_for_cfdi:    "PDF pair required",
  tickets_allowed:               "Tickets allowed",
  international_expenses_allowed:"International expenses",
  allocation_dimensions:         "Allocation dims",
  allow_split_allocations:       "Split allocations",
  manager_approval_required:     "Manager approval",
  accounting_review_required:    "Accounting review",
  require_justification:         "Justification required",
  require_proof:                 "Proof required",
  ai_policy_assist_enabled:      "AI assist",
};

function patchValueLabel(v: any): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (v === "never") return "Never";
  if (v === "mxn_only") return "MXN only";
  if (v === "always") return "Always";
  return String(v).replace(/_/g, " ");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPolicyCopilotPanel({ companyId, policy, onApplySuggestion }: Props) {
  const [prompt, setPrompt]           = useState("");
  const [loading, setLoading]         = useState(false);
  const [suggestion, setSuggestion]   = useState<AISuggestion | null>(null);
  const [offline, setOffline]         = useState(false);
  const [parseError, setParseError]   = useState(false);

  const buildPolicyContext = (): string => {
    const p = policy ?? {};
    const lines: string[] = [
      `xml_required_mode: ${p.xml_required_mode ?? "unset"}`,
      `pdf_pair_required_for_cfdi: ${p.pdf_pair_required_for_cfdi ?? "unset"}`,
      `tickets_allowed: ${p.tickets_allowed ?? "unset"}`,
      `international_expenses_allowed: ${p.international_expenses_allowed ?? "unset"}`,
      `require_justification: ${p.require_justification ?? "unset"}`,
      `require_proof: ${p.require_proof ?? "unset"}`,
      `allocation_dimensions: ${p.allocation_dimensions ?? "unset"}`,
      `allow_split_allocations: ${p.allow_split_allocations ?? "unset"}`,
      `manager_approval_required: ${p.manager_approval_required ?? "unset"}`,
      `accounting_review_required: ${p.accounting_review_required ?? "unset"}`,
      `ai_policy_assist_enabled: ${p.ai_policy_assist_enabled ?? "unset"}`,
    ];
    return lines.join(", ");
  };

  const buildSystemPrompt = (userText: string): string => {
    const policyContext = buildPolicyContext();
    return [
      `You are a financial operations implementation consultant configuring a company expense platform.`,
      `Your goal is to infer a practical expense policy that keeps employee friction low and accounting control high.`,
      `Only suggest changes that are clearly justified — do not change fields that are already sensible.`,
      ``,
      `Current policy values: ${policyContext}.`,
      ``,
      `User instruction: "${userText.trim()}".`,
      ``,
      `Reply ONLY with a single valid JSON object — no markdown fences, no prose, no explanation outside the JSON.`,
      `Schema: { "summary": string, "policy_patch": { ...only the fields that must change }, "risks": string[] }.`,
      `"summary": one sentence describing what this config achieves for the company.`,
      `"policy_patch": include ONLY fields whose values need to change. Allowed keys and types:`,
      `  xml_required_mode (string: never | mxn_only | always),`,
      `  pdf_pair_required_for_cfdi (boolean),`,
      `  international_expenses_allowed (boolean),`,
      `  tickets_allowed (boolean),`,
      `  require_justification (boolean),`,
      `  require_proof (boolean),`,
      `  allow_split_allocations (boolean),`,
      `  allocation_dimensions (string: project | client | cost_center | project_client | project_cost_center | client_cost_center | project_client_cost_center),`,
      `  manager_approval_required (boolean),`,
      `  accounting_review_required (boolean),`,
      `  ai_policy_assist_enabled (boolean).`,
      `"risks": 2-4 concise strings about compliance gaps, employee friction, or missing controls introduced by this patch.`,
      `Do not include any key not listed above. Do not set a field to its current value.`,
    ].join(" ");
  };

  const runQuery = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    setOffline(false);
    setParseError(false);
    setSuggestion(null);

    try {
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({
          prompt: buildSystemPrompt(text),
          context: `company_id:${companyId}`,
        }),
      });

      if (!res.ok) { setOffline(true); return; }

      const data = await res.json();
      const raw: string = typeof data?.content === "string" ? data.content : "";

      // Strip optional markdown code fences
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

      if (!jsonStr.startsWith("{")) { setParseError(true); return; }

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        setParseError(true);
        return;
      }

      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as any).summary !== "string" ||
        typeof (parsed as any).policy_patch !== "object" ||
        (parsed as any).policy_patch === null ||
        !Array.isArray((parsed as any).risks)
      ) {
        setParseError(true);
        return;
      }

      // Strip any unknown keys from policy_patch before storing
      const allowedKeys = new Set(Object.keys(PATCH_LABELS));
      const rawPatch = (parsed as any).policy_patch as Record<string, any>;
      const cleanPatch: Record<string, any> = {};
      for (const [k, v] of Object.entries(rawPatch)) {
        if (!allowedKeys.has(k)) continue;
        if (typeof v !== "boolean" && typeof v !== "string") continue;
        cleanPatch[k] = v;
      }

      const suggestion: AISuggestion = {
        summary:      ((parsed as any).summary as string).slice(0, 400),
        policy_patch: cleanPatch,
        risks:        ((parsed as any).risks as any[])
          .filter((r): r is string => typeof r === "string")
          .slice(0, 6),
      };

      setSuggestion(suggestion);
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => runQuery(prompt);

  const handleQuickPrompt = (text: string) => {
    setPrompt(text);
    runQuery(text);
  };

  const patchEntries = suggestion?.policy_patch
    ? Object.entries(suggestion.policy_patch).filter(([k]) => k in PATCH_LABELS)
    : [];

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto px-1 py-1">

      {/* Header */}
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-indigo-400/55" />
        <span className="text-[11px] font-semibold text-white/45">Policy Copilot</span>
        <span className="ml-auto rounded border border-indigo-500/15 bg-indigo-500/[0.06] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-indigo-300/40">
          AI
        </span>
      </div>

      {/* A — Prompt input */}
      <div className="space-y-1.5">
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Describe your company expense policy…"
          className="w-full resize-none rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[10px] text-white/55 placeholder-white/18 outline-none focus:border-indigo-500/35"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !prompt.trim()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/25 bg-indigo-600/15 px-3 py-1.5 text-[10px] font-semibold text-indigo-300/70 transition-colors hover:bg-indigo-600/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          {loading ? "Thinking…" : "Analyze"}
        </button>
      </div>

      {/* B — Quick prompts */}
      <div>
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/20">Quick presets</p>
        <div className="flex flex-wrap gap-1">
          {QUICK_PROMPTS.map(({ label, text }) => (
            <button
              key={label}
              type="button"
              disabled={loading}
              onClick={() => handleQuickPrompt(text)}
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
            AI policy copilot is offline. Structured setup still works.
          </p>
        </div>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="rounded border border-amber-500/15 bg-amber-500/[0.04] px-3 py-2">
          <p className="text-[10px] text-amber-300/50">AI returned an unexpected format. Try rephrasing.</p>
        </div>
      )}

      {/* C — Suggested configuration */}
      {suggestion && (
        <div className="space-y-2">
          {/* Summary */}
          <div className="rounded border border-indigo-500/[0.12] bg-indigo-500/[0.04] px-3 py-2.5">
            <p className="mb-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-300/40">Summary</p>
            <p className="text-[10px] leading-snug text-white/40">{suggestion.summary}</p>
          </div>

          {/* Policy patch table */}
          {patchEntries.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07] bg-white/[0.02]">
              <p className="border-b border-white/[0.05] px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">
                Suggested changes
              </p>
              <div className="divide-y divide-white/[0.04]">
                {patchEntries.map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between px-3 py-1.5 gap-2">
                    <span className="text-[10px] text-white/38">{PATCH_LABELS[key] ?? key}</span>
                    <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-mono text-white/45">
                      {patchValueLabel(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apply button */}
          {patchEntries.length > 0 && (
            <button
              type="button"
              onClick={() => onApplySuggestion?.(suggestion.policy_patch)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-[10px] font-semibold text-emerald-300/60 transition-colors hover:bg-emerald-500/[0.13]"
            >
              <CheckCircle2 className="h-3 w-3" /> Apply Suggestion
            </button>
          )}

          {/* D — Risks / Notes */}
          {suggestion.risks?.length > 0 && (
            <div className="rounded border border-amber-500/[0.12] bg-amber-500/[0.03] px-3 py-2.5">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-300/40">
                Risks &amp; notes
              </p>
              <ul className="space-y-1">
                {suggestion.risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0 text-amber-400/40" />
                    <span className="text-[10px] leading-snug text-white/32">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
