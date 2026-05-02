"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ProgressIndicator } from "./ProgressIndicator";
import { StepWelcome } from "./StepWelcome";
import { StepCompanyProfile } from "./StepCompanyProfile";
import { StepSelectModules } from "./StepSelectModules";
import { StepConfigureModule } from "./StepConfigureModule";
import { StepReview } from "./StepReview";
import type { OnboardingStep } from "@/types/onboarding";

interface OnboardingWizardProps {
  onComplete?: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const t = useTranslations("admin.onboardingWizard");
  const [saving, setSaving] = useState(false);

  const {
    state,
    nextStep,
    prevStep,
    goToStep,
    canGoNext,
    canGoPrev,
    updateCompanyProfile,
    toggleModule,
    setActiveModuleConfig,
    updateModuleSetting,
    markStepComplete,
    progressPercent,
    moduleDefinitions,
  } = useOnboarding();

  const handleStart = () => {
    markStepComplete("welcome");
    nextStep();
  };

  const handleNext = () => {
    markStepComplete(state.currentStep);

    // When moving from select-modules to configure-module, set the first module as active
    if (state.currentStep === "select-modules" && state.selectedModules.length > 0) {
      setActiveModuleConfig(state.selectedModules[0]);
    }

    // When moving from configure-module to review
    if (state.currentStep === "configure-module") {
      setActiveModuleConfig(null);
    }

    nextStep();
  };

  const handlePrev = () => {
    prevStep();
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // TODO: Save configuration to backend
      // For now, just mark complete and call callback
      markStepComplete("review");
      onComplete?.();
    } finally {
      setSaving(false);
    }
  };

  const handleEditStep = (step: OnboardingStep) => {
    goToStep(step);
  };

  const showNavigation = state.currentStep !== "welcome" && state.currentStep !== "review";

  return (
    <div className="mx-auto max-w-xl">
      {/* Header with progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-[16px] font-semibold text-white/90">{t("title")}</h1>
          <span className="text-[10px] text-white/35">{progressPercent}%</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded bg-white/[0.04]">
          <div
            className="h-full bg-emerald-500/65 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-3">
          <ProgressIndicator
            currentStep={state.currentStep}
            completedSteps={state.completedSteps}
            onStepClick={handleEditStep}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-white/[0.06] bg-zinc-900/50 p-5">
        {state.currentStep === "welcome" && <StepWelcome onStart={handleStart} />}

        {state.currentStep === "company-profile" && (
          <StepCompanyProfile
            profile={state.companyProfile}
            onUpdate={updateCompanyProfile}
          />
        )}

        {state.currentStep === "select-modules" && (
          <StepSelectModules
            modules={moduleDefinitions}
            selectedModules={state.selectedModules}
            onToggle={toggleModule}
          />
        )}

        {state.currentStep === "configure-module" && (
          <StepConfigureModule
            modules={moduleDefinitions}
            selectedModules={state.selectedModules}
            moduleConfigs={state.moduleConfigs}
            activeModule={state.activeModuleConfig}
            onSetActiveModule={setActiveModuleConfig}
            onUpdateSetting={updateModuleSetting}
          />
        )}

        {state.currentStep === "review" && (
          <StepReview
            companyProfile={state.companyProfile}
            selectedModules={state.selectedModules}
            moduleConfigs={state.moduleConfigs}
            moduleDefinitions={moduleDefinitions}
            onEditStep={handleEditStep}
            onComplete={handleComplete}
          />
        )}

        {/* Navigation footer */}
        {showNavigation && (
          <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!canGoPrev}
              className="flex items-center gap-1 rounded px-3 py-1.5 text-[10.5px] text-white/55 hover:bg-white/[0.04] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              {t("nav.prev")}
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || saving}
              className="flex items-center gap-1.5 rounded-md bg-indigo-500 px-4 py-1.5 text-[10.5px] font-medium text-white shadow-sm hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t("nav.saving")}
                </>
              ) : (
                <>
                  {t("nav.next")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}