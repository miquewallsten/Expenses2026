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
        <h2 className="text-[18px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">{t("subtitle")}</p>
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
                  ? "border-indigo-500/50 bg-indigo-500/[0.08]"
                  : "border-white/[0.06] bg-white/[0.01] hover:border-white/[0.12] hover:bg-white/[0.03]"
              }`}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
                  isSelected
                    ? "bg-indigo-500/25 text-indigo-300"
                    : "bg-white/[0.04] text-white/40 group-hover:bg-white/[0.06] group-hover:text-white/60"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>

              <div className="flex-1">
                <p
                  className={`text-[13px] font-medium transition-colors ${
                    isSelected ? "text-white" : "text-white/70 group-hover:text-white/90"
                  }`}
                >
                  {company.name}
                </p>
                <p
                  className={`mt-0.5 text-[10.5px] leading-relaxed transition-colors ${
                    isSelected ? "text-white/60" : "text-white/35 group-hover:text-white/50"
                  }`}
                >
                  {company.description}
                </p>
              </div>

              {isSelected && (
                <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/30">
                  <Check className="h-3 w-3 text-indigo-200" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}