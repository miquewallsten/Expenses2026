"use client";

import { useEffect, useState } from "react";
import { OnboardingWizard } from "./OnboardingWizard";

interface OnboardingGuardProps {
  children: React.ReactNode;
  companyId: number;
}

interface OnboardingStatus {
  completed: boolean;
  started_at: string | null;
  completed_at: string | null;
  current_step: string | null;
  saved_state: Record<string, unknown> | null;
}

export function OnboardingGuard({ children, companyId }: OnboardingGuardProps) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    // Fetch onboarding status
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/onboarding/${companyId}/status`, {
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          setStatus(data);
          setShowOnboarding(!data.completed);
        } else {
          // If endpoint doesn't exist or error, assume not completed
          setShowOnboarding(true);
        }
      } catch {
        // On error, show onboarding to be safe
        setShowOnboarding(true);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [companyId]);

  const handleComplete = async () => {
    // Mark onboarding as complete
    setShowOnboarding(false);
    // Refresh status
    setStatus((prev) => prev ? { ...prev, completed: true } : null);
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500/30 border-t-indigo-500" />
          <p className="text-[11px] text-white/40">Loading...</p>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={handleComplete} />;
  }

  return <>{children}</>;
}