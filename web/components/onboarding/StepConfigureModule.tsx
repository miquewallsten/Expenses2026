"use client";

import { Check, ChevronLeft, ChevronRight, Receipt, Clock, ShoppingCart, BookOpen, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModuleType, ModuleDefinition, ModuleConfig } from "@/types/onboarding";
import { QuestionCard } from "./QuestionCard";

interface StepConfigureModuleProps {
  modules: ModuleDefinition[];
  selectedModules: ModuleType[];
  moduleConfigs: Record<ModuleType, ModuleConfig>;
  activeModule: ModuleType | null;
  onSetActiveModule: (module: ModuleType | null) => void;
  onUpdateSetting: (module: ModuleType, key: string, value: unknown) => void;
}

const ICON_MAP: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  expenses: Receipt,
  timesheets: Clock,
  requests: ShoppingCart,
  accounting: BookOpen,
  ai: Sparkles,
};

export function StepConfigureModule({
  modules,
  selectedModules,
  moduleConfigs,
  activeModule,
  onSetActiveModule,
  onUpdateSetting,
}: StepConfigureModuleProps) {
  const t = useTranslations("admin.onboardingWizard.configureModule");

  const activeModuleDef = modules.find((m) => m.type === activeModule);
  const activeConfig = activeModule ? moduleConfigs[activeModule] : null;

  const handleAnswerChange = (questionId: string, configKey: string, value: string) => {
    if (activeModule) {
      onUpdateSetting(activeModule, configKey, value);
    }
  };

  const getAnswer = (configKey: string): string => {
    if (!activeConfig) return "";
    return String(activeConfig.settings[configKey] ?? "");
  };

  const isModuleConfigured = (moduleType: ModuleType): boolean => {
    const def = modules.find((m) => m.type === moduleType);
    if (!def) return false;
    const config = moduleConfigs[moduleType];
    return def.questions.every((q) => config.settings[q.configKey] !== undefined);
  };

  if (selectedModules.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-[11px] text-white/50">{t("noModulesSelected")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1 text-[11px] text-white/50">{t("subtitle")}</p>
      </div>

      {/* Module tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1">
        {selectedModules.map((moduleType) => {
          const def = modules.find((m) => m.type === moduleType);
          if (!def) return null;
          const Icon = ICON_MAP[moduleType];
          const isActive = activeModule === moduleType;
          const isConfigured = isModuleConfigured(moduleType);

          return (
            <button
              key={moduleType}
              type="button"
              onClick={() => onSetActiveModule(moduleType)}
              className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[10.5px] font-medium transition-colors ${
                isActive
                  ? "border-indigo-500/40 bg-indigo-500/[0.08] text-white/90"
                  : "border-white/[0.06] bg-white/[0.015] text-white/55 hover:border-white/[0.12] hover:bg-white/[0.03]"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{def.name}</span>
              {isConfigured && (
                <Check className="h-3 w-3 text-emerald-400/70" />
              )}
            </button>
          );
        })}
      </div>

      {/* Questions for active module */}
      {activeModuleDef && (
        <div className="space-y-4 rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
          <div className="flex items-center gap-2">
            {(() => {
              const Icon = ICON_MAP[activeModuleDef.type];
              return <Icon className="h-4 w-4 text-indigo-300/70" />;
            })()}
            <h3 className="text-[12px] font-medium text-white/80">{activeModuleDef.name}</h3>
          </div>

          <div className="space-y-4">
            {activeModuleDef.questions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                value={getAnswer(question.configKey) || question.default}
                onChange={(value) => handleAnswerChange(question.id, question.configKey, value)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Navigation between modules */}
      {selectedModules.length > 1 && activeModule && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              const currentIndex = selectedModules.indexOf(activeModule);
              if (currentIndex > 0) {
                onSetActiveModule(selectedModules[currentIndex - 1]);
              }
            }}
            disabled={selectedModules.indexOf(activeModule) === 0}
            className="flex items-center gap-1 text-[10px] text-white/45 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" />
            {t("prevModule")}
          </button>
          <button
            type="button"
            onClick={() => {
              const currentIndex = selectedModules.indexOf(activeModule);
              if (currentIndex < selectedModules.length - 1) {
                onSetActiveModule(selectedModules[currentIndex + 1]);
              }
            }}
            disabled={selectedModules.indexOf(activeModule) === selectedModules.length - 1}
            className="flex items-center gap-1 text-[10px] text-white/45 hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t("nextModule")}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}