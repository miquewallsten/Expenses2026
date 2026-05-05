"use client";

import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Building,
  Calendar,
  Clock,
  Receipt,
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
  onSaved: (user: UserFull) => void;
  onBack: () => void;
  onEdit?: () => void;
}

export default function UserDetailPanel({ user, legalEntities, onSaved, onBack, onEdit }: Props) {
  const tu = useTranslations("admin.users");

  // Capability groups with translations
  const capabilityGroups = [
    {
      title: tu("capGroupExpense"),
      capabilities: [
        { key: "can_create_expenses", label: tu("capCreateExpenses"), desc: tu("capCreateExpensesDesc") },
        { key: "can_create_corporate_expenses", label: tu("capCorporateExpenses"), desc: tu("capCorporateExpensesDesc") },
        { key: "can_invoice_corporation", label: tu("capInvoiceCorporation"), desc: tu("capInvoiceCorporationDesc") },
      ],
    },
    {
      title: tu("capGroupAccounting"),
      capabilities: [
        { key: "can_access_accounting", label: tu("capAccessAccounting"), desc: tu("capAccessAccountingDesc") },
        { key: "can_view_analytics", label: tu("capViewAnalytics"), desc: tu("capViewAnalyticsDesc") },
      ],
    },
    {
      title: tu("capGroupSpecial"),
      capabilities: [
        { key: "is_amex_reconciler", label: tu("capAmexReconciler"), desc: tu("capAmexReconcilerDesc") },
        { key: "requires_time_tracking", label: tu("capTimeTracking"), desc: tu("capTimeTrackingDesc") },
        { key: "has_executive_reporting", label: tu("capExecReporting"), desc: tu("capExecReportingDesc") },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="text-muted hover:text-secondary"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${user.is_active ? "bg-emerald-400" : "bg-surface-2"}`} />
            <span className="text-sm font-semibold text-primary">{user.full_name}</span>
          </div>
          <p className="text-xs text-muted font-mono">{user.email}</p>
        </div>
        <span className="rounded border border-subtle px-2 py-0.5 text-[10px] font-medium text-secondary">
          {user.role}
        </span>
      </div>

      {/* Activity Metrics */}
      <div className="border-b border-subtle p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">
          {tu("activityMetrics")}
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Calendar className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("lastLogin")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">
              {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "—"}
            </p>
          </div>
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Receipt className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("lastExpense")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">—</p>
          </div>
          <div className="rounded-lg border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 text-muted">
              <Clock className="h-3.5 w-3.5" />
              <span className="text-[9px] uppercase">{tu("created")}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-primary">
              {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Capabilities */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-3">
          {tu("capabilities")}
        </h3>

        {capabilityGroups.map((group) => (
          <div key={group.title} className="mb-4">
            <p className="text-[10px] font-semibold text-tertiary mb-2">{group.title}</p>
            <div className="space-y-1">
              {group.capabilities.map((cap) => {
                const value = user[cap.key as keyof UserFull] as boolean;
                return (
                  <div
                    key={cap.key}
                    className="flex items-center justify-between rounded border border-subtle bg-surface-1 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-secondary">{cap.label}</p>
                      <p className="text-[9px] text-muted">{cap.desc}</p>
                    </div>
                    {value ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Delegation */}
        {user.role === "secretary" && (
          <div className="mb-4">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
              {tu("delegation")}
            </h3>
            <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
              <p className="text-[9px] text-muted">{tu("delegatesFor")}</p>
              <p className="text-xs text-primary">
                {user.delegates_for_user_name || tu("noDelegation")}
              </p>
            </div>
          </div>
        )}

        {/* Company Assignment */}
        <div className="mb-4">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted mb-2">
            {tu("companyAssignment")}
          </h3>
          <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
            <div className="flex items-center gap-2 text-muted mb-1">
              <Building className="h-3 w-3" />
              <span className="text-[9px] uppercase">{tu("legalEntity")}</span>
            </div>
            <p className="text-xs text-primary">
              {legalEntities.find((e) => e.id === user.legal_entity_id)?.entity_name || tu("unassigned")}
            </p>
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="border-t border-subtle p-4">
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center justify-center gap-2 rounded border border-default bg-surface-1 px-4 py-2 text-xs font-medium text-secondary hover:bg-surface-2"
        >
          <UserCog className="h-3.5 w-3.5" />
          {tu("editPermissions")}
        </button>
      </div>
    </div>
  );
}