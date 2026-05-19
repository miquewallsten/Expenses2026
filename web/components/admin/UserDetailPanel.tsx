"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  UserCog,
} from "lucide-react";

interface UserFull {
  id: number;
  company_id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  department: string | null;
  job_title: string | null;
  phone: string | null;
  legal_entity_id: number | null;
  delegates_for_user_id: number | null;
  delegates_for_user_name: string | null;
  can_create_expenses: boolean;
  can_create_corporate_expenses: boolean;
  can_invoice_corporation: boolean;
  is_amex_reconciler: boolean;
  requires_time_tracking: boolean;
  has_executive_reporting: boolean;
  can_access_accounting: boolean;
  can_view_analytics: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  created_at: string;
  project_ids: number[];
}

interface LegalEntity {
  id: number;
  entity_name: string;
}

interface Props {
  user: UserFull;
  legalEntities: LegalEntity[];
  onBack: () => void;
  onEdit?: () => void;
}

const ROLE_ACCENTS: Record<string, { bg: string; text: string; border: string }> = {
  admin:      { bg: "bg-violet-500/10", text: "text-violet-300", border: "border-violet-500/20" },
  manager:    { bg: "bg-sky-500/10",    text: "text-sky-300",    border: "border-sky-500/20" },
  accounting: { bg: "bg-amber-500/10",  text: "text-amber-300",  border: "border-amber-500/20" },
  executive:  { bg: "bg-rose-500/10",   text: "text-rose-300",   border: "border-rose-500/20" },
  secretary:  { bg: "bg-purple-500/10", text: "text-purple-300", border: "border-purple-500/20" },
  employee:   { bg: "bg-surface-2",     text: "text-secondary",  border: "border-default" },
};

export default function UserDetailPanel({ user, legalEntities, onBack, onEdit }: Props) {
  const t = useTranslations("admin.users");

  const capabilityGroups = [
    {
      title: t("capGroupExpense"),
      capabilities: [
        { key: "can_create_expenses", label: t("capCreateExpenses"), desc: t("capCreateExpensesDesc") },
        { key: "can_create_corporate_expenses", label: t("capCorporateExpenses"), desc: t("capCorporateExpensesDesc") },
        { key: "can_invoice_corporation", label: t("capInvoiceCorporation"), desc: t("capInvoiceCorporationDesc") },
      ],
    },
    {
      title: t("capGroupAccounting"),
      capabilities: [
        { key: "can_access_accounting", label: t("capAccessAccounting"), desc: t("capAccessAccountingDesc") },
        { key: "can_view_analytics", label: t("capViewAnalytics"), desc: t("capViewAnalyticsDesc") },
      ],
    },
    {
      title: t("capGroupAddOns"),
      capabilities: [
        { key: "is_amex_reconciler", label: t("capAmexReconciler"), desc: t("capAmexReconcilerDesc") },
        { key: "requires_time_tracking", label: t("capTimeTracking"), desc: t("capTimeTrackingDesc") },
      ],
    },
  ];

  const roleAccent = ROLE_ACCENTS[user.role] ?? ROLE_ACCENTS.employee;
  const entityName = legalEntities.find((e) => e.id === user.legal_entity_id)?.entity_name ?? t("unassigned");
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : " - ";

  return (
    <div className="flex h-full flex-col">
      {/* Header - identity */}
      <div className="border-b border-subtle px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className="mb-3 text-muted transition-colors hover:text-primary"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-surface-3"}`} />
              <h2 className="truncate text-sm font-semibold text-primary">{user.full_name}</h2>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted">{user.email}</p>
          </div>
          <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${roleAccent.bg} ${roleAccent.text} ${roleAccent.border}`}>
            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Identity section */}
        <div className="border-b border-subtle px-5 py-4">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("identityLabel")}
          </p>
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldFullName")}</span>
              <span className="text-[12px] font-medium text-primary">{user.full_name}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldJobTitle")}</span>
              <span className="text-[12px] text-secondary">{user.job_title ?? " - "}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldDepartment")}</span>
              <span className="text-[12px] text-secondary">{user.department ?? " - "}</span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldPhone")}</span>
              <span className="text-[12px] text-secondary">{user.phone ?? " - "}</span>
            </div>
          </div>
        </div>

        {/* Role & Status */}
        <div className="border-b border-subtle px-5 py-4">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("roleLabel")} & {t("fieldStatus")}
          </p>
          <div className="space-y-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldRole")}</span>
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold ${roleAccent.bg} ${roleAccent.text} ${roleAccent.border}`}>
                {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-[10px] text-muted">{t("fieldStatus")}</span>
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${user.is_active ? "text-emerald-400" : "text-muted"}`}>
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-surface-3"}`} />
                {user.is_active ? t("statusActive") : t("statusInactive")}
              </span>
            </div>
          </div>
        </div>

        {/* Organization */}
        <div className="border-b border-subtle px-5 py-4">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("organisationLabel")}
          </p>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[10px] text-muted">{t("legalEntity")}</span>
            <span className="text-[12px] text-secondary">{entityName}</span>
          </div>
        </div>

        {/* Activity */}
        <div className="border-b border-subtle px-5 py-4">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("activityMetrics")}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="block text-[10px] text-muted">{t("created")}</span>
              <span className="block text-[12px] font-medium tabular-nums text-primary">{fmtDate(user.created_at)}</span>
            </div>
            <div>
              <span className="block text-[10px] text-muted">{t("lastLogin")}</span>
              <span className="block text-[12px] font-medium tabular-nums text-primary">{fmtDate(user.last_login_at)}</span>
            </div>
          </div>
        </div>

        {/* Capabilities */}
        <div className="px-5 py-4">
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("capabilitiesLabel")}
          </p>
          <div className="space-y-4">
            {capabilityGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-1.5 text-[10px] font-semibold text-tertiary">{group.title}</p>
                <div className="space-y-1">
                  {group.capabilities.map((cap) => {
                    const value = user[cap.key as keyof UserFull] as boolean;
                    return (
                      <div
                        key={cap.key}
                        className="flex items-center justify-between rounded-md px-2.5 py-1.5"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] text-primary">{cap.label}</p>
                          <p className="text-[9px] text-muted">{cap.desc}</p>
                        </div>
                        {value ? (
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-surface-3" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Delegation */}
            {user.role === "secretary" && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold text-tertiary">{t("delegation")}</p>
                <div className="flex items-baseline justify-between gap-4 rounded-md bg-surface-2 px-2.5 py-1.5">
                  <span className="text-[10px] text-muted">{t("delegatesFor")}</span>
                  <span className="text-[11px] text-primary">{user.delegates_for_user_name ?? t("noDelegation")}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-subtle p-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-default bg-surface-1 px-4 py-2 text-[11px] font-semibold text-secondary transition-colors hover:bg-surface-2 hover:text-primary"
        >
          <UserCog className="h-3.5 w-3.5" />
          {t("editPermissions")}
        </button>
      </div>
    </div>
  );
}
