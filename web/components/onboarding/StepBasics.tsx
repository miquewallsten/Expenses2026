"use client";

import { Building2, Globe, Clock, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CompanyProfile } from "@/types/onboarding";

interface StepBasicsProps {
  profile: Partial<CompanyProfile>;
  onUpdate: (profile: Partial<CompanyProfile>) => void;
}

const CURRENCIES = [
  { value: "MXN", label: "MXN — Peso Mexicano" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
];

const TIMEZONES = [
  { value: "America/Mexico_City", label: "Ciudad de Mexico" },
  { value: "America/New_York", label: "New York" },
  { value: "Europe/Madrid", label: "Madrid" },
  { value: "UTC", label: "UTC" },
];

const COUNTRIES = [
  { value: "MX", label: "Mexico" },
  { value: "US", label: "United States" },
  { value: "ES", label: "Spain" },
];

export function StepBasics({ profile, onUpdate }: StepBasicsProps) {
  const t = useTranslations("admin.onboardingWizard.basics");

  return (
    <div className="space-y-5 py-4">
      <div>
        <h2 className="text-[18px] font-semibold text-white/90">{t("title")}</h2>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/50">{t("subtitle")}</p>
      </div>

      <div className="space-y-3">
        {/* Company Name */}
        <div>
          <label htmlFor="company-name" className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
            <Building2 className="h-3 w-3" />
            {t("companyName")}
          </label>
          <input
            id="company-name"
            type="text"
            value={profile.name ?? ""}
            onChange={(e) => onUpdate({ name: e.target.value })}
            placeholder={t("companyNamePlaceholder")}
            autoFocus
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-white/85 placeholder:text-white/25 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Currency */}
          <div>
            <label htmlFor="currency" className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
              <Globe className="h-3 w-3" />
              {t("currency")}
            </label>
            <select
              id="currency"
              value={profile.currency ?? "MXN"}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label htmlFor="timezone" className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
              <Clock className="h-3 w-3" />
              {t("timezone")}
            </label>
            <select
              id="timezone"
              value={profile.timezone ?? "America/Mexico_City"}
              onChange={(e) => onUpdate({ timezone: e.target.value })}
              className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Country */}
        <div>
          <label htmlFor="country" className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
            <MapPin className="h-3 w-3" />
            {t("country")}
          </label>
          <select
            id="country"
            value={profile.country ?? "MX"}
            onChange={(e) => onUpdate({ country: e.target.value })}
            className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-[12px] text-white/85 focus:border-indigo-500/50 focus:outline-none focus:ring-1 focus:ring-indigo-500/25"
          >
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}