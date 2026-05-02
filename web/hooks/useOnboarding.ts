"use client";

import { useState, useCallback, useMemo } from "react";
import {
  type OnboardingStep,
  type OnboardingState,
  type CompanyProfile,
  type ModuleType,
  type ModuleConfig,
  STEP_ORDER,
  DEFAULT_COMPANY_PROFILE,
  DEFAULT_MODULE_CONFIG,
  MODULE_DEFINITIONS,
} from "@/types/onboarding";

export interface UseOnboardingReturn {
  state: OnboardingState;
  // Navigation
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: OnboardingStep) => void;
  canGoNext: boolean;
  canGoPrev: boolean;
  // Company profile
  updateCompanyProfile: (profile: Partial<CompanyProfile>) => void;
  // Module selection
  toggleModule: (module: ModuleType) => void;
  setSelectedModules: (modules: ModuleType[]) => void;
  // Module configuration
  setActiveModuleConfig: (module: ModuleType | null) => void;
  updateModuleConfig: (module: ModuleType, config: Partial<ModuleConfig>) => void;
  updateModuleSetting: (module: ModuleType, key: string, value: unknown) => void;
  // Completion
  markStepComplete: (step: OnboardingStep) => void;
  isStepComplete: (step: OnboardingStep) => boolean;
  // Helpers
  progressPercent: number;
  currentStepIndex: number;
  totalSteps: number;
  moduleDefinitions: typeof MODULE_DEFINITIONS;
}

export function useOnboarding(initialState?: Partial<OnboardingState>): UseOnboardingReturn {
  const [state, setState] = useState<OnboardingState>({
    currentStep: "welcome",
    companyProfile: DEFAULT_COMPANY_PROFILE,
    selectedModules: [],
    moduleConfigs: {
      expenses: { ...DEFAULT_MODULE_CONFIG },
      timesheets: { ...DEFAULT_MODULE_CONFIG },
      requests: { ...DEFAULT_MODULE_CONFIG },
      accounting: { ...DEFAULT_MODULE_CONFIG },
      ai: { ...DEFAULT_MODULE_CONFIG },
    },
    activeModuleConfig: null,
    completedSteps: [],
    ...initialState,
  });

  const currentStepIndex = useMemo(
    () => STEP_ORDER.indexOf(state.currentStep),
    [state.currentStep]
  );

  const totalSteps = STEP_ORDER.length;

  const progressPercent = useMemo(() => {
    const completedCount = state.completedSteps.length;
    // Weight configure-module based on selected modules
    const moduleWeight = state.selectedModules.length > 0 ? 1 : 0;
    const effectiveTotal = totalSteps - 1 + moduleWeight; // -1 for configure-module counted per module
    const effectiveCompleted = completedCount + (state.activeModuleConfig ? 0 : 0);
    return Math.min(100, Math.round((effectiveCompleted / effectiveTotal) * 100));
  }, [state.completedSteps.length, state.selectedModules.length, state.activeModuleConfig, totalSteps]);

  const canGoNext = useMemo(() => {
    switch (state.currentStep) {
      case "welcome":
        return true;
      case "company-profile":
        return state.companyProfile.name.length > 0;
      case "select-modules":
        return state.selectedModules.length > 0;
      case "configure-module":
        // All selected modules must be configured
        return state.selectedModules.every(
          (m) => state.moduleConfigs[m]?.enabled !== false
        );
      case "review":
        return false;
      default:
        return false;
    }
  }, [state]);

  const canGoPrev = useMemo(() => {
    return currentStepIndex > 0;
  }, [currentStepIndex]);

  const nextStep = useCallback(() => {
    if (!canGoNext) return;

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEP_ORDER.length) {
      setState((prev) => ({
        ...prev,
        currentStep: STEP_ORDER[nextIndex],
      }));
    }
  }, [canGoNext, currentStepIndex]);

  const prevStep = useCallback(() => {
    if (!canGoPrev) return;

    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setState((prev) => ({
        ...prev,
        currentStep: STEP_ORDER[prevIndex],
      }));
    }
  }, [canGoPrev, currentStepIndex]);

  const goToStep = useCallback((step: OnboardingStep) => {
    setState((prev) => ({
      ...prev,
      currentStep: step,
    }));
  }, []);

  const updateCompanyProfile = useCallback((profile: Partial<CompanyProfile>) => {
    setState((prev) => ({
      ...prev,
      companyProfile: {
        ...prev.companyProfile,
        ...profile,
      },
    }));
  }, []);

  const toggleModule = useCallback((module: ModuleType) => {
    setState((prev) => {
      const isSelected = prev.selectedModules.includes(module);
      const newSelected = isSelected
        ? prev.selectedModules.filter((m) => m !== module)
        : [...prev.selectedModules, module];

      return {
        ...prev,
        selectedModules: newSelected,
        moduleConfigs: {
          ...prev.moduleConfigs,
          [module]: {
            ...prev.moduleConfigs[module],
            enabled: !isSelected,
          },
        },
      };
    });
  }, []);

  const setSelectedModules = useCallback((modules: ModuleType[]) => {
    setState((prev) => ({
      ...prev,
      selectedModules: modules,
    }));
  }, []);

  const setActiveModuleConfig = useCallback((module: ModuleType | null) => {
    setState((prev) => ({
      ...prev,
      activeModuleConfig: module,
    }));
  }, []);

  const updateModuleConfig = useCallback((module: ModuleType, config: Partial<ModuleConfig>) => {
    setState((prev) => ({
      ...prev,
      moduleConfigs: {
        ...prev.moduleConfigs,
        [module]: {
          ...prev.moduleConfigs[module],
          ...config,
        },
      },
    }));
  }, []);

  const updateModuleSetting = useCallback((module: ModuleType, key: string, value: unknown) => {
    setState((prev) => ({
      ...prev,
      moduleConfigs: {
        ...prev.moduleConfigs,
        [module]: {
          ...prev.moduleConfigs[module],
          settings: {
            ...prev.moduleConfigs[module].settings,
            [key]: value,
          },
        },
      },
    }));
  }, []);

  const markStepComplete = useCallback((step: OnboardingStep) => {
    setState((prev) => {
      if (prev.completedSteps.includes(step)) return prev;
      return {
        ...prev,
        completedSteps: [...prev.completedSteps, step],
      };
    });
  }, []);

  const isStepComplete = useCallback(
    (step: OnboardingStep) => state.completedSteps.includes(step),
    [state.completedSteps]
  );

  return {
    state,
    nextStep,
    prevStep,
    goToStep,
    canGoNext,
    canGoPrev,
    updateCompanyProfile,
    toggleModule,
    setSelectedModules,
    setActiveModuleConfig,
    updateModuleConfig,
    updateModuleSetting,
    markStepComplete,
    isStepComplete,
    progressPercent,
    currentStepIndex,
    totalSteps,
    moduleDefinitions: MODULE_DEFINITIONS,
  };
}