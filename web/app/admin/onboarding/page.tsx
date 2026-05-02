"use client";

/**
 * Standalone /admin/onboarding route — thin wrapper around OnboardingWizard.
 * Embedded version lives in /admin worklist as case "Onboarding".
 */

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronLeft, Sparkles } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding";

export default function OnboardingPage() {
  const t = useTranslations("admin.onboarding");

  const handleComplete = () => {
    // TODO: Navigate to admin dashboard or show success message
    window.location.href = "/admin";
  };

  return (
    <div className="min-h-screen bg-zinc-950">
      <header className="border-b border-white/[0.06] bg-zinc-950/90 px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-[10.5px] text-white/40 hover:text-white/65"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t("backToAdmin")}
          </Link>
          <div className="flex items-center gap-1.5 text-[10.5px] text-white/45">
            <Sparkles className="h-3 w-3" />
            {t("subtitle")}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <OnboardingWizard onComplete={handleComplete} />
      </div>
    </div>
  );
}