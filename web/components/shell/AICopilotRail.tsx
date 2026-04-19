"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bot, ChevronDown, ChevronLeft, ChevronRight, Send,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CopilotExpenseContext {
  status?: string;
  detected_category?: string | null;
  account_code?: string | null;
  project?: string | null;
  client?: string | null;
  cost_center?: string | null;
  description?: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AiStatus {
  available: boolean;
  active_model: string | null;
  models: string[];
}

interface Props {
  collapsed?: boolean;
  onToggle?: () => void;
  title?: string;
  children?: React.ReactNode;
  selectedExpense?: unknown;
  selectedDocument?: unknown;
  validationResults?: unknown[];
  expenseContext?: CopilotExpenseContext | null;
}

const QUICK_PROMPTS = [
  "What is missing?",
  "How should I allocate this?",
  "Why was this flagged?",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true when the expense object is stable enough to warrant an AI call.
 * Optimistic rows (negative id or status === "uploading") are skipped.
 */
function hasExpenseData(exp: unknown): boolean {
  if (!exp || typeof exp !== "object") return false;
  const e = exp as Record<string, unknown>;
  if (typeof e.id === "number" && e.id < 0) return false;
  if (e.status === "uploading") return false;
  // Must have at least a non-empty description to be worth reviewing.
  if (!e.description || String(e.description).trim() === "") return false;
  return true;
}

/** True when a document has XML extraction data embedded in its content_text. */
function documentHasExtracted(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const ct = (doc as Record<string, unknown>).content_text;
  return typeof ct === "string" && ct.includes("[XML_EXTRACTED]");
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Chip({ label, onClick, disabled }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium text-white/35 transition-colors hover:border-indigo-500/30 hover:bg-indigo-500/[0.08] hover:text-indigo-300 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {label}
    </button>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AICopilotRail({
  collapsed,
  onToggle,
  title = "Copilot",
  children,
  selectedExpense,
  selectedDocument,
  validationResults,
}: Props) {
  const [messages, setMessages]                   = useState<Message[]>([]);
  const [input, setInput]                         = useState("");
  const [chatLoading, setChatLoading]             = useState(false);
  const [aiStatus, setAiStatus]                   = useState<AiStatus | null>(null);
  const [reviewSummary, setReviewSummary]         = useState<string | null>(null);
  const [nextActionSummary, setNextActionSummary] = useState<string | null>(null);
  // cardLoading: true while the debounce timer is pending OR while fetch is in flight.
  const [cardLoading, setCardLoading]             = useState(false);
  const [detailsOpen, setDetailsOpen]             = useState(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef    = useRef<AbortController | null>(null);

  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const isCollapsed  = collapsed ?? internalCollapsed;
  const handleToggle = onToggle ?? (() => setInternalCollapsed((v) => !v));

  // ── Fetch AI status on mount ───────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/ai/status`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        setAiStatus(
          data
            ? { available: data.available, active_model: data.active_model, models: data.models ?? [] }
            : { available: false, active_model: null, models: [] }
        );
      })
      .catch(() => setAiStatus({ available: false, active_model: null, models: [] }));
  }, []);

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Debounced AI insight cards ─────────────────────────────────────────────
  // Fires 750ms after the expense+document state becomes stable.
  // Skipped when: expense is missing/optimistic, amount is 0 with no extraction,
  // or the document fetch is still in-flight.
  useEffect(() => {
    // Cancel any pending debounce or in-flight request from the previous selection.
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (!hasExpenseData(selectedExpense)) {
      setReviewSummary(null);
      setNextActionSummary(null);
      setCardLoading(false);
      return;
    }

    const expObj = selectedExpense as Record<string, unknown>;
    const amount = typeof expObj.amount === "number" ? expObj.amount : 0;
    const hasExtracted = documentHasExtracted(selectedDocument);

    // Skip: expense has no fiscal data yet (new upload awaiting extraction).
    if (amount === 0 && !hasExtracted) {
      setReviewSummary(null);
      setNextActionSummary(null);
      setCardLoading(false);
      return;
    }

    // Show placeholders immediately while waiting for debounce + network.
    setReviewSummary(null);
    setNextActionSummary(null);
    setCardLoading(true);

    debounceRef.current = setTimeout(() => {
      const ctrl    = new AbortController();
      abortRef.current = ctrl;

      const h       = { "Content-Type": "application/json", "X-User-Id": "1" };
      const expText = JSON.stringify(selectedExpense);
      const valText = JSON.stringify(validationResults ?? []);
      const docText = JSON.stringify(selectedDocument ?? {});
      const expObj  = selectedExpense as Record<string, unknown>;

      Promise.all([
        fetch(`${API}/ai/review-expense`, {
          method: "POST",
          headers: h,
          signal: ctrl.signal,
          body: JSON.stringify({
            expense_text:       expText,
            validation_summary: valText,
            extracted_summary:  docText,
          }),
        }).then((r) => r.ok ? r.json() : null),
        fetch(`${API}/ai/next-action`, {
          method: "POST",
          headers: h,
          signal: ctrl.signal,
          body: JSON.stringify({
            expense_text:       expText,
            status:             (expObj.status as string) ?? null,
            validation_summary: valText,
            has_account_code:   !!expObj.account_code,
            has_allocation:     false,
            has_attachments:    false,
          }),
        }).then((r) => r.ok ? r.json() : null),
      ])
        .then(([rev, nxt]) => {
          setReviewSummary(rev ? (rev.response ?? rev.content ?? rev.message ?? null) : null);
          setNextActionSummary(nxt ? (nxt.response ?? nxt.content ?? nxt.message ?? null) : null);
        })
        .catch((err) => {
          // AbortError is expected on selection change; swallow it silently.
          if (err?.name !== "AbortError") {
            setReviewSummary(null);
            setNextActionSummary(null);
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCardLoading(false);
        });
    }, 750);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExpense, selectedDocument]);

  // ── Chat ───────────────────────────────────────────────────────────────────
  const sendMessage = async (prompt: string) => {
    if (!prompt.trim() || chatLoading) return;
    const userMsg: Message = { role: "user", content: prompt.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setChatLoading(true);
    try {
      const context = JSON.stringify({
        expense: selectedExpense,
        document: selectedDocument,
        validationResults,
      });
      const res = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-User-Id": "1" },
        body: JSON.stringify({ prompt: prompt.trim(), context }),
      });
      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content ?? "No response received." },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "AI assistant did not respond. It may be temporarily offline." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // ── Collapsed tab ──────────────────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <aside className="flex w-7 shrink-0 flex-col items-center border-l border-white/[0.07] bg-zinc-950 pt-2">
        <button
          type="button"
          onClick={handleToggle}
          title="Expand Copilot"
          className="flex h-6 w-6 items-center justify-center rounded text-white/22 transition-colors hover:bg-white/[0.05] hover:text-white/50"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <Bot className="h-3 w-3 text-indigo-400/40" />
          <span
            className="text-[9px] font-bold uppercase tracking-widest text-white/18"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
          >
            Copilot
          </span>
        </div>
      </aside>
    );
  }

  // ── Expanded panel ─────────────────────────────────────────────────────────
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-white/[0.07] bg-zinc-950">

      {/* Sticky header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-white/[0.07] px-2.5">
        <Bot className="h-3.5 w-3.5 shrink-0 text-indigo-400/60" />
        <span className="flex-1 truncate text-[11px] font-semibold text-white/50">{title}</span>
        {aiStatus?.active_model && (
          <span className="shrink-0 rounded border border-indigo-500/20 bg-indigo-500/[0.08] px-1.5 py-px font-mono text-[8px] text-indigo-300/55">
            {aiStatus.active_model.split(":")[0]}
          </span>
        )}
        <button
          type="button"
          onClick={handleToggle}
          title="Collapse Copilot"
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-white/20 transition-colors hover:bg-white/[0.05] hover:text-white/45"
        >
          <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2.5">

        {/* Offline — muted, non-blocking */}
        {aiStatus && !aiStatus.available && (
          <p className="text-[10px] leading-relaxed text-white/22">
            AI offline — validation and XML parsing still work.
          </p>
        )}

        {/* Single copilot card */}
        {hasExpenseData(selectedExpense) ? (() => {
          const primary     = nextActionSummary ?? reviewSummary;
          const explanation = nextActionSummary && reviewSummary ? reviewSummary : null;
          const hasDetails  = !!(expenseContext?.detected_category || expenseContext?.account_code || children);
          return (
            <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/20">
              <div className="p-3">
                {/* Recommendation + explanation */}
                {cardLoading ? (
                  <div className="space-y-1.5">
                    <div className="h-2 w-4/5 animate-pulse rounded bg-white/[0.07]" />
                    <div className="h-1.5 w-3/5 animate-pulse rounded bg-white/[0.05]" />
                    <div className="h-1.5 w-2/3 animate-pulse rounded bg-white/[0.04]" />
                  </div>
                ) : (
                  <>
                    {primary && (
                      <p className="text-[11px] leading-relaxed text-white/60">{primary}</p>
                    )}
                    {explanation && (
                      <p className="mt-1.5 text-[10px] leading-relaxed text-white/35">{explanation}</p>
                    )}
                  </>
                )}
                {/* Quick actions — always available once loaded */}
                {!cardLoading && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {QUICK_PROMPTS.map((q) => (
                      <Chip key={q} label={q} disabled={chatLoading} onClick={() => sendMessage(q)} />
                    ))}
                  </div>
                )}
              </div>
              {/* Expandable details */}
              {hasDetails && (
                <>
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((v) => !v)}
                    className="flex w-full items-center justify-between border-t border-white/[0.05] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-widest text-white/20 transition-colors hover:text-white/35"
                  >
                    <span>Details</span>
                    <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${detailsOpen ? "rotate-180" : ""}`} />
                  </button>
                  {detailsOpen && (
                    <div className="space-y-1.5 border-t border-white/[0.05] px-3 py-2">
                      {expenseContext?.detected_category && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-[9px] uppercase tracking-wider text-white/25">Category</span>
                          <span className="truncate text-right text-[9px] font-mono text-white/45">{expenseContext.detected_category}</span>
                        </div>
                      )}
                      {expenseContext?.account_code && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="shrink-0 text-[9px] uppercase tracking-wider text-white/25">Account</span>
                          <span className="truncate text-right text-[9px] font-mono text-white/45">{expenseContext.account_code}</span>
                        </div>
                      )}
                      {children && (
                        <div className="pt-0.5 text-[10px] text-white/35">{children}</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })() : (
          !messages.length && (
            <p className="mt-8 text-center text-[11px] text-white/18">
              Select an expense to see AI insights.
            </p>
          )
        )}

        {/* Chat thread */}
        {messages.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[88%] rounded px-2.5 py-1.5 text-[11px] leading-snug ${
                    msg.role === "user"
                      ? "bg-indigo-600/20 text-indigo-100/80"
                      : "border border-white/[0.06] bg-white/[0.03] text-white/50"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {chatLoading && (
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

      {/* Sticky chat input — always available, never gated on AI card loading */}
      <div className="shrink-0 border-t border-white/[0.07] px-2.5 py-2">
        <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={chatLoading}
            placeholder="Ask Copilot…"
            className="min-w-0 flex-1 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white placeholder-white/20 outline-none transition-colors focus:border-indigo-500/40 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            type="submit"
            disabled={!input.trim() || chatLoading}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-indigo-500/25 bg-indigo-600/20 text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send"
          >
            <Send className="h-3 w-3" />
          </button>
        </form>
      </div>
    </aside>
  );
}

