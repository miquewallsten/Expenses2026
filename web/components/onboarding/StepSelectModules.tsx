"use client";

import { useTranslations } from "next-intl";
import type { ModuleType, ModuleDefinition } from "@/types/onboarding";
import { ModuleCard } from "./ModuleCard";

interface StepSelectModulesProps {
  modules: ModuleDefinition[];
  selectedModules: ModuleType[];
  onToggle: (module: ModuleType) => void;
}

export function StepSelectModules({
  modules,
  selectedModules,
  onToggle,
}: StepSelectModulesProps) {
  const t = useTranslations("admin.onboardingWizard.selectModules");

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1 text-[11px] text-white/50">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {modules.map((module) => (
          <ModuleCard
            key={module.type}
            module={module}
            selected={selectedModules.includes(module.type)}
            onToggle={() => onToggle(module.type)}
          />
        ))}
      </div>

      <p className="text-[10px] text-white/35">{t("hint")}</p>
    </div>
  );
}