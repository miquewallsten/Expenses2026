"use client";

import { Check, Rocket, Users, Receipt, BookOpen, ArrowRight, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CompanyProfile, ModuleType } from "@/types/onboarding";
import { MODULE_DEFINITIONS } from "@/types/onboarding";

interface StepReadyProps {
  companyProfile: CompanyProfile;
  selectedModules: ModuleType[];
  onComplete: () => void;
}

export function StepReady({ companyProfile, selectedModules, onComplete }: StepReadyProps) {
  const t = useTranslations("admin.onboardingWizard.ready");

  const moduleNames = selectedModules
    .map((m) => MODULE_DEFINITIONS.find((def) => def.type === m)?.name)
    .filter(Boolean);

  return (
    <div className="flex flex-col items-center py-8 text-center">
      {/* Success Icon */}
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
        <Check className="h-7 w-7 text-emerald-400" />
      </div>

      <h2 className="mt-4 text-[20px] font-semibold text-white/90">
        {t("title")}
      </h2>

      <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-white/50">
        {t("subtitle", { company: companyProfile.name || t("yourCompany") })}
      </p>

      {/* Configuration Summary */}
      <div className="mt-6 w-full max-w-xs rounded-lg border border-white/[0.06] bg-white/[0.02] p-4 text-left">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">
          {t("configured")}
        </p>

        <p className="mt-2 text-[12px] font-medium text-white/80">
          {companyProfile.name || t("yourCompany")}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {moduleNames.map((name) => (
            <span
              key={name}
              className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 w-full max-w-xs space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/35">
          {t("nextSteps")}
        </p>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
            <Users className="h-4 w-4 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/80">{t("inviteTeam")}</p>
            <p className="text-[10px] text-white/40">{t("inviteTeamDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <Receipt className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/80">{t("tryExpense")}</p>
            <p className="text-[10px] text-white/40">{t("tryExpenseDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-left transition-colors hover:border-white/[0.12] hover:bg-white/[0.04]"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <BookOpen className="h-4 w-4 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/80">{t("connectAccounting")}</p>
            <p className="text-[10px] text-white/40">{t("connectAccountingDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
        </button>
      </div>

      {/* AI Handoff */}
      <div className="mt-6 w-full max-w-xs rounded-lg border border-indigo-500/25 bg-indigo-500/[0.04] p-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-indigo-300" />
          <p className="text-[10.5px] text-white/60">
            {t("aiHandoff")}
          </p>
        </div>
      </div>

      {/* Open Dashboard Button */}
      <button
        type="button"
        onClick={onComplete}
        className="mt-6 flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2.5 text-[12px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-600"
      >
        <Rocket className="h-4 w-4" />
        {t("openDashboard")}
      </button>
    </div>
  );
}