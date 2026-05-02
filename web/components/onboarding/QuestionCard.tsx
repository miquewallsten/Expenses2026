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
      <p className="text-[11px] font-medium text-white/70">{question.question}</p>
      <div className="space-y-1">
        {question.options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`flex w-full items-center gap-2 rounded border px-2.5 py-1.5 text-left text-[11px] transition-colors ${
              value === option.value
                ? "border-indigo-500/40 bg-indigo-500/[0.06] text-white/90"
                : "border-white/[0.06] bg-white/[0.015] text-white/55 hover:border-white/[0.12] hover:bg-white/[0.03]"
            }`}
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full border ${
                value === option.value
                  ? "border-indigo-500/60 bg-indigo-500/30"
                  : "border-white/[0.12]"
              }`}
            >
              {value === option.value && (
                <span className="flex h-full w-full items-center justify-center text-[8px] text-indigo-200">
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