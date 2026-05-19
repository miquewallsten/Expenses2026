"use client";

import type { ModuleQuestion } from "@/types/onboarding";

interface QuestionCardProps {
  question: ModuleQuestion;
  value: string;
  onChange: (value: string) => void;
}

export function QuestionCard({ question, value, onChange }: QuestionCardProps) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium text-secondary">{question.question}</p>
      <div className="space-y-1">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
              value === option.value
                ? "bg-accent-muted bg-blue-500/[0.06] text-primary"
                : "border-subtle bg-surface-1 text-tertiary hover:border-default hover:bg-surface-1"
            }`}
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full border ${
                value === option.value
                  ? "border-blue-500/60 bg-accent-muted"
                  : "border-default"
              }`}
            >
              {value === option.value && (
                <span className="flex h-full w-full items-center justify-center text-[8px] text-accent">
                  ●
                </span>
              )}
            </span>
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}