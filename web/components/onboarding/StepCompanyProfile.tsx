"use client";

import { useTranslations } from "next-intl";
import type { CompanyProfile } from "@/types/onboarding";

interface StepCompanyProfileProps {
  profile: CompanyProfile;
  onUpdate: (profile: Partial<CompanyProfile>) => void;
}

const CURRENCIES = [
  { value: "MXN", label: "MXN - Peso Mexicano" },
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
];

const TIMEZONES = [
  { value: "America/Mexico_City", label: "Ciudad de Mexico" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "UTC", label: "UTC" },
];

const INDUSTRIES = [
  { value: "", label: "Seleccionar..." },
  { value: "technology", label: "Tecnologia" },
  { value: "finance", label: "Finanzas" },
  { value: "manufacturing", label: "Manufactura" },
  { value: "retail", label: "Retail" },
  { value: "services", label: "Servicios" },
  { value: "other", label: "Otro" },
];

export function StepCompanyProfile({ profile, onUpdate }: StepCompanyProfileProps) {
  const t = useTranslations("admin.onboardingWizard.companyProfile");

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[15px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1 text-[11px] text-white/50">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label htmlFor="company-name" className="block text-[10px] font-medium text-white/60">
            {t("companyName")}
          </label>
          <input
            id="company-name"
            type="text"
            value={profile.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("companyNamePlaceholder")}
            className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/85 placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="currency" className="block text-[10px] font-medium text-white/60">
              {t("currency")}
            </label>
            <select
              id="currency"
              value={profile.currency}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="timezone" className="block text-[10px] font-medium text-white/60">
              {t("timezone")}
            </label>
            <select
              id="timezone"
              value={profile.timezone}
              onChange={(e) => onUpdate({ timezone: e.target.value })}
              className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="industry" className="block text-[10px] font-medium text-white/60">
              {t("industry")}
            </label>
            <select
              id="industry"
              value={profile.industry ?? ""}
              onChange={(e) => onUpdate({ industry: e.target.value })}
              className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              {INDUSTRIES.map((ind) => (
                <option key={ind.value} value={ind.value}>
                  {ind.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="country" className="block text-[10px] font-medium text-white/60">
              {t("country")}
            </label>
            <select
              id="country"
              value={profile.country ?? "MX"}
              onChange={(e) => onUpdate({ country: e.target.value })}
              className="mt-1 w-full rounded border border-white/[0.08] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              <option value="MX">Mexico</option>
              <option value="US">United States</option>
              <option value="ES">Spain</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}