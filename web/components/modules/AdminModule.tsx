"use client";

import { useEffect, useState, useCallback } from "react";
import { useUserContext } from "@/context/UserContext";
import { useAdminContext, type AdminSection } from "@/context/AdminContext";
import { apiCall } from "@/lib/api/client";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";
import AdminCompanySetupStudio from "@/components/admin/AdminCompanySetupStudio";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import AdminPoliciesPanel from "@/components/admin/AdminPoliciesPanel";
import AdminAccountingSetupStudio from "@/components/admin/AdminAccountingSetupStudio";
import AdminWorkflowMapPanel from "@/components/admin/AdminWorkflowMapPanel";
import AdminOnboardingCopilot from "@/components/admin/AdminOnboardingCopilot";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import AuditLogSection from "@/components/admin/sections/AuditLogSection";
import CfdiWatcherSection from "@/components/admin/sections/CfdiWatcherSection";
import ExportSection from "@/components/admin/sections/ExportSection";
import IntegrationsSection from "@/components/admin/sections/IntegrationsSection";
import PlatformApiSection from "@/components/admin/sections/PlatformApiSection";
import AdminOverviewPanel from "@/components/admin/AdminOverviewPanel";
import { Settings, Bell, LayoutGrid } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */
interface AdminData {
  companySetup: any;
  users: any[];
  expensePolicy: any;
  accountingSetup: any;
  workflowSetup: any;
  approvalSetup: any;
  portalConfig: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function fetchAdminData(companyId: number): Promise<AdminData> {
  const [companySetup, users, expensePolicy, accountingSetup, workflowSetup, approvalSetup, portalConfig] = await Promise.all([
    apiCall(`/admin/company-setup/${companyId}`).catch(() => null),
    apiCall<any[]>(`/users?company_id=${companyId}`).catch(() => []),
    apiCall(`/expenses/policy/${companyId}`).catch(() => null),
    apiCall(`/admin/accounting-setup/${companyId}`).catch(() => null),
    apiCall(`/admin/workflow-setup/${companyId}`).catch(() => null),
    apiCall(`/admin/approval-setup/${companyId}`).catch(() => null),
    apiCall(`/admin/portal-config/${companyId}`).catch(() => null),
  ]);
  return {
    companySetup: companySetup ?? {},
    users: Array.isArray(users) ? users : [],
    expensePolicy: expensePolicy ?? {},
    accountingSetup: accountingSetup ?? {},
    workflowSetup: workflowSetup ?? {},
    approvalSetup: approvalSetup ?? {},
    portalConfig: portalConfig ?? {},
  };
}

export default function AdminModule() {
  const { companyId } = useUserContext();
  const { activeSection, setActiveSection, setOnboardingCompleted } = useAdminContext();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Determine if onboarding is incomplete once data loads
  const onboardingCompleted = data?.companySetup?.onboarding_completed_at != null;

  // Sync onboarding completed state to context
  useEffect(() => {
    setOnboardingCompleted(onboardingCompleted);
  }, [onboardingCompleted, setOnboardingCompleted]);

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
      <div className="flex h-full items-center justify-center bg-surface-0">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-surface-2">
            <Settings className="h-5 w-5 text-muted" />
          </div>
          <p className="text-xs text-tertiary">No company context available</p>
        </div>
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
      <div className="flex h-full items-center justify-center bg-surface-0" data-testid="admin-module">
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <div className="h-8 w-8 animate-spin rounded-lg border-2 border-accent border-t-transparent" />
            <div className="absolute inset-0 h-8 w-8 animate-pulse rounded-lg bg-accent-muted" />
          </div>
          <p className="text-xs text-tertiary">Loading configuration...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-0" data-testid="admin-module">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-error-muted">
            <Settings className="h-5 w-5 text-error" />
          </div>
          <p className="text-sm font-medium text-primary">Failed to load admin data</p>
          <p className="mt-1 text-xs text-tertiary">{error}</p>
          <button
            type="button"
            onClick={load}
            className="btn btn-primary mt-4"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-0 h-full flex-1 overflow-y-auto bg-surface-0" data-testid="admin-module">
        {activeSection === "overview" && (
          <div className="p-6">
            <header className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 border border-accent/20">
                  <LayoutGrid className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h1 className="text-base font-semibold text-primary">Admin Overview</h1>
                  <p className="text-xs text-tertiary">Monitor and manage your organization's configuration</p>
                </div>
              </div>
            </header>
            <AdminOverviewPanel
              portalConfig={data.portalConfig}
              companySetup={data.companySetup}
              expensePolicy={data.expensePolicy}
              accountingSetup={data.accountingSetup}
              approvalSetup={data.approvalSetup}
              workflowSetup={data.workflowSetup}
              onNavigate={(section: any) => {
                const map: Record<string, AdminSection> = {
                  "Company Setup": "company-setup",
                  "Rules": "expense-policy",
                  "Accounting Setup": "accounting-setup",
                  "Workflow": "approval-workflow",
                  "Onboarding": "onboarding"
                };
                setActiveSection(map[section] || "overview");
              }}
            />
          </div>
        )}
        {activeSection === "onboarding" && (
          <div className="h-full">
            <OnboardingWizard />
          </div>
        )}
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
        {activeSection === "platform-api" && <PlatformApiSection />}
        {activeSection === "export" && <ExportSection />}
        {activeSection === "audit-log" && <AuditLogSection />}
        {activeSection === "cfdi-watcher" && <CfdiWatcherSection />}
        {activeSection === "notifications" && (
          <div className="p-6">
            <header className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-muted to-accent/20 border border-accent/30">
                  <Bell className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <h1 className="text-base font-semibold text-primary">Notifications</h1>
                  <p className="text-xs text-tertiary">Send announcements and manage notifications</p>
                </div>
              </div>
            </header>
            <AnnouncementPanel />
          </div>
        )}
      </main>
  );
}