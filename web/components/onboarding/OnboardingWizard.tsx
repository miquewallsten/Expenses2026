"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useOnboarding } from "@/hooks/useOnboarding";
import { ProgressIndicator } from "./ProgressIndicator";
import { StepWelcome } from "./StepWelcome";
import { StepCompanyType } from "./StepCompanyType";
import { StepBasics } from "./StepBasics";
import { StepRecommendations } from "./StepRecommendations";
import { StepSmartConfig } from "./StepSmartConfig";
import { StepReady } from "./StepReady";
import { OnboardingAssistant } from "./OnboardingAssistant";

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
    canGoNext,
    canGoPrev,
    setCompanyType,
    updateCompanyProfile,
    toggleModule,
    getRecommendations,
    applyRecommendations,
    markStepComplete,
    progressPercent,
    moduleDefinitions,
    aiContext,
  } = useOnboarding();

  const handleStart = () => {
    markStepComplete("welcome");
    nextStep();
  };

  const handleNext = () => {
    markStepComplete(state.currentStep);

    // When moving from company-type, apply recommendations
    if (state.currentStep === "company-type") {
      applyRecommendations();
    }

    nextStep();
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      // TODO: Save configuration to backend
      markStepComplete("ready");
      onComplete?.();
    } finally {
      setSaving(false);
    }
  };

  const showNavigation = state.currentStep !== "welcome" && state.currentStep !== "ready";

  return (
    <div className="flex h-full min-h-[600px]">
      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-6 py-8">
          {/* Header with progress */}
          {state.currentStep !== "welcome" && state.currentStep !== "ready" && (
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
                />
              </div>
            </div>
          )}

          {/* Step content */}
          <div className="rounded-lg border border-white/[0.06] bg-zinc-900/50 p-5">
            {state.currentStep === "welcome" && <StepWelcome onStart={handleStart} />}

            {state.currentStep === "company-type" && (
              <StepCompanyType
                selectedType={state.companyProfile.companyType}
                onSelect={(type) => {
                  setCompanyType(type);
                  markStepComplete("company-type");
                }}
              />
            )}

            {state.currentStep === "company-basics" && (
              <StepBasics
                profile={state.companyProfile}
                onUpdate={updateCompanyProfile}
              />
            )}

            {state.currentStep === "recommendations" && (
              <StepRecommendations
                recommendations={getRecommendations()}
                selectedModules={state.selectedModules}
                onToggle={toggleModule}
                onApplyAll={applyRecommendations}
              />
            )}

            {state.currentStep === "smart-config" && (
              <StepSmartConfig
                modules={moduleDefinitions}
                selectedModules={state.selectedModules}
                moduleConfigs={state.moduleConfigs}
                companyType={state.companyProfile.companyType}
              />
            )}

            {state.currentStep === "ready" && (
              <StepReady
                companyProfile={state.companyProfile}
                selectedModules={state.selectedModules}
                onComplete={handleComplete}
              />
            )}

            {/* Navigation footer */}
            {showNavigation && (
              <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
                <button
                  type="button"
                  onClick={prevStep}
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
      </div>

      {/* AI Assistant Rail */}
      {state.currentStep !== "welcome" && state.currentStep !== "ready" && (
        <div className="hidden w-80 shrink-0 lg:block">
          <OnboardingAssistant
            currentStep={state.currentStep}
            aiContext={aiContext}
            completedSteps={state.completedSteps}
            companyType={state.companyProfile.companyType}
          />
        </div>
      )}
    </div>
  );
}