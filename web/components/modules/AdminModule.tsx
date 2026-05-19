"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserContext } from "@/context/UserContext";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { usePortalConfigContext } from "@/context/PortalConfigContext";
import {
  ADMIN_SETTINGS_VISIBILITY,
  ADMIN_OPS_VISIBILITY,
  getVisibleAdminSettingsSections,
  getVisibleAdminOpsSections,
} from "@/modules/my-work/moduleRegistry";
import type { ModuleVisibilityContext } from "@/types";
import { useAdminContext, type AdminSection } from "@/context/AdminContext";
import { apiCall } from "@/lib/api/client";
import AnnouncementPanel from "@/components/admin/AnnouncementPanel";
import AdminCompanySetupStudio from "@/components/admin/AdminCompanySetupStudio";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import AdminPoliciesPanel from "@/components/admin/AdminPoliciesPanel";






import AdminApprovalWorkflowPanel from "@/components/admin/AdminApprovalWorkflowPanel";
import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";

import IntegrationsHubSection from "@/components/admin/sections/IntegrationsHubSection";
import AddOnsSection from "@/components/admin/sections/AddOnsSection";

import AdminAccountingHub from "@/components/admin/AdminAccountingHub";
import AdminConfigOverview from "@/components/admin/AdminConfigOverview";
import AdminReportBuilderPanel from "@/components/admin/AdminReportBuilderPanel";
import AdminOperationsOverview from "@/components/admin/AdminOperationsOverview";
import { Settings, Bell, LayoutGrid } from "lucide-react";
import { useTranslations } from "next-intl";

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
  const { companyId, ...user } = useUserContext();
  const t = useTranslations("admin");
  const { activeSection, setActiveSection, setOnboardingCompleted } = useAdminContext();
  const { activeModule } = useMyWorkContext();
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Sync activeModule.adminSection -> activeSection
  useEffect(() => {
    const section = activeModule?.adminSection;
    if (section && section !== activeSection) {
      setActiveSection(section as any);
    }
  }, [activeModule?.adminSection, activeSection, setActiveSection]);

  // ── Admin section visibility ──────────────────────────────────────────────
  // Gate which sections the current user can see based on role/permissions/capabilities.
  const portalCfg = usePortalConfigContext();

  const adminVisCtx: ModuleVisibilityContext = useMemo(() => ({
    role: user.role,
    permissionKeys: user.permissionKeys,
    derived: portalCfg.effectiveConfig?.derived ?? null,
    capabilities: user.capabilities,
  }), [user.role, user.permissionKeys, user.capabilities, portalCfg.effectiveConfig?.derived]);

  const visibleSettingIds = useMemo(
    () => new Set(getVisibleAdminSettingsSections(adminVisCtx).map((s) => s.id)),
    [adminVisCtx],
  );
  const visibleOpsIds = useMemo(
    () => new Set(getVisibleAdminOpsSections(adminVisCtx).map((s) => s.id)),
    [adminVisCtx],
  );

  function canSeeSection(id: string): boolean {
    return visibleSettingIds.has(id) || visibleOpsIds.has(id) || id === "overview" || id === "operations";
  }

  // ── Auto-redirect if active section becomes invisible ──────────────────────
  // If the user's active section is no longer visible (e.g. role changed),
  // redirect to "overview" which is always visible.
  const allVisibleIds = useMemo(
    () => new Set([...visibleSettingIds, ...visibleOpsIds, "overview", "operations"]),
    [visibleSettingIds, visibleOpsIds],
  );

  useEffect(() => {
    if (activeSection && !allVisibleIds.has(activeSection)) {
      setActiveSection("overview");
    }
  }, [activeSection, allVisibleIds, setActiveSection]);

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
          const msg = e instanceof Error ? e.message : t("failedToLoadAdmin");
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
          <p className="text-sm font-medium text-primary">{t("failedToLoadAdmin")}</p>
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
    <main className="min-h-0 h-full flex-1 overflow-y-auto bg-surface-0 pb-20 scroll-smooth" data-testid="admin-module">
        <div className="mx-auto max-w-5xl px-8 py-8 space-y-10">
          {activeSection === "overview" && (
            <AdminConfigOverview
              portalConfig={data.portalConfig}
              companySetup={data.companySetup}
              expensePolicy={data.expensePolicy}
              accountingSetup={data.accountingSetup}
              approvalSetup={data.approvalSetup}
              workflowSetup={data.workflowSetup}
              companyId={companyId}
              onNavigate={(section: any) => {
                const map: Record<string, AdminSection> = {
                  "Company Setup": "company-setup",
                  "Rules": "expense-policy",
                  "Workflow": "approval-workflow",
                  "Onboarding": "onboarding",
                  "Add-Ons": "addons",
                  "Accounting Setup": "accounting-setup",
                  "Report Builder": "report-builder",
                  "Users & Roles": "users-roles",
                  "Integrations": "integrations",
                  "Notifications": "notifications",
                  "Audit Log": "audit-log",
                  "Operations": "operations",
                };
                setActiveSection(map[section] || (section as AdminSection));
              }}
            />
          )}

          {activeSection === "operations" && companyId && (
            <AdminOperationsOverview companyId={companyId} />
          )}

          {activeSection === "company-setup" && canSeeSection("company-setup") && (
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

          {activeSection === "expense-policy" && canSeeSection("expense-policy") && (
            <AdminPoliciesPanel
              companyId={companyId}
              expensePolicy={data.expensePolicy}
              onExpensePolicySaved={refreshExpensePolicy}
            />
          )}

          {activeSection === "approval-workflow" && canSeeSection("approval-workflow") && (
            <AdminApprovalWorkflowPanel
              companyId={companyId}
              workflowSetup={data.workflowSetup}
              approvalSetup={data.approvalSetup}
              companySetup={data.companySetup}
              expensePolicy={data.expensePolicy}
              accountingSetup={data.accountingSetup}
              onSaved={refreshWorkflowSetup}
            />
          )}

          {activeSection === "users-roles" && canSeeSection("users-roles") && (
            <AdminUsersPanel
              companyId={companyId}
              users={data.users}
              onUsersChanged={refreshUsers}
              companySetup={data.companySetup}
            />
          )}

          {activeSection === "addons" && canSeeSection("addons") && (
            <AddOnsSection companyId={companyId} companySetup={data.companySetup} onNavigate={(section) => setActiveSection(section as AdminSection)} />
          )}
          {activeSection === "integrations" && canSeeSection("integrations") && <IntegrationsHubSection />}
          
          {activeSection === "notifications" && canSeeSection("notifications") && (
            <div className="space-y-6">
              <AnnouncementPanel />
            </div>
          )}

          {activeSection === "accounting-setup" && canSeeSection("accounting-setup") && (
            <AdminAccountingHub
              companyId={companyId}
              setup={data.accountingSetup}
              companySetup={data.companySetup}
              expensePolicy={data.expensePolicy}
              onSaved={refreshAccountingSetup}
            />
          )}

          {activeSection === "report-builder" && canSeeSection("report-builder") && companyId && (
            <AdminReportBuilderPanel companyId={companyId} />
          )}

          {activeSection === "audit-log" && canSeeSection("audit-log") && companyId && (
            <AdminOperationsOverview companyId={companyId} />
          )}
        </div>
      </main>
  );
}
