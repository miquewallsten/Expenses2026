"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";

interface StepWelcomeProps {
  onStart: () => void;
}

export function StepWelcome({ onStart }: StepWelcomeProps) {
  const t = useTranslations("admin.onboardingWizard.welcome");

  return (
    <div className="flex flex-col items-center py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-300/80">
        <Sparkles className="h-6 w-6" />
      </div>

      <h2 className="mt-4 text-[18px] font-semibold text-white/90">
        {t("title")}
      </h2>

      <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-white/55">
        {t("description")}
      </p>

      <ul className="mt-6 space-y-2 text-left text-[11px] text-white/50">
        {(["step1", "step2", "step3", "step4"] as const).map((key) => (
          <li key={key} className="flex items-start gap-2">
            <span className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[9px] text-white/40">
              {key.slice(-1)}
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onStart}
        className="mt-6 rounded-md bg-indigo-500 px-5 py-2 text-[11px] font-medium text-white shadow-sm hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
      >
        {t("startButton")}
      </button>
    </div>
  );
}