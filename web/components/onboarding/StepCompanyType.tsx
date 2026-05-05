"use client";

import { Rocket, Briefcase, Factory, Store, Building2, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CompanyType } from "@/types/onboarding";
import { COMPANY_TYPES } from "@/types/onboarding";

interface StepCompanyTypeProps {
  selectedType?: CompanyType;
  onSelect: (type: CompanyType) => void;
}

const ICON_MAP: Record<CompanyType, React.ComponentType<{ className?: string }>> = {
  "tech-startup": Rocket,
  "professional-services": Briefcase,
  manufacturing: Factory,
  retail: Store,
  other: Building2,
};

export function StepCompanyType({ selectedType, onSelect }: StepCompanyTypeProps) {
  const t = useTranslations("admin.onboardingWizard.companyType");

  return (
    <div className="space-y-5 py-4">
      <div>
        <h2 className="text-[18px] font-semibold text-primary">{t("title")}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-secondary">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {COMPANY_TYPES.map((company) => {
          const Icon = ICON_MAP[company.type];
          const isSelected = selectedType === company.type;

          return (
            <button
              key={company.type}
              type="button"
              onClick={() => onSelect(company.type)}
              className={`group relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all ${
                isSelected
                  ? "border-blue-500/50 bg-blue-500/[0.08]"
                  : "border-subtle bg-surface-0 hover:border-default hover:bg-surface-1"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isSelected
                    ? "bg-blue-500/25 text-accent"
                    : "bg-surface-2 text-tertiary group-hover:bg-surface-3 group-hover:text-secondary"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1">
                <p
                  className={`text-[13px] font-medium transition-colors ${
                    isSelected ? "text-primary" : "text-secondary group-hover:text-primary/90"
                  }`}
                >
                  {company.name}
                </p>
                <p
                  className={`mt-0.5 text-[10.5px] leading-relaxed transition-colors ${
                    isSelected ? "text-secondary" : "text-muted group-hover:text-secondary"
                  }`}
                >
                  {company.description}
                </p>
              </div>

              {isSelected && (
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-accent-muted">
                  <Check className="h-3 w-3 text-accent" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}