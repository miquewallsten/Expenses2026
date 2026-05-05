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
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-success-muted">
        <Check className="h-7 w-7 text-success" />
      </div>

      <h2 className="mt-4 text-[20px] font-semibold text-primary">
        {t("title")}
      </h2>

      <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-secondary">
        {t("subtitle", { company: companyProfile.name || t("yourCompany") })}
      </p>

      {/* Configuration Summary */}
      <div className="mt-6 w-full max-w-xs rounded-lg border border-subtle bg-surface-1 p-4 text-left">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {t("configured")}
        </p>

        <p className="mt-2 text-[12px] font-medium text-secondary">
          {companyProfile.name || t("yourCompany")}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {moduleNames.map((name) => (
            <span
              key={name}
              className="rounded bg-blue-500/15 px-1.5 py-0.5 text-[9px] font-medium text-accent"
            >
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Next Steps */}
      <div className="mt-6 w-full max-w-xs space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
          {t("nextSteps")}
        </p>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-default hover:bg-surface-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
            <Users className="h-4 w-4 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-secondary">{t("inviteTeam")}</p>
            <p className="text-[10px] text-tertiary">{t("inviteTeamDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-default hover:bg-surface-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <Receipt className="h-4 w-4 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-secondary">{t("tryExpense")}</p>
            <p className="text-[10px] text-tertiary">{t("tryExpenseDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        </button>

        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-subtle bg-surface-1 p-3 text-left transition-colors hover:border-default hover:bg-surface-2"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <BookOpen className="h-4 w-4 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-secondary">{t("connectAccounting")}</p>
            <p className="text-[10px] text-tertiary">{t("connectAccountingDesc")}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted" />
        </button>
      </div>

      {/* AI Handoff */}
      <div className="mt-6 w-full max-w-xs rounded-lg border bg-accent-muted-muted bg-accent-muted p-3">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-accent" />
          <p className="text-[10.5px] text-secondary">
            {t("aiHandoff")}
          </p>
        </div>
      </div>

      {/* Open Dashboard Button */}
      <button
        type="button"
        onClick={onComplete}
        className="mt-6 flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-2.5 text-[12px] font-medium text-primary shadow-sm transition-colors hover:bg-emerald-600"
      >
        <Rocket className="h-4 w-4" />
        {t("openDashboard")}
      </button>
    </div>
  );
}