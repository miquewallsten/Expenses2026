"use client";

/**
 * AdminOnboardingCopilot — AI-guided conversational onboarding for new admins.
 *
 * Replaces the rigid step-by-step wizard with a natural chat experience.
 * The Copilot asks about the company, understands intent, and configures
 * settings automatically via backend APIs.
 *
 * Shown when onboarding_step < 6 or onboarding_completed_at is null.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sparkles,
  Send,
  Loader2,
  SkipForward,
  CheckCircle2,
  Building2,
  Users,
  Calculator,
  FileText,
  ArrowRight,
  Check,
} from "lucide-react";
import { apiPost } from "@/lib/api/client";

interface Message {
  role: "assistant" | "user";
  content: string;
  actions?: ActionButton[];
}

interface ActionButton {
  label: string;
  value: string;
  icon?: "company" | "users" | "accounting" | "policy";
}

interface OnboardingState {
  companyName?: string;
  industry?: string;
  employeeRange?: string;
  hasManagers?: boolean;
  modules?: string[];
  step: number;
}

interface Props {
  companyId: number;
  onComplete: () => void;
  onSkip: () => void;
}

/**
 * Render message content with basic markdown-like formatting:
 * - **bold** → <strong>
 * - - item → bullet list
 * - 1. item → numbered list
 * - Line breaks → proper spacing
 */
function renderContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "bullet" | "number" | null = null;
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      const ListTag = listType === "number" ? "ol" : "ul";
      elements.push(
        <ListTag key={key++} className={`mb-2 ${listType === "number" ? "list-decimal pl-4" : "list-disc pl-4"}`}>
          {listItems.map((item, i) => (
            <li key={i} className="text-secondary text-[11px] leading-relaxed">
              {renderInline(item)}
            </li>
          ))}
        </ListTag>
      );
      listItems = [];
      listType = null;
    }
  };

  const renderInline = (text: string): React.ReactNode => {
    // Handle **bold**
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-secondary">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return part;
    });
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Bullet list
    if (trimmed.startsWith("- ")) {
      if (listType !== "bullet") {
        flushList();
        listType = "bullet";
      }
      listItems.push(trimmed.slice(2));
      continue;
    }

    // Numbered list
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numberedMatch) {
      if (listType !== "number") {
        flushList();
        listType = "number";
      }
      listItems.push(numberedMatch[2]);
      continue;
    }

    // Flush any pending list
    flushList();

    // Regular paragraph
    if (trimmed) {
      elements.push(
        <p key={key++} className="mb-2 last:mb-0 text-secondary leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  flushList();
  return elements;
}

export default function AdminOnboardingCopilot({ companyId, onComplete, onSkip }: Props) {
  const t = useTranslations("admin.onboarding");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<OnboardingState>({ step: 0 });
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const sendAssistant = useCallback((content: string, actions?: ActionButton[]) => {
    setMessages((prev) => [...prev, { role: "assistant", content, actions }]);
  }, []);

  const sendUser = useCallback((content: string) => {
    setMessages((prev) => [...prev, { role: "user", content }]);
    setInput("");
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initial greeting - run once only
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      sendAssistant(
        t("welcomeMessage"),
        [
          { label: t("actionStart"), value: "start", icon: "company" },
          { label: t("actionSkip"), value: "skip", icon: "policy" },
        ]
      );
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAction = useCallback(
    async (value: string) => {
      if (value === "skip") {
        onSkip();
        return;
      }

      sendUser(value === "start" ? t("userStart") : value);
      setLoading(true);

      try {
        // Call the AI onboarding endpoint using centralized API client
        const data = await apiPost<{ content: string; error?: string }>(
          `/agent/chat/${companyId}`,
          {
            message: value,
            persona: "admin",
            session_id: `onboarding-${companyId}`,
          }
        );

        if (data.error) {
          sendAssistant(t("errorTryAgain"));
          setLoading(false);
          return;
        }

        const content = data.content || t("thinking");

        // Update progress based on backend state
        setProgress((prev) => Math.min(prev + 15, 100));
        setState((s) => ({ ...s, step: s.step + 1 }));

        // Determine next actions based on current step
        const actions = getActionsForStep(state.step + 1, t);
        sendAssistant(content, actions.length > 0 ? actions : undefined);
      } catch {
        sendAssistant(t("errorNetwork"));
      } finally {
        setLoading(false);
      }
    },
    [companyId, onSkip, sendAssistant, sendUser, state.step, t]
  );

  const handleSend = useCallback(() => {
    if (!input.trim() || loading) return;
    handleAction(input.trim());
  }, [input, loading, handleAction]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Mark onboarding complete when progress reaches 100
  useEffect(() => {
    if (progress >= 100) {
      onComplete();
    }
  }, [progress, onComplete]);

  return (
    <div className="flex h-full flex-col bg-surface-0">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-subtle bg-surface-1/50 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-accent-muted">
            <Sparkles className="h-3 w-3 text-accent" />
          </div>
          <span className="text-[11px] font-semibold text-secondary">{t("title")}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500/80 to-blue-400/60 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[9px] font-medium tabular-nums text-tertiary">{progress}%</span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-1 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-[10px] text-tertiary transition-colors hover:bg-surface-2 hover:text-secondary"
          >
            <SkipForward className="h-3 w-3" />
            {t("skip")}
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-3">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-blue-500/15 text-indigo-100/90 ring-1 ring-inset ring-blue-500/20"
                    : "bg-surface-1 text-secondary ring-1 ring-inset ring-white/[0.05]"
                }`}
              >
                {msg.role === "assistant" ? renderContent(msg.content) : msg.content}

                {/* Action buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {msg.actions.map((action) => (
                      <button
                        key={action.value}
                        type="button"
                        onClick={() => handleAction(action.value)}
                        disabled={loading}
                        className="inline-flex items-center gap-1.5 rounded-lg border bg-accent-muted-muted bg-accent-muted px-3 py-1.5 text-[10px] font-medium text-accent/90 transition-all hover:bg-accent-muted hover:text-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {action.icon && (
                          <span className="text-accent/70">
                            {action.icon === "company" && <Building2 className="h-3.5 w-3.5" />}
                            {action.icon === "users" && <Users className="h-3.5 w-3.5" />}
                            {action.icon === "accounting" && <Calculator className="h-3.5 w-3.5" />}
                            {action.icon === "policy" && <FileText className="h-3.5 w-3.5" />}
                          </span>
                        )}
                        {action.label}
                        <ArrowRight className="h-3 w-3 opacity-50" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-xl bg-surface-1 px-3.5 py-2.5 ring-1 ring-inset ring-white/[0.05]">
                <div className="flex gap-0.5">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-[10px] text-tertiary">{t("thinking")}</span>
              </div>
            </div>
          )}

          {progress >= 100 && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-success-muted px-4 py-2">
                <Check className="h-4 w-4 text-success" />
                <span className="text-[11px] font-medium text-emerald-300">{t("complete")}</span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-subtle bg-surface-1 px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            disabled={loading || progress >= 100}
            className="min-w-0 flex-1 rounded-lg border border-default bg-surface-1 px-3 py-2 text-[11px] text-secondary placeholder:text-muted outline-none transition-all focus:bg-accent-muted focus:bg-surface-2 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-40"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading || progress >= 100}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/80 text-primary transition-all hover:bg-accent-hover disabled:bg-surface-2 disabled:text-muted"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getActionsForStep(step: number, t: (key: string) => string): ActionButton[] {
  switch (step) {
    case 1:
      return [
        { label: t("actionCompany"), value: "configure company", icon: "company" },
        { label: t("actionModules"), value: "choose modules", icon: "policy" },
      ];
    case 2:
      return [
        { label: t("actionUsers"), value: "add users", icon: "users" },
        { label: t("actionAccounting"), value: "setup accounting", icon: "accounting" },
      ];
    case 3:
      return [
        { label: t("actionPolicy"), value: "setup policy", icon: "policy" },
        { label: t("actionComplete"), value: "finish", icon: "company" },
      ];
    default:
      return [];
  }
}
