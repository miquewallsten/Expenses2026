"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bot, CheckCircle2, Send, TriangleAlert } from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { apiCall } from "@/lib/api/client";
import { getAuthHeaders } from "@/lib/session";
import {
  MODULE_IDS,
  deriveExpenseDecision,
  type WorkItemData,
  type AssistantContext,
} from "@/lib/my-work/expenseDecision";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// Types

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiStatus {
  available: boolean;
  active_model: string | null;
}

// Helpers

function isStableItem(expenseId: number | null): boolean {
  return expenseId !== null && expenseId > 0;
}

/**
 * Construct a minimal WorkItemData from whatever selectedItem.extra holds.
 * Fields absent in extra fall back to neutral defaults so deriveExpenseDecision
 * never crashes on incomplete context data.
 */
function buildPartialItem(
  expenseId: number,
  extra: Record<string, unknown>,
): WorkItemData {
  return {
    id:                expenseId,
    description:       String(extra.description      ?? ""),
    amount:            Number(extra.amount           ?? 0),
    status:            String(extra.status           ?? ""),
    detected_category: (extra.detected_category as string | null) ?? null,
    account_code:      (extra.account_code      as string | null) ?? null,
    report_id:         null,
    created_at:        String(extra.created_at       ?? new Date().toISOString()),
    // Document state — populated by MyExpensesModule via onDocStateChanged
    has_xml:    (extra.has_xml    as boolean                                    | undefined),
    has_pdf:    (extra.has_pdf    as boolean                                    | undefined),
    sat_status: (extra.sat_status as "valid" | "warning" | "error" | null | undefined),
    xml_uuid:   (extra.xml_uuid   as string | null                              | undefined),
    xml_emisor: (extra.xml_emisor as string | null                              | undefined),
    xml_fecha:  (extra.xml_fecha  as string | null                              | undefined),
  };
}

/**
 * Build the AI API payload from a fully-derived AssistantContext.
 *
 * Sends structured decision fields instead of raw boolean flags so the model
 * receives the same precise context the UI shows, without any guessing.
 */
function buildInsightPayload(
  ac: AssistantContext,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const missingFields: string[] = [
    ...(ac.missingAccountCode       ? ["account_code"]  : []),
    ...(ac.missingRequiredDocuments  ? ["cfdi_document"] : []),
    ...ac.missingAllocations.map(
      (d) => `allocation_${d.toLowerCase().replace(/ /g, "_")}`,
    ),
  ];
  return {
    expense_text:   JSON.stringify({ description: ac.description, amount: ac.amount, status: ac.currentStatus }),
    module:         ac.moduleId,
    expense_id:     ac.expenseId,
    workflow_step:  ac.workflowStep,
    next_action:    ac.nextAction,
    has_blockers:   ac.hasBlockers,
    blocker_count:  ac.blockerCount,
    has_warnings:   ac.hasWarnings,
    missing_fields: missingFields,
    policy_notes:   ac.policyNotes,
    ai_confidence:  ac.aiCategoryConfidence,
    // Tell the model exactly what format to produce.
    output_format:
      "1 short recommendation. 1 explanation sentence. Up to 3 specific actions. No generic advice. Do not repeat fields already visible in the UI.",
    context: JSON.stringify({
      status:            ac.currentStatus,
      primary_status:    ac.primaryStatus,
      description:       ac.description,
      amount:            ac.amount,
      detected_category: ac.detectedCategory,
      account_code:      ac.accountCode,
      // Document state — enables model to give specific document guidance
      has_xml:           ac.hasXml,
      has_pdf:           ac.hasPdf,
      sat_status:        ac.satStatus,
      xml_vendor:        ac.xmlVendor,
      xml_uuid:          ac.xmlUuid,
      xml_fecha:         ac.xmlFecha,
      xml_required:      ac.xmlRequired,
      pdf_pair_required: ac.pdfPairRequired,
      ...extra,
    }),
  };
}

/**
 * Derive up to 3 quick-action prompts from the current decision context.
 *
 * Priority order:
 *   1. Blocking issues the user must resolve
 *   2. Missing critical fields for the active module
 *   3. Quality / confidence concerns
 *   4. Workflow-stage guidance
 *
 * Returns an empty list when no item is selected.
 */
type AssistantStrings = {
  p: Record<string, string>;
  a: Record<string, string>;
  addAllocation: (dim: string) => string;
};

