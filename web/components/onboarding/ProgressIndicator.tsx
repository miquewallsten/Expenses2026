"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { OnboardingStep } from "@/types/onboarding";
import { STEP_ORDER } from "@/types/onboarding";

interface ProgressIndicatorProps {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  onStepClick?: (step: OnboardingStep) => void;
}

export function ProgressIndicator({
  currentStep,
  completedSteps,
  onStepClick,
}: ProgressIndicatorProps) {
  const t = useTranslations("admin.onboardingWizard.progress");

  const stepLabels: Record<OnboardingStep, string> = {
    welcome: t("steps.welcome"),
    "company-profile": t("steps.companyProfile"),
    "select-modules": t("steps.selectModules"),
    "configure-module": t("steps.configureModule"),
    review: t("steps.review"),
  };

  return (
    <nav aria-label="Progress" className="flex items-center justify-center gap-0.5">
      {STEP_ORDER.map((step, index) => {
        const isCompleted = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isClickable = isCompleted || index === STEP_ORDER.indexOf(currentStep) - 1;

        return (
          <div key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onStepClick?.(step)}
              disabled={!isClickable}
              className={`group relative flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                isCompleted
                  ? "bg-emerald-500/25 text-emerald-200"
                  : isCurrent
                    ? "bg-indigo-500/30 text-indigo-200 ring-1 ring-indigo-500/50"
                    : "bg-white/[0.04] text-white/35"
              } ${isClickable ? "cursor-pointer hover:bg-white/[0.08]" : "cursor-default"}`}
              aria-current={isCurrent ? "step" : undefined}
            >
              {isCompleted ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span>{index + 1}</span>
              )}
              <span className="sr-only">{stepLabels[step]}</span>
            </button>
            {index < STEP_ORDER.length - 1 && (
              <div
                className={`mx-1 h-px w-4 ${
                  completedSteps.includes(STEP_ORDER[index]) || isCurrent
                    ? "bg-emerald-500/30"
                    : "bg-white/[0.06]"
                }`}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}