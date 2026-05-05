"use client";

import { Check, Receipt, Clock, ShoppingCart, BookOpen, Sparkles, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ModuleType, ModuleConfig, ModuleDefinition } from "@/types/onboarding";

interface StepSmartConfigProps {
  modules: ModuleDefinition[];
  selectedModules: ModuleType[];
  moduleConfigs: Record<ModuleType, ModuleConfig>;
  companyType?: string;
}

const ICON_MAP: Record<ModuleType, React.ComponentType<{ className?: string }>> = {
  expenses: Receipt,
  timesheets: Clock,
  requests: ShoppingCart,
  accounting: BookOpen,
  ai: Sparkles,
};

// Default configurations based on module type
const DEFAULT_CONFIG_SUMMARY: Record<ModuleType, { setting: string; value: string }[]> = {
  expenses: [
    { setting: "Approval", value: "Manager approval required" },
    { setting: "CFDI", value: "Optional (receipts accepted)" },
    { setting: "Policy", value: "Warn on violations" },
  ],
  timesheets: [
    { setting: "Approval", value: "Manager approval" },
    { setting: "Projects", value: "Project tracking enabled" },
  ],
  requests: [
    { setting: "Approval", value: "Manager approval for all" },
    { setting: "Budget", value: "No budget tracking" },
  ],
  accounting: [
    { setting: "Export", value: "Manual export to accounting system" },
    { setting: "Chart of Accounts", value: "Use standard template" },
  ],
  ai: [
    { setting: "Auto-categorize", value: "Enabled" },
    { setting: "Copilot", value: "On-demand (user can open)" },
  ],
};

export function StepSmartConfig({
  modules,
  selectedModules,
  moduleConfigs,
}: StepSmartConfigProps) {
  const t = useTranslations("admin.onboardingWizard.smartConfig");

  return (
    <div className="space-y-5 py-4">
      <div>
        <h2 className="text-[18px] font-semibold text-primary">{t("title")}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">{t("subtitle")}</p>
      </div>

      {/* AI Configuration Summary */}
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <Check className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-[12px] font-medium text-secondary">
              {t("configuredTitle", { count: selectedModules.length })}
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-tertiary">
              {t("configuredDesc")}
            </p>
          </div>
        </div>
      </div>

      {/* Configured Modules */}
      <div className="space-y-3">
        {selectedModules.map((moduleType) => {
          const module = modules.find((m) => m.type === moduleType);
          if (!module) return null;
          const Icon = ICON_MAP[moduleType];
          const config = moduleConfigs[moduleType];
          const settings = DEFAULT_CONFIG_SUMMARY[moduleType];

          return (
            <div
              key={moduleType}
              className="rounded-lg border border-subtle bg-surface-0 overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-subtle bg-surface-1 px-4 py-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/15">
                  <Icon className="h-3.5 w-3.5 text-accent" />
                </div>
                <p className="text-[12px] font-medium text-secondary">{module.name}</p>
                <div className="ml-auto">
                  <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-300">
                    {t("configured")}
                  </span>
                </div>
              </div>
              <div className="px-4 py-2.5">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {settings.map(({ setting, value }) => (
                    <div key={setting} className="flex items-center gap-2">
                      <dt className="text-[10px] text-muted">{setting}</dt>
                      <dd className="text-[10.5px] text-secondary">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customize CTA */}
      <div className="rounded-lg border border-subtle bg-surface-0 p-3">
        <div className="flex items-center gap-2.5">
          <Settings2 className="h-4 w-4 text-tertiary" />
          <p className="text-[10.5px] text-secondary">
            {t("customizeHint")}
          </p>
        </div>
      </div>
    </div>
  );
}