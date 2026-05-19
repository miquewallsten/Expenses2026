"use client";

/**
 * SalaryConfigPanel — Let accountants configure hourly rates per user.
 * Used within the Accounting Setup section to assign salary data so
 * time entries can be costed.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DollarSign, Loader2, Save } from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";
import { useUserContext } from "@/context/UserContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface User {
  id: number;
  full_name: string;
  email: string;
  role: string;
}

interface SalaryConfig {
  id: number;
  user_id: number;
  hourly_rate: string;
  monthly_salary: string | null;
  currency: string;
  effective_date: string;
  is_active: boolean;
  role_title: string | null;
}

const AMOUNT_FMT = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmt(n: string | number): string {
  const v = Number(n);
  return Number.isFinite(v) ? AMOUNT_FMT.format(v) : "0.00";
}

// ── User Row (extracts useState to top level) ──────────────────────────────────

function UserSalaryRow({
  user,
  salary,
  onSave,
  saving,
}: {
  user: User;
  salary: SalaryConfig | undefined;
  onSave: (userId: number, rate: string) => Promise<void>;
  saving: boolean;
}) {
  const t = useTranslations("timeAccounting");
  const [rate, setRate] = useState(salary?.hourly_rate ?? "");
  const isSaving = saving;

  return (
    <tr className="hover:bg-surface-1 transition-colors">
      <td className="px-3 py-1.5">
        <div className="text-[11px] font-medium text-primary">{user.full_name || user.email}</div>
        <div className="text-[9px] text-muted">{user.email}</div>
      </td>
      <td className="px-3 py-1.5 text-secondary">{user.role}</td>
      <td className="px-3 py-1.5 text-right">
        <div className="flex items-center justify-end gap-1">
          <span className="text-[9px] text-muted">$</span>
          <input
            type="number"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            className="w-20 rounded border border-default bg-surface-0 px-1.5 py-0.5 text-right text-[11px] text-primary tabular-nums"
            placeholder="0.00"
            step="0.01"
            min="0"
          />
          <span className="text-[9px] text-muted">/h</span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums text-tertiary">
        {salary?.monthly_salary ? `$${fmt(salary.monthly_salary)}` : "—"}
      </td>
      <td className="px-3 py-1.5 text-tertiary">
        {salary?.effective_date
          ? new Date(salary.effective_date + "T00:00:00").toLocaleDateString("es-MX", { month: "short", day: "numeric" })
          : "—"}
      </td>
      <td className="px-3 py-1.5 text-right">
        <button
          type="button"
          onClick={() => onSave(user.id, rate)}
          disabled={isSaving || !rate || parseFloat(rate) <= 0}
          className="inline-flex items-center gap-0.5 rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold text-accent hover:bg-accent/20 disabled:opacity-40"
        >
          {isSaving ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <Save className="h-2.5 w-2.5" />
          )}
          {t("save")}
        </button>
      </td>
    </tr>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SalaryConfigPanel() {
  const t = useTranslations("timeAccounting");
  const user = useUserContext();
  const companyId = user.companyId;

  const [users, setUsers] = useState<User[]>([]);
  const [salaries, setSalaries] = useState<Record<number, SalaryConfig>>({});
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<number | null>(null);

  // ── Load users and salaries ──────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [usersData, salariesData] = await Promise.all([
        apiCall<User[]>(`/roles/users/${companyId}`),
        apiCall<SalaryConfig[]>(`/time/${companyId}/salaries`),
      ]);
      setUsers(usersData);
      const map: Record<number, SalaryConfig> = {};
      for (const s of salariesData) {
        map[s.user_id] = s;
      }
      setSalaries(map);
    } catch (e) {
      console.error("Failed to load salary data", e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Save hourly rate for a user ──────────────────────────────────────────
  const handleSave = useCallback(
    async (userId: number, rate: string) => {
      if (!companyId) return;
      const hourlyRate = parseFloat(rate);
      if (isNaN(hourlyRate) || hourlyRate <= 0) return;
      setSavingUserId(userId);
      try {
        const result = await apiPost<SalaryConfig>(
          `/time/${companyId}/salaries`,
          {
            user_id: userId,
            hourly_rate: hourlyRate,
            effective_date: new Date().toISOString().slice(0, 10),
          }
        );
        setSalaries((prev) => ({ ...prev, [userId]: result }));
      } catch (e) {
        console.error("Failed to save salary", e);
      } finally {
        setSavingUserId(null);
      }
    },
    [companyId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="h-4 w-4 text-secondary" />
        <h2 className="text-sm font-semibold text-secondary">{t("salaryConfig")}</h2>
      </div>
      <p className="text-[10px] text-tertiary">{t("salaryConfigDesc")}</p>

      <div className="overflow-hidden rounded-lg border border-default">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] font-bold uppercase tracking-widest text-muted">
              <th className="px-3 py-2">{t("user")}</th>
              <th className="px-3 py-2">{t("role")}</th>
              <th className="px-3 py-2 text-right">{t("hourlyRate")}</th>
              <th className="px-3 py-2 text-right">{t("monthlySalary")}</th>
              <th className="px-3 py-2">{t("effectiveDate")}</th>
              <th className="px-3 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-subtle">
            {users.map((u) => (
              <UserSalaryRow
                key={u.id}
                user={u}
                salary={salaries[u.id]}
                onSave={handleSave}
                saving={savingUserId === u.id}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
