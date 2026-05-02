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
} from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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

export default function AdminOnboardingCopilot({ companyId, onComplete, onSkip }: Props) {
  const t = useTranslations("admin.onboarding");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<OnboardingState>({ step: 0 });
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Initial greeting
  useEffect(() => {
    if (messages.length === 0) {
      sendAssistant(
        t("welcomeMessage"),
        [
          { label: t("actionStart"), value: "start", icon: "company" },
          { label: t("actionSkip"), value: "skip", icon: "policy" },
        ]
      );
    }
  }, [messages.length, sendAssistant, t]);

  const handleAction = useCallback(
    async (value: string) => {
      if (value === "skip") {
        onSkip();
        return;
      }

      sendUser(value === "start" ? t("userStart") : value);
      setLoading(true);

      try {
        // Call the AI onboarding endpoint
        const res = await fetch(`${API}/agent/chat/${companyId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            message: value,
            persona: "admin",
            session_id: `onboarding-${companyId}`,
          }),
        });

        if (!res.ok) {
          sendAssistant(t("errorTryAgain"));
          setLoading(false);
          return;
        }

        const data = await res.json();
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
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Header */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-indigo-500/20">
            <Sparkles className="h-3 w-3 text-indigo-300/80" />
          </div>
          <span className="text-[11px] font-semibold text-white/60">{t("title")}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Progress */}
          <div className="flex items-center gap-1.5">
            <div className="h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full rounded-full bg-indigo-500/70 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-[9px] font-medium tabular-nums text-white/30">{progress}%</span>
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-1 rounded px-2 py-1 text-[10px] text-white/30 transition-colors hover:bg-white/[0.04] hover:text-white/50"
          >
            <SkipForward className="h-3 w-3" />
            {t("skip")}
          </button>
        </div>
      </header>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-[11px] leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600/20 text-indigo-100/80"
                    : "bg-white/[0.03] text-white/60"
                }`}
              >
                {msg.content}

                {/* Action buttons */}
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.actions.map((action) => (
                      <button
                        key={action.value}
                        type="button"
                        onClick={() => handleAction(action.value)}
                        disabled={loading}
                        className="inline-flex items-center gap-1 rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/50 transition-colors hover:bg-white/[0.06] hover:text-white/70 disabled:opacity-40"
                      >
                        {action.icon && (
                          <span className="text-white/30">
                            {action.icon === "company" && <Building2 className="h-3 w-3" />}
                            {action.icon === "users" && <Users className="h-3 w-3" />}
                            {action.icon === "accounting" && <Calculator className="h-3 w-3" />}
                            {action.icon === "policy" && <FileText className="h-3 w-3" />}
                          </span>
                        )}
                        {action.label}
                        <ArrowRight className="h-2.5 w-2.5 opacity-40" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin text-white/30" />
                <span className="text-[10px] text-white/30">{t("thinking")}</span>
              </div>
            </div>
          )}

          {progress >= 100 && (
            <div className="flex justify-center py-4">
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/80" />
                <span className="text-[10px] font-medium text-emerald-300/80">{t("complete")}</span>
              </div>
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <div className="shrink-0 border-t border-white/[0.06] px-4 py-2.5">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("placeholder")}
            disabled={loading || progress >= 100}
            className="min-w-0 flex-1 rounded border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/60 placeholder:text-white/20 outline-none transition-colors focus:border-indigo-500/30 focus:bg-white/[0.03] disabled:opacity-40"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || loading || progress >= 100}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-indigo-600/20 text-indigo-300/70 transition-colors hover:bg-indigo-600/30 disabled:opacity-30"
          >
            <Send className="h-3 w-3" />
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
