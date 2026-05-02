"use client";

import { Check, Receipt, Clock, ShoppingCart, BookOpen, Sparkles, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModuleType, CompanyProfile, ModuleConfig, ModuleDefinition } from "@/types/onboarding";

interface StepReviewProps {
  companyProfile: CompanyProfile;
  selectedModules: ModuleType[];
  moduleConfigs: Record<ModuleType, ModuleConfig>;
  moduleDefinitions: ModuleDefinition[];
  onEditStep: (step: "company-profile" | "select-modules" | "configure-module") => void;
  onComplete: () => void;
}

const ICON_MAP: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  expenses: Receipt,
  timesheets: Clock,
  requests: ShoppingCart,
  accounting: BookOpen,
  ai: Sparkles,
};

const CURRENCY_LABELS: Record<string, string> = {
  MXN: "Peso Mexicano",
  USD: "US Dollar",
  EUR: "Euro",
};

export function StepReview({
  companyProfile,
  selectedModules,
  moduleConfigs,
  moduleDefinitions,
  onEditStep,
  onComplete,
}: StepReviewProps) {
  const t = useTranslations("admin.onboardingWizard.review");

  const getModuleDef = (type: ModuleType) => moduleDefinitions.find((m) => m.type === type);

  const getSettingLabel = (module: ModuleType, configKey: string): string => {
    const def = getModuleDef(module);
    if (!def) return "";
    const question = def.questions.find((q) => q.configKey === configKey);
    if (!question) return "";
    const value = moduleConfigs[module]?.settings[configKey];
    const option = question.options.find((o) => o.value === value);
    return option?.label ?? question.default;
  };

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1 text-[11px] text-white/50">{t("subtitle")}</p>
      </div>

      {/* Company Profile Summary */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            {t("companyProfile")}
          </h3>
          <button
            type="button"
            onClick={() => onEditStep("company-profile")}
            className="flex items-center gap-1 text-[10px] text-indigo-300/70 hover:text-indigo-300"
          >
            <Pencil className="h-3 w-3" />
            {t("edit")}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-white/35">{t("companyName")}</p>
            <p className="mt-0.5 text-[12px] text-white/80">{companyProfile.name || "-"}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/35">{t("currency")}</p>
            <p className="mt-0.5 text-[12px] text-white/80">
              {CURRENCY_LABELS[companyProfile.currency] ?? companyProfile.currency}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/35">{t("timezone")}</p>
            <p className="mt-0.5 text-[12px] text-white/80">{companyProfile.timezone}</p>
          </div>
          <div>
            <p className="text-[10px] text-white/35">{t("country")}</p>
            <p className="mt-0.5 text-[12px] text-white/80">{companyProfile.country ?? "-"}</p>
          </div>
        </div>
      </div>

      {/* Modules Summary */}
      <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-medium uppercase tracking-wide text-white/50">
            {t("modules")}
          </h3>
          <button
            type="button"
            onClick={() => onEditStep("select-modules")}
            className="flex items-center gap-1 text-[10px] text-indigo-300/70 hover:text-indigo-300"
          >
            <Pencil className="h-3 w-3" />
            {t("edit")}
          </button>
        </div>

        <div className="mt-3 space-y-2">
          {selectedModules.map((moduleType) => {
            const def = getModuleDef(moduleType);
            if (!def) return null;
            const Icon = ICON_MAP[moduleType];
            return (
              <div
                key={moduleType}
                className="flex items-start gap-2 rounded border border-white/[0.04] bg-white/[0.01] p-2"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-500/15 text-indigo-300/70">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] font-medium text-white/80">{def.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {def.questions.map((q) => (
                      <span
                        key={q.id}
                        className="rounded-full border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[9px] text-white/45"
                      >
                        {getSettingLabel(moduleType, q.configKey)}
                      </span>
                    ))}
                  </div>
                </div>
                <Check className="h-4 w-4 text-emerald-400/70" />
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onEditStep("configure-module")}
          className="mt-2 text-[10px] text-indigo-300/70 hover:text-indigo-300"
        >
          {t("editConfig")}
        </button>
      </div>

      {/* Complete Button */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onComplete}
          className="w-full rounded-md bg-emerald-500 px-4 py-2.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          {t("completeSetup")}
        </button>
        <p className="mt-2 text-center text-[10px] text-white/35">{t("completeHint")}</p>
      </div>
    </div>
  );
}