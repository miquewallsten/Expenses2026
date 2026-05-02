"use client";

import { useEffect, useState, useCallback } from "react";
import { useUserContext } from "@/context/UserContext";
import { apiCall } from "@/lib/api/client";
import AdminNavigation, { type AdminSection } from "@/components/admin/AdminNavigation";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";
import AdminCompanySetupStudio from "@/components/admin/AdminCompanySetupStudio";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import AdminPoliciesPanel from "@/components/admin/AdminPoliciesPanel";
import AdminAccountingSetupStudio from "@/components/admin/AdminAccountingSetupStudio";
import AdminWorkflowMapPanel from "@/components/admin/AdminWorkflowMapPanel";
import AdminAgentChat from "@/components/agent/AdminAgentChat";
import AdminOnboardingCopilot from "@/components/admin/AdminOnboardingCopilot";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import AuditLogSection from "@/components/admin/sections/AuditLogSection";
import CfdiWatcherSection from "@/components/admin/sections/CfdiWatcherSection";
import IntegrationsSection from "@/components/admin/sections/IntegrationsSection";
import PlatformApiSection from "@/components/admin/sections/PlatformApiSection";
import RoutingRulesSection from "@/components/admin/sections/RoutingRulesSection";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AdminData {
  companySetup: any;
  users: any[];
  expensePolicy: any;
  accountingSetup: any;
  workflowSetup: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchAdminData(companyId: number): Promise<AdminData> {
  const [companySetup, users, expensePolicy, accountingSetup, workflowSetup] = await Promise.all([
    apiCall(`/admin/company-setup/${companyId}`).catch(() => null),
    apiCall<any[]>(`/users?company_id=${companyId}`).catch(() => []),
    apiCall(`/expenses/policy/${companyId}`).catch(() => null),
    apiCall(`/admin/accounting-setup/${companyId}`).catch(() => null),
    apiCall(`/admin/workflow-setup/${companyId}`).catch(() => null),
  ]);
  return {
    companySetup: companySetup ?? {},
    users: Array.isArray(users) ? users : [],
    expensePolicy: expensePolicy ?? {},
    accountingSetup: accountingSetup ?? {},
    workflowSetup: workflowSetup ?? {},
  };
}

export default function AdminModule() {
  const { companyId } = useUserContext();
  const [activeSection, setActiveSection] = useState<AdminSection>("company-setup");
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Determine if onboarding is incomplete once data loads
  useEffect(() => {
    if (!data) return;
    const setup = data.companySetup ?? {};
    const incomplete = !setup.onboarding_completed_at && (setup.onboarding_step ?? 0) < 6;
    setShowOnboarding(incomplete);
  }, [data]);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    fetchAdminData(companyId)
      .then((d) => {
        if (active) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: unknown) => {
        if (active) {
          const msg = e instanceof Error ? e.message : "Failed to load admin data";
          setError(msg);
        }
      });
    return () => {
      active = false;
    };
  }, [companyId, refreshKey]);

  const loading = data === null && error === null;

  const refreshCompanySetup = useCallback(
    (setup: any) => {
      setData((prev) => (prev ? { ...prev, companySetup: setup } : prev));
    },
    []
  );

  const refreshUsers = useCallback(
    (users: any[]) => {
      setData((prev) => (prev ? { ...prev, users } : prev));
    },
    []
  );

  const refreshExpensePolicy = useCallback(
    (policy: any) => {
      setData((prev) => (prev ? { ...prev, expensePolicy: policy } : prev));
    },
    []
  );

  const refreshAccountingSetup = useCallback(
    (setup: any) => {
      setData((prev) => (prev ? { ...prev, accountingSetup: setup } : prev));
    },
    []
  );

  const refreshWorkflowSetup = useCallback(
    (setup: any) => {
      setData((prev) => (prev ? { ...prev, workflowSetup: setup } : prev));
    },
    []
  );

  if (!companyId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[11px] text-white/40">No company context available</p>
      </div>
    );
  }

  // AI-guided onboarding takes over when the company hasn't completed setup yet.
  if (showOnboarding && data) {
    return (
      <AdminOnboardingCopilot
        companyId={companyId}
        onComplete={() => setShowOnboarding(false)}
        onSkip={() => setShowOnboarding(false)}
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full" data-testid="admin-module">
        <div className="hidden md:flex shrink-0 flex-col border-r border-white/[0.06] bg-zinc-950" style={{ width: "220px" }}>
          <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] px-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Administration</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-indigo-400/80" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full" data-testid="admin-module">
        <AdminNavigation activeSection={activeSection} onSelect={setActiveSection} />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-[11px] font-medium text-white/45">Failed to load admin data</p>
            <p className="mt-1 text-[10px] text-white/25">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-3 rounded border border-white/[0.07] bg-white/[0.02] px-3 py-1.5 text-[11px] text-white/55 transition-colors hover:bg-white/[0.04]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="admin-module">
      <AdminNavigation activeSection={activeSection} onSelect={setActiveSection} />
      <main className="min-h-0 flex-1 overflow-y-auto bg-zinc-950">
        {activeSection === "company-setup" && (
          <AdminCompanySetupStudio
            companyId={companyId}
            setup={data.companySetup}
            legalEntities={data.companySetup?.legal_entities ?? []}
            onSaved={refreshCompanySetup}
            onLegalEntitiesChanged={(entities) =>
              setData((prev) =>
                prev
                  ? {
                      ...prev,
                      companySetup: { ...prev.companySetup, legal_entities: entities },
                    }
                  : prev
              )
            }
          />
        )}
        {activeSection === "expense-policy" && (
          <AdminPoliciesPanel
            companyId={companyId}
            expensePolicy={data.expensePolicy}
            onExpensePolicySaved={refreshExpensePolicy}
          />
        )}
        {activeSection === "approval-workflow" && (
          <AdminWorkflowMapPanel
            companyId={companyId}
            workflowSetup={data.workflowSetup}
            companySetup={data.companySetup}
            expensePolicy={data.expensePolicy}
            accountingSetup={data.accountingSetup}
            onWorkflowSaved={refreshWorkflowSetup}
          />
        )}
        {activeSection === "users-roles" && (
          <AdminUsersPanel
            companyId={companyId}
            users={data.users}
            onUsersChanged={refreshUsers}
            companySetup={data.companySetup}
          />
        )}
        {activeSection === "accounting-setup" && (
          <AdminAccountingSetupStudio
            companyId={companyId}
            setup={data.accountingSetup}
            companySetup={data.companySetup}
            expensePolicy={data.expensePolicy}
            onSaved={refreshAccountingSetup}
          />
        )}
        {activeSection === "integrations" && <IntegrationsSection />}
        {activeSection === "ai-agent" && companyId != null && (
          <div className="min-h-0 flex-1 p-4">
            <AdminAgentChat companyId={companyId} variant="page" />
          </div>
        )}
        {activeSection === "audit-log" && <AuditLogSection />}
        {activeSection === "cfdi-watcher" && <CfdiWatcherSection />}
        {activeSection === "onboarding" && (
          <div className="h-full">
            <OnboardingWizard />
          </div>
        )}
        {activeSection === "platform-api" && <PlatformApiSection />}
        {activeSection === "routing-rules" && <RoutingRulesSection />}
        {activeSection === "advanced-settings" && (
          <div className="mx-auto max-w-xl p-4">
            <header className="mb-4">
              <h1 className="text-[13px] font-bold tracking-[-0.01em] text-white/85">Advanced Settings</h1>
              <p className="mt-0.5 text-[10.5px] text-white/40">Portal configuration and custom rules.</p>
            </header>
            <div className="rounded border border-white/[0.07] bg-white/[0.02] p-6 text-center">
              <p className="text-[11px] text-white/40">Advanced settings will appear here.</p>
            </div>
            <div className="mt-4">
              <AnnouncementPanel />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