function deriveQuickPrompts(
  ac: AssistantContext,
  moduleId: string | null,
  s: AssistantStrings,
): string[] {
  if (!ac.expenseId) return [];
  const candidates: string[] = [];

  // MY_EXPENSES: doc-state-driven prompts take priority when doc state is known
  if (moduleId === MODULE_IDS.MY_EXPENSES && ac.workflowStep === "employee_draft") {
    if (ac.xmlRequired && !ac.hasXml) {
      candidates.push(s.p.howGetCFDI);
    } else if (ac.hasXml && ac.satStatus === "error") {
      candidates.push(s.p.whySATFailed);
      candidates.push(s.p.submitWithoutSAT);
    } else if (ac.hasXml && ac.satStatus === "warning") {
      candidates.push(s.p.satWarningsMean);
    } else if (ac.hasXml && ac.pdfPairRequired && !ac.hasPdf) {
      candidates.push(s.p.howGetPDF);
    } else if (ac.hasXml && (!ac.pdfPairRequired || ac.hasPdf)) {
      candidates.push(s.p.readyToSubmit);
    }
  }

  // Blocking issues
  if (ac.blockerCount > 0 && candidates.length < 3)
    candidates.push(s.p.clearBlockers);
  if (ac.missingAccountCode && moduleId === MODULE_IDS.ACCOUNTING_REVIEW)
    candidates.push(s.p.suggestAccountCode);
  if (ac.missingAllocations.length > 0 && candidates.length < 3)
    candidates.push(s.addAllocation(ac.missingAllocations[0].toLowerCase()));
  if (ac.missingRequiredDocuments && candidates.length < 3)
    candidates.push(s.p.whatDocRequired);

  // Quality / confidence
  if (ac.aiCategoryConfidence === "low" && candidates.length < 3)
    candidates.push(s.p.aiCategoryAccurate);
  if (ac.hasWarnings && candidates.length < 3)
    candidates.push(s.p.explainWarnings);
  if (ac.currentStatus === "rejected" && candidates.length < 3)
    candidates.push(s.p.causeOfRejection);

  // Workflow-stage guidance (only fills remaining slots)
  if (candidates.length < 3) {
    switch (ac.workflowStep) {
      case "employee_draft":    candidates.push(s.p.readyToSubmitShort);       break;
      case "manager_review":    candidates.push(s.p.verifyBeforeApproving);    break;
      case "accounting_review": candidates.push(s.p.isAccountCodeCorrect);     break;
    }
  }

  // Deduplicate (insertion-order safe) and cap at 3
  return [...new Set(candidates)].slice(0, 3);
}

// Deterministic primary action — overrides AI text for the three canonical states

function getDecisiveAction(ac: AssistantContext, s: AssistantStrings): string | null {
  if (!ac.expenseId) return null;
  if (ac.xmlRequired && !ac.hasXml)              return s.a.uploadXML;
  if (ac.hasXml && ac.pdfPairRequired && !ac.hasPdf) return s.a.uploadPDF;
  if (!ac.hasBlockers && ac.workflowStep === "employee_draft") return s.a.submitExpense;
  return null; // fall through to AI recommendation
}

// State bullets — deterministic, based on doc/SAT state, not AI

function StateBullets({ ac }: { ac: AssistantContext }) {
  const tb = useTranslations("myWork.assistant.bullets");
  const ta = useTranslations("myWork.assistant");
  type Bullet = { text: string; cls: string; icon: "ok" | "warn" | "info" };
  const bullets: Bullet[] = [];

  if (ac.hasXml) {
    bullets.push({ text: tb("xmlValid"), cls: "text-emerald-400/65", icon: "ok" });
  }
  if (ac.satStatus === "valid") {
    bullets.push({ text: tb("satPassed"), cls: "text-emerald-400/65", icon: "ok" });
  } else if (ac.satStatus === "warning") {
    bullets.push({ text: tb("satWarning"), cls: "text-amber-400/65", icon: "warn" });
  } else if (ac.satStatus === "error") {
    bullets.push({ text: tb("satFailed"), cls: "text-red-400/60", icon: "warn" });
  }
  if (ac.pdfPairRequired && ac.hasXml && !ac.hasPdf) {
    bullets.push({ text: tb("pdfRequired"), cls: "text-white/40", icon: "info" });
  } else if (ac.pdfPairRequired && ac.hasPdf) {
    bullets.push({ text: tb("pdfUploaded"), cls: "text-emerald-400/65", icon: "ok" });
  }

  if (!bullets.length) return null;

  return (
    <div className="mt-2.5 border-t border-white/[0.05] pt-2">
      <p className="mb-1.5 text-[9px] uppercase tracking-wider text-white/18">{ta("why")}</p>
      <ul className="space-y-1">
        {bullets.map((b, i) => (
          <li key={i} className={`flex items-center gap-1.5 text-[9px] ${b.cls} opacity-70`}>
            {b.icon === "warn"
              ? <TriangleAlert className="h-2.5 w-2.5 shrink-0" />
              : <CheckCircle2  className="h-2.5 w-2.5 shrink-0" />}
            {b.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Chip

function Chip({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-[36px] rounded border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs font-medium text-white/35 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.08] hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40 md:min-h-0 md:px-2 md:py-0.5 md:text-[10px]"
    >
      {label}
    </button>
  );
}

// Component

export default function MyWorkAssistant() {
  const myWork = useMyWorkContext();
  const locale = useLocale();
  const ta = useTranslations("myWork.assistant");
  const tp = useTranslations("myWork.assistant.prompts");
  const tac = useTranslations("myWork.assistant.actions");

  const assistantStrings: AssistantStrings = useMemo(() => ({
    p: {
      howGetCFDI:          tp("howGetCFDI"),
      whySATFailed:        tp("whySATFailed"),
      submitWithoutSAT:    tp("submitWithoutSAT"),
      satWarningsMean:     tp("satWarningsMean"),
      howGetPDF:           tp("howGetPDF"),
      readyToSubmit:       tp("readyToSubmit"),
      clearBlockers:       tp("clearBlockers"),
      suggestAccountCode:  tp("suggestAccountCode"),
      whatDocRequired:     tp("whatDocRequired"),
      aiCategoryAccurate:  tp("aiCategoryAccurate"),
      explainWarnings:     tp("explainWarnings"),
      causeOfRejection:    tp("causeOfRejection"),
      readyToSubmitShort:  tp("readyToSubmitShort"),
      verifyBeforeApproving: tp("verifyBeforeApproving"),
      isAccountCodeCorrect:  tp("isAccountCodeCorrect"),
    },
    a: {
      uploadXML:     tac("uploadXML"),
      uploadPDF:     tac("uploadPDF"),
      submitExpense: tac("submitExpense"),
    },
    addAllocation: (dim: string) => tp("addAllocation", { dim }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const { activeModule, selectedItem, effectiveConfig } = myWork;

  const [aiStatus,       setAiStatus]       = useState<AiStatus | null>(null);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [explanation,    setExplanation]    = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [messages,       setMessages]       = useState<Message[]>([]);
  const [input,          setInput]          = useState("");
  const [chatLoading,    setChatLoading]    = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const moduleId = activeModule?.id ?? null;

  // AI status (once on mount)
  useEffect(() => {
    apiCall<{ available: boolean; active_model?: string | null }>("/ai/status")
      .then((d) => setAiStatus({
        available: d.available,
        active_model: d.active_model ?? null,
      }))
      .catch(() => setAiStatus({ available: false, active_model: null }));
  }, []);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Decision context — drives quick prompts (display only, not the fetch)
  const decision = useMemo(() => {
    const expenseId = selectedItem.expenseId;
    if (!isStableItem(expenseId) || !moduleId) return null;
    const item = buildPartialItem(
      expenseId!,
      (selectedItem.extra as Record<string, unknown>) ?? {},
    );
    return deriveExpenseDecision({
      item,
      actions:  null,
      blockers: null,
      policy:   effectiveConfig?.expense_policy ?? null,
      derived:  effectiveConfig?.derived        ?? null,
      userRole: null,
      module: {
        moduleId:           moduleId,
        accountingSetup:    (effectiveConfig?.accounting_setup as Record<string, unknown>) ?? null,
        allocationPresence: null,
      },
    });
  }, [selectedItem.expenseId, selectedItem.extra, moduleId, effectiveConfig]);

  // Insight fetch — debounced, keyed to selected item + module
  //
  // Rebuilds the decision context locally inside the effect to avoid adding
  // the memoized `decision` object to the deps array and causing extra runs.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();

    const expenseId = selectedItem.expenseId;
    if (!isStableItem(expenseId) || !moduleId) {
      setRecommendation(null);
      setExplanation(null);
      setInsightLoading(false);
      return;
    }

    setRecommendation(null);
    setExplanation(null);
    setInsightLoading(true);

    debounceRef.current = setTimeout(() => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      const extra = (selectedItem.extra as Record<string, unknown>) ?? {};
      const item  = buildPartialItem(expenseId!, extra);
      const dec   = deriveExpenseDecision({
        item,
        actions:  null,
        blockers: null,
        policy:   effectiveConfig?.expense_policy ?? null,
        derived:  effectiveConfig?.derived        ?? null,
        userRole: null,
        module: {
          moduleId:           moduleId,
          accountingSetup:    (effectiveConfig?.accounting_setup as Record<string, unknown>) ?? null,
          allocationPresence: null,
        },
      });

      const payload = buildInsightPayload(dec.assistantContext, extra);

      const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      };

      Promise.all([
        apiCall<{ response?: string; content?: string; message?: string } | null>(
          "/ai/review-expense",
          { method: "POST", json: { ...payload, locale }, signal: ctrl.signal },
        ).catch(() => null),

        apiCall<{ response?: string; content?: string; message?: string } | null>(
          "/ai/next-action",
          { method: "POST", json: { ...payload, locale }, signal: ctrl.signal },
        ).catch(() => null),
      ])
        .then(([rev, nxt]) => {
          if (ctrl.signal.aborted) return;
          const extract = (d: unknown): string | null =>
            d && typeof d === "object"
              ? ((d as Record<string, unknown>).response
                ?? (d as Record<string, unknown>).content
                ?? (d as Record<string, unknown>).message
                ?? null) as string | null
              : null;
          const rec = extract(nxt) ?? extract(rev);
          const exp = rec && extract(rev) !== rec ? extract(rev) : null;
          setRecommendation(rec);
          setExplanation(exp);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setInsightLoading(false);
        });
    }, 750);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Include has_xml so the insight re-fires when document state loads after
  // the initial expense selection (which arrives asynchronously via loadDraftDocs).
  }, [selectedItem.expenseId, moduleId, (selectedItem.extra as Record<string, unknown>)?.has_xml]);

  // Streaming chat
  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || chatLoading) return;

    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: prompt.trim() }]);
    setInput("");
    setChatLoading(true);

    // Add empty placeholder that streams fill in
    setMessages((p) => [...p, { role: "assistant", content: "" }]);

    try {
      const ac = decision?.assistantContext;
      const context = JSON.stringify({
        module:         moduleId,
        expense_id:     selectedItem.expenseId,
        workflow_step:  ac?.workflowStep,
        next_action:    ac?.nextAction,
        has_blockers:   ac?.hasBlockers,
        missing_fields: [
          ...(ac?.missingAccountCode  ? ["account_code"] : []),
          ...(ac?.missingAllocations  ?? []),
        ],
        status:            ac?.currentStatus,
        detected_category: ac?.detectedCategory,
        account_code:      ac?.accountCode,
      });

      const res = await fetch(`${API}/ai/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ prompt: prompt.trim(), locale, context, history }),
      });

      if (!res.ok || !res.body) throw new Error("Stream unavailable");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            if (parsed.text) {
              setMessages((p) => {
                const next = [...p];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + parsed.text };
                }
                return next;
              });
            }
          } catch {
            // malformed SSE frame — skip
          }
        }
      }
    } catch {
      setMessages((p) => {
        const next = [...p];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && last.content === "") {
          next[next.length - 1] = { ...last, content: ta("aiUnavailable") };
        }
        return next;
      });
    } finally {
      setChatLoading(false);
    }
  };

  // Quick prompts derived from decision — recalculated only when selection changes
  const quickPrompts = useMemo(
    () => decision ? deriveQuickPrompts(decision.assistantContext, moduleId, assistantStrings) : [],
    [decision, moduleId, assistantStrings],
  );

  const hasContent = isStableItem(selectedItem.expenseId);

  // Render
  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* Header — desktop only; mobile/tablet uses AppShell overlay title */}
      <div className="hidden h-9 shrink-0 items-center gap-2 border-b border-white/[0.07] px-2.5 lg:flex">
        <Bot className="h-3.5 w-3.5 shrink-0 text-indigo-400/60" />
        <span className="flex-1 truncate text-[11px] font-semibold text-white/50">
          {ta("copilot")}
        </span>
        {aiStatus?.active_model && (
          <span className="shrink-0 rounded border border-indigo-500/20 bg-indigo-500/[0.08] px-1.5 py-px font-mono text-[8px] text-indigo-300/55">
            {aiStatus.active_model.split(":")[0]}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">

        {/* Offline notice */}
        {aiStatus && !aiStatus.available && (
          <p className="text-[10px] leading-relaxed text-white/22">
            {ta("aiOffline")}
          </p>
        )}

        {/* Assistant card */}
        {hasContent ? (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/20">
            <div className="p-3">

              {insightLoading ? (
                <div className="space-y-1.5">
                  <div className="h-2 w-4/5 animate-pulse rounded bg-white/[0.07]" />
                  <div className="h-1.5 w-3/5 animate-pulse rounded bg-white/[0.05]" />
                  <div className="h-1.5 w-2/3 animate-pulse rounded bg-white/[0.04]" />
                </div>
              ) : (
                <>
                  {/* Primary action — decisive, deterministic first; AI fallback second */}
                  {(() => {
                    const decisive = decision ? getDecisiveAction(decision.assistantContext, assistantStrings) : null;
                    const primary  = decisive ?? recommendation;
                    return primary ? (
                      <>
                        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">{ta("recommendedStep")}</p>
                        <p className="text-[12px] font-semibold leading-snug text-white/80">{primary}</p>
                      </>
                    ) : null;
                  })()}
                  {/* Supporting AI explanation — secondary, dimmer */}
                  {recommendation && decision && getDecisiveAction(decision.assistantContext, assistantStrings) && (
                    <p className="mt-2 text-[10px] leading-relaxed text-white/30">{recommendation}</p>
                  )}
                  {explanation && (
                    <p className="mt-1 text-[10px] leading-relaxed text-white/25">{explanation}</p>
                  )}
                  {!recommendation && !decision?.assistantContext.expenseId && (
                    <p className="text-[11px] text-white/25">{ta("noRecommendation")}</p>
                  )}
                  {/* Why? — supporting state bullets, reduced weight */}
                  {decision && <StateBullets ac={decision.assistantContext} />}
                </>
              )}

              {/* Quick actions — decision-driven, up to 3, only when loaded */}
              {!insightLoading && quickPrompts.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5 md:flex-row md:flex-wrap md:gap-1">
                  {quickPrompts.map((q) => (
                    <Chip key={q} label={q} disabled={chatLoading} onClick={() => sendMessage(q)} />
                  ))}
                </div>
              )}

            </div>
          </div>
        ) : (
          !messages.length && (
            <p className="mt-8 text-center text-[11px] text-white/18">
              {activeModule
                ? ta("selectItem", { module: activeModule.label })
                : ta("selectModule")}
            </p>
          )
        )}

        {/* Chat thread */}
        {messages.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded px-2.5 py-1.5 text-xs leading-snug md:text-[11px] ${
                    msg.role === "user"
                      ? "bg-indigo-600/20 text-indigo-100/80"
                      : "border border-white/[0.06] bg-white/[0.03] text-white/50"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {/* Streaming cursor — only shown before first token arrives */}
            {chatLoading && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content === "" && (
              <div className="flex justify-start">
                <div className="rounded border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5">
                  <span className="inline-flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1 w-1 animate-bounce rounded-full bg-white/25"
                        style={{ animationDelay: `${d * 150}ms` }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Chat input */}
      <div className="shrink-0 border-t border-white/[0.07] px-3 py-2.5 md:px-2.5 md:py-2">
        <form
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          className="flex items-center gap-2 md:gap-1.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={chatLoading}
            placeholder={ta("askPlaceholder")}
            className="min-w-0 flex-1 rounded border border-white/[0.09] bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder-white/20 outline-none transition-colors focus:border-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-40 md:px-2.5 md:py-1.5 md:text-[11px]"
          />
          <button
            type="submit"
            disabled={!input.trim() || chatLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-white/[0.03] text-white/30 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.08] hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-30 md:h-7 md:w-7"
          >
            <Send className="h-4 w-4 md:h-3 md:w-3" />
          </button>
        </form>
      </div>

    </div>
  );
}
