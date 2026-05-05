"use client";

import { Sparkles, ChevronRight, Send, Loader2 } from "lucide-react";
import { useAgent } from "@/hooks/useAgent";
import { useEffect, useRef, useState } from "react";
import type { AIContext, OnboardingStep } from "@/types/onboarding";
import { renderContent } from "@/lib/chat/renderContent";

interface OnboardingAssistantProps {
  currentStep: OnboardingStep;
  aiContext: AIContext;
  completedSteps: OnboardingStep[];
  companyType?: string;
}

// Step-specific quick actions
const STEP_QUICK_ACTIONS: Record<OnboardingStep, string[]> = {
  welcome: [],
  "company-type": [
    "What if my company doesn't fit these categories?",
    "Can I change this later?",
  ],
  "company-basics": [
    "How do I add more currencies?",
    "What timezone should I use?",
  ],
  recommendations: [
    "What does the Expenses module do?",
    "Do I need the Accounting module?",
    "How does AI assistance help?",
  ],
  "smart-config": [
    "Change the approval workflow",
    "Add more approval stages",
    "What is CFDI?",
  ],
  ready: [
    "How do I invite my team?",
    "What should I do next?",
  ],
};

export function OnboardingAssistant({
  currentStep,
  aiContext,
  completedSteps,
}: OnboardingAssistantProps) {
  const { messages, chat, isTyping } = useAgent("admin-copilot");
  const [inputValue, setInputValue] = useState("");
  const hasIntroduced = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send contextual introduction when component mounts
  useEffect(() => {
    if (!hasIntroduced.current && messages.length === 0) {
      hasIntroduced.current = true;
      chat("User is starting the onboarding wizard. Introduce yourself briefly as their setup assistant. Be friendly but concise. Tell them you'll help them configure everything perfectly.");
    }
  }, [messages.length, chat]);

  // Send step context when step changes
  useEffect(() => {
    if (currentStep === "welcome" || currentStep === "company-type") {
      // Already handled by introduction or handled below
    } else if (currentStep === "company-basics" && hasIntroduced.current) {
      chat("The user is now entering company basics (name, currency, timezone). Offer help if they have questions.");
    } else if (currentStep === "recommendations" && hasIntroduced.current) {
      chat("The user is reviewing module recommendations. Briefly explain why these modules are recommended.");
    } else if (currentStep === "smart-config" && hasIntroduced.current) {
      chat("Configuration is ready. Offer to customize settings if they want.");
    } else if (currentStep === "ready" && hasIntroduced.current) {
      chat("Onboarding complete! Congratulate them and tell them you're available in the admin panel.");
    }
  }, [currentStep, chat]);

  const handleQuestionClick = (question: string) => {
    chat(question);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      chat(inputValue.trim());
      setInputValue("");
    }
  };

  const quickActions = STEP_QUICK_ACTIONS[currentStep] || [];

  return (
    <div className="flex h-full flex-col border-l border-subtle bg-surface-0/50">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-subtle px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/15">
          <Sparkles className="h-4 w-4 text-accent" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-secondary">Setup Assistant</p>
          <p className="text-[9px] text-muted">
            Step {completedSteps.length + 1} of 6
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-3">
          {/* Initial greeting from AI context */}
          <div className="rounded-lg bg-blue-500/[0.06] p-3">
            <p className="text-[11px] leading-relaxed text-secondary">
              {aiContext.greeting}
            </p>
          </div>

          {/* Agent messages */}
          {messages.map((message) => (
            <div
              key={message.id}
              className={`rounded-xl px-3.5 py-2.5 ${
                message.role === "user"
                  ? "ml-4 bg-blue-500/15 text-indigo-100/90 ring-1 ring-inset ring-blue-500/20"
                  : "mr-4 bg-surface-1 text-secondary ring-1 ring-inset ring-white/[0.05]"
              }`}
            >
              <div className="text-[11px] leading-relaxed">
                {message.role === "assistant" ? renderContent(message.content) : message.content}
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="mr-4 rounded-xl bg-surface-1 px-3.5 py-2.5 ring-1 ring-inset ring-white/[0.05]">
              <div className="flex items-center gap-2">
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/60"
                      style={{ animationDelay: `${d * 150}ms` }}
                    />
                  ))}
                </span>
                <span className="text-[10px] text-tertiary">Thinking...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Quick Actions */}
      {quickActions.length > 0 && !isTyping && (
        <div className="border-t border-subtle px-4 py-3">
          <p className="mb-2 text-[9px] font-medium uppercase tracking-wide text-muted">
            Quick questions
          </p>
          <div className="space-y-1">
            {quickActions.map((action, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleQuestionClick(action)}
                className="flex w-full items-center gap-2 rounded bg-surface-1 px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2"
              >
                <ChevronRight className="h-3 w-3 shrink-0 text-muted" />
                <span className="text-[10px] text-secondary">{action}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-subtle p-3">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask me anything..."
            disabled={isTyping}
            className="flex-1 rounded-lg border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-secondary placeholder:text-muted focus:bg-accent-muted focus:outline-none focus:ring-1 focus:ring-blue-500/25 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isTyping || !inputValue.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent transition-colors hover:bg-accent-muted disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}