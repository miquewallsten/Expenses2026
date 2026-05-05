"use client";

import { Check, Receipt, Clock, ShoppingCart, BookOpen, Sparkles, Plus, Minus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModuleType, ModuleRecommendation } from "@/types/onboarding";
import { MODULE_DEFINITIONS } from "@/types/onboarding";

interface StepRecommendationsProps {
  recommendations: ModuleRecommendation[];
  selectedModules: ModuleType[];
  onToggle: (module: ModuleType) => void;
  onApplyAll: () => void;
}

const ICON_MAP: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  expenses: Receipt,
  timesheets: Clock,
  requests: ShoppingCart,
  accounting: BookOpen,
  ai: Sparkles,
};

export function StepRecommendations({
  recommendations,
  selectedModules,
  onToggle,
  onApplyAll,
}: StepRecommendationsProps) {
  const t = useTranslations("admin.onboardingWizard.recommendations");

  const recommendedModules = recommendations.map((r) => r.module);
  const allRecommendedSelected =
    recommendedModules.length > 0 && recommendedModules.every((m) => selectedModules.includes(m));

  return (
    <div className="space-y-5 py-4">
      <div>
        <h2 className="text-[18px] font-semibold text-primary">{t("title")}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">{t("subtitle")}</p>
      </div>

      {/* AI Recommendation Summary */}
      <div className="rounded-lg border bg-accent-muted-muted bg-accent-muted p-3">
        <p className="text-[11px] leading-relaxed text-secondary">
          {t("aiSummary", { count: recommendations.length })}
        </p>
        {!allRecommendedSelected && (
          <button
            type="button"
            onClick={onApplyAll}
            className="mt-2 text-[10.5px] font-medium text-accent hover:text-accent"
          >
            {t("applyAll")}
          </button>
        )}
      </div>

      {/* Recommended Modules */}
      <div className="space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {t("recommended")}
        </p>
        {recommendations.map((rec) => {
          const module = MODULE_DEFINITIONS.find((m) => m.type === rec.module);
          if (!module) return null;
          const Icon = ICON_MAP[rec.module];
          const isSelected = selectedModules.includes(rec.module);

          return (
            <div
              key={rec.module}
              className={`rounded-lg border transition-all ${
                isSelected
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : "border-subtle bg-surface-0 hover:border-default"
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(rec.module)}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                    isSelected
                      ? "bg-success-muted text-emerald-300"
                      : "bg-surface-2 text-tertiary"
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-[12px] font-medium transition-colors ${
                        isSelected ? "text-primary" : "text-secondary"
                      }`}
                    >
                      {module.name}
                    </p>
                    {isSelected && (
                      <span className="rounded bg-success-muted px-1.5 py-0.5 text-[8px] font-medium text-emerald-300">
                        {t("selected")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[10.5px] leading-relaxed text-tertiary">
                    {rec.reason}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {rec.keyFeatures.map((feature) => (
                      <span
                        key={feature}
                        className="rounded bg-surface-2 px-1.5 py-0.5 text-[9px] text-muted"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 self-center">
                  {isSelected ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-success-muted">
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border border-subtle text-muted">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Optional Modules */}
      {MODULE_DEFINITIONS.filter((m) => !recommendedModules.includes(m.type)).length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {t("optional")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MODULE_DEFINITIONS.filter((m) => !recommendedModules.includes(m.type)).map((module) => {
              const Icon = ICON_MAP[module.type];
              const isSelected = selectedModules.includes(module.type);

              return (
                <button
                  key={module.type}
                  type="button"
                  onClick={() => onToggle(module.type)}
                  className={`flex items-center gap-2 rounded-lg border p-2.5 text-left transition-all ${
                    isSelected
                      ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                      : "border-subtle bg-surface-0 hover:border-default"
                  }`}
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                      isSelected ? "bg-success-muted text-emerald-300" : "bg-surface-2 text-tertiary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`truncate text-[11px] font-medium ${isSelected ? "text-primary" : "text-secondary"}`}
                    >
                      {module.name}
                    </p>
                    <p className="truncate text-[9px] text-muted">{module.description}</p>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-300" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}