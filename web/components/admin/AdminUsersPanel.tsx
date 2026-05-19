"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  Users, Plus, ChevronDown, ChevronRight, Search, Filter,
  CheckSquare, Square, X, Mail, Shield, ToggleLeft, ToggleRight,
  UserCog, MoreHorizontal, ArrowUpDown, Check, Loader2,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";

const ROLES = ["employee", "manager", "accounting", "admin", "executive", "secretary"] as const;
type RoleOption = (typeof ROLES)[number];

const roleLabel = (r: string, tFn: (k: string) => string) =>
  r === "secretary" ? tFn("roleSecretaryLabel") : r.charAt(0).toUpperCase() + r.slice(1);

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
  is_subcontractor: boolean;
  requires_time_tracking: boolean;
  has_executive_reporting: boolean;
  can_access_accounting: boolean;
  can_view_analytics: boolean;
  invited_at: string | null;
  last_login_at: string | null;
  created_at: string;
  project_ids: number[];
}

interface Props {
  companyId: number;
  users: UserFull[];
  onUsersChanged: (users: UserFull[]) => void;
  companySetup?: Record<string, unknown> | null;
}

interface Project { id: number; name: string; code: string }
interface LegalEntity { id: number; entity_name: string }

// ── Role badge colors ───────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  admin:      { text: "text-violet-300", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  manager:    { text: "text-sky-300",     bg: "bg-sky-500/10",    border: "border-sky-500/20" },
  accounting: { text: "text-amber-300",   bg: "bg-amber-500/10",  border: "border-amber-500/20" },
  executive:  { text: "text-rose-300",    bg: "bg-rose-500/10",   border: "border-rose-500/20" },
  secretary:  { text: "text-purple-300",   bg: "bg-purple-500/10", border: "border-purple-500/20" },
  employee:   { text: "text-secondary",    bg: "bg-surface-1",     border: "border-default" },
};

// ── Capability definitions ──────────────────────────────────────────────────

interface CapDef {
  key: keyof Pick<UserFull, "can_create_expenses" | "can_create_corporate_expenses" | "can_invoice_corporation" | "is_amex_reconciler" | "is_subcontractor" | "requires_time_tracking" | "has_executive_reporting" | "can_access_accounting" | "can_view_analytics">;
  group: "expense" | "accounting" | "addon";
  moduleGate?: string;
  labelKey: string;
  descKey: string;
}



// Only one admin per tenant — disable the option if an admin already exists
// (unless editing that same admin)
const hasExistingAdmin = (users: UserFull[], editingId?: number | null): boolean =>
  users.some((u) => u.role === 'admin' && u.id !== editingId);

const roleOption = (r: RoleOption, tFn: (k: string) => string, adminExists: boolean, isEditingSelf?: boolean) => {
  if (r === 'admin' && adminExists && !isEditingSelf) {
    return <option key={r} value={r} disabled>{roleLabel(r, tFn)} (único)</option>;
  }
  return <option key={r} value={r}>{roleLabel(r, tFn)}</option>;
};

const CAP_DEFS: CapDef[] = [
  { key: "can_create_expenses", group: "expense", labelKey: "capCreateExpenses", descKey: "capCreateExpensesDesc" },
  { key: "can_create_corporate_expenses", group: "expense", labelKey: "capCorporateExpenses", descKey: "capCorporateExpensesDesc" },
  { key: "can_invoice_corporation", group: "expense", labelKey: "capInvoiceCorporation", descKey: "capInvoiceCorporationDesc" },
  { key: "can_access_accounting", group: "accounting", labelKey: "capAccessAccounting", descKey: "capAccessAccountingDesc" },
  { key: "can_view_analytics", group: "accounting", labelKey: "capViewAnalytics", descKey: "capViewAnalyticsDesc" },
  { key: "is_amex_reconciler", group: "addon", moduleGate: "amex_reconciliation_module_enabled", labelKey: "capAmexReconciler", descKey: "capAmexReconcilerDesc" },
  { key: "requires_time_tracking", group: "addon", moduleGate: "time_allocation_module_enabled", labelKey: "capTimeTracking", descKey: "capTimeTrackingDesc" },
  { key: "is_subcontractor", group: "addon", moduleGate: "subcontractor_module_enabled", labelKey: "capSubcontractor", descKey: "capSubcontractorDesc" },
  { key: "has_executive_reporting", group: "accounting", labelKey: "capExecReporting", descKey: "capExecReportingDesc" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const t = useTranslations("admin.users");
  const c = ROLE_COLORS[role] ?? ROLE_COLORS.employee;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${c.text} ${c.bg} ${c.border}`}>
      {roleLabel(role, t)}
    </span>
  );
}

function CapDot({ active }: { active: boolean }) {
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-accent" : "bg-surface-2"}`} />;
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminUsersPanel({ companyId, users, onUsersChanged, companySetup }: Props) {
  const t = useTranslations("admin.users");
  const [projects, setProjects] = useState<Project[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [groupByRole, setGroupByRole] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [bulkCapKey, setBulkCapKey] = useState<string>("");
  const [bulkCapValue, setBulkCapValue] = useState(true);
  const [bulkRole, setBulkRole] = useState<string>("");

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<UserFull>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Module gates from company setup
  const setup = companySetup as Record<string, unknown> | null;
  const isModuleEnabled = useCallback(
    (moduleGate?: string) => {
      if (!moduleGate) return true;
      return !!setup?.[moduleGate];
    },
    [setup],
  );

  // Visible cap defs filtered by module gates
  const visibleCapDefs = useMemo(() => CAP_DEFS.filter((d) => isModuleEnabled(d.moduleGate)), [isModuleEnabled]);

  useEffect(() => {
    apiCall<Project[]>(`/projects?company_id=${companyId}`).then(setProjects).catch(() => {});
    apiCall<LegalEntity[]>(`/legal-entities?company_id=${companyId}`).then(setLegalEntities).catch(() => {});
  }, [companyId]);

  // Filtered + searched users
  const filtered = useMemo(() => {
    let list = [...users];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          (u.department ?? "").toLowerCase().includes(q),
      );
    }
    if (filterRole !== "all") list = list.filter((u) => u.role === filterRole);
    if (filterStatus !== "all") list = list.filter((u) => u.is_active === (filterStatus === "active"));

    if (groupByRole) {
      const order = ["admin", "manager", "accounting", "executive", "secretary", "employee"];
      list.sort((a, b) => {
        const ai = order.indexOf(a.role) ?? 99;
        const bi = order.indexOf(b.role) ?? 99;
        return ai - bi || a.full_name.localeCompare(b.full_name);
      });
    } else {
      list.sort((a, b) => a.full_name.localeCompare(b.full_name));
    }
    return list;
  }, [users, searchQuery, filterRole, filterStatus, groupByRole]);

  // Grouped users
  const groups = useMemo(() => {
    if (!groupByRole) return [{ label: "", users: filtered }];
    const map = new Map<string, UserFull[]>();
    for (const u of filtered) {
      const g = map.get(u.role) ?? [];
      g.push(u);
      map.set(u.role, g);
    }
    const order = ["admin", "manager", "accounting", "executive", "secretary", "employee"];
    return order
      .filter((r) => map.has(r))
      .map((r) => ({ label: r, users: map.get(r)! }));
  }, [filtered, groupByRole]);

  // Selected user
  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [users, selectedUserId]);

  // ── Toggle selection ──────────────────────────────────────────────────────
  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((u) => u.id)));
    }
  }, [selectedIds, filtered]);

  // ── Save user edits ───────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedUser) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      const capFields = CAP_DEFS.map((d) => d.key);
      const otherFields = ["full_name", "role", "is_active", "department", "job_title", "phone", "legal_entity_id", "delegates_for_user_id"] as const;
      for (const f of capFields) {
        if (editForm[f] !== undefined && editForm[f] !== selectedUser[f]) patch[f] = editForm[f];
      }
      for (const f of otherFields) {
        if (editForm[f] !== undefined && editForm[f] !== selectedUser[f]) patch[f] = editForm[f];
      }
      if (editForm.project_ids !== undefined) patch.project_ids = editForm.project_ids;

      if (Object.keys(patch).length === 0) {
        setEditMode(false);
        setSaving(false);
        return;
      }
      const updated = await apiPatch<UserFull>(`/users/${selectedUser.id}?company_id=${companyId}`, patch);
      onUsersChanged(users.map((u) => (u.id === updated.id ? updated : u)));
      setEditMode(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [selectedUser, editForm, companyId, users, onUsersChanged, t]);

  // ── Delete user ───────────────────────────────────────────────────────────
  const handleDelete = useCallback(
    async (userId: number) => {
      try {
        await apiDelete(`/users/${userId}?company_id=${companyId}`);
        onUsersChanged(users.filter((u) => u.id !== userId));
        if (selectedUserId === userId) setSelectedUserId(null);
      } catch {}
    },
    [companyId, users, onUsersChanged, selectedUserId],
  );

  // ── Bulk apply ────────────────────────────────────────────────────────────
  const handleBulkApply = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      let updated = [...users];
      for (const id of selectedIds) {
        const patch: Record<string, unknown> = {};
        if (bulkCapKey) patch[bulkCapKey] = bulkCapValue;
        if (bulkRole) patch.role = bulkRole;
        if (Object.keys(patch).length === 0) continue;
        const res = await apiPatch<UserFull>(`/users/${id}?company_id=${companyId}`, patch);
        updated = updated.map((u) => (u.id === res.id ? res : u));
      }
      onUsersChanged(updated);
      setSelectedIds(new Set());
      setShowBulkBar(false);
      setBulkCapKey("");
      setBulkRole("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("bulkError"));
    } finally {
      setSaving(false);
    }
  }, [selectedIds, bulkCapKey, bulkCapValue, bulkRole, companyId, users, onUsersChanged, t]);

  // ── Start editing a user ──────────────────────────────────────────────────
  const startEdit = useCallback((user: UserFull) => {
    setEditMode(true);
    setEditForm({
      full_name: user.full_name,
      role: user.role,
      is_active: user.is_active,
      department: user.department,
      job_title: user.job_title,
      phone: user.phone,
      legal_entity_id: user.legal_entity_id,
      delegates_for_user_id: user.delegates_for_user_id,
      can_create_expenses: user.can_create_expenses,
      can_create_corporate_expenses: user.can_create_corporate_expenses,
      can_invoice_corporation: user.can_invoice_corporation,
      is_amex_reconciler: user.is_amex_reconciler,
      is_subcontractor: user.is_subcontractor,
      requires_time_tracking: user.requires_time_tracking,
      has_executive_reporting: user.has_executive_reporting,
      can_access_accounting: user.can_access_accounting,
      can_view_analytics: user.can_view_analytics,
      project_ids: [...(user.project_ids ?? [])],
    });
  }, []);

  // ── Close modal ─────────────────────────────────────────────────────────────
  const closeModal = useCallback(() => {
    setSelectedUserId(null);
    setEditMode(false);
    setError(null);
  }, []);

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedUserId !== null) {
        closeModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedUserId, closeModal]);

  // ── Metrics ───────────────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const active = users.filter((u) => u.is_active).length;
    return [
      { label: t("totalUsers", { count: users.length }), value: users.length },
      { label: t("activeUsers", { count: active }), value: active },
    ];
  }, [users, t]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <PremiumHeader
        icon={<Users className="h-4 w-4" />}
        title={t("title")}
        subtitle="ACCESS CONTROL"
        section="users-roles"
        metrics={metrics}
        action={
          <button
            type="button"
            onClick={() => setShowInvite(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-accent-hover"
          >
            <Plus className="h-3 w-3" />
            {t("inviteUser")}
          </button>
        }
      />

      {/* Search & filter bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full rounded-lg border border-default bg-surface-1 py-1.5 pl-8 pr-3 text-[11px] text-primary placeholder:text-muted outline-none focus:border-accent/40 focus:bg-surface-2 transition-all"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-secondary outline-none focus:border-accent/40"
        >
          <option value="all">{t("filterAll")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{roleLabel(r, t)}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
          className="rounded-lg border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-secondary outline-none focus:border-accent/40"
        >
          <option value="all">{t("filterAll")}</option>
          <option value="active">{t("statusActive")}</option>
          <option value="inactive">{t("statusInactive")}</option>
        </select>
        <button
          type="button"
          onClick={() => setGroupByRole((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors ${
            groupByRole ? "border-accent/40 bg-accent/10 text-accent" : "border-default bg-surface-1 text-muted hover:text-secondary"
          }`}
        >
          <ArrowUpDown className="h-3 w-3" />
          {groupByRole ? t("groupByRole") : t("groupByNone")}
        </button>
        <button
          type="button"
          onClick={() => { setShowBulkBar((v) => !v); if (!showBulkBar) setSelectedIds(new Set()); }}
          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[10px] font-medium transition-colors ${
            showBulkBar ? "border-accent/40 bg-accent/10 text-accent" : "border-default bg-surface-1 text-muted hover:text-secondary"
          }`}
        >
          <CheckSquare className="h-3 w-3" />
          {t("bulkAssign")}
        </button>
      </div>

      {/* Bulk action bar */}
      {showBulkBar && (
        <div className="rounded-lg border border-accent/20 bg-surface-1 px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-[10px] font-semibold text-primary">
              {t("selectedCount", { count: selectedIds.size })}
            </span>
            <select
              value={bulkCapKey}
              onChange={(e) => setBulkCapKey(e.target.value)}
              className={inputClasses.select}
            >
              <option value="">{t("bulkCapabilities")}…</option>
              {visibleCapDefs.map((d) => (
                <option key={d.key} value={d.key}>{t(d.labelKey)}</option>
              ))}
            </select>
            {bulkCapKey && (
              <select
                value={bulkCapValue ? "true" : "false"}
                onChange={(e) => setBulkCapValue(e.target.value === "true")}
                className={inputClasses.select}
              >
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            )}
            <select
              value={bulkRole}
              onChange={(e) => setBulkRole(e.target.value)}
              className={inputClasses.select}
            >
              <option value="">{t("bulkRole")}…</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{roleLabel(r, t)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkApply}
              disabled={saving || selectedIds.size === 0 || (!bulkCapKey && !bulkRole)}
              className="rounded bg-accent px-3 py-1 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("bulkApply")}
            </button>
            <button
              type="button"
              onClick={() => { setShowBulkBar(false); setSelectedIds(new Set()); }}
              className="text-[10px] text-muted hover:text-secondary"
            >
              {t("bulkCancel")}
            </button>
          </div>
        </div>
      )}

      {/* Invite form */}
      {showInvite && (
        <InviteForm
          companyId={companyId}
          allUsers={users}
          legalEntities={legalEntities}
          onCreated={(u) => {
            onUsersChanged([...users, u]);
            setShowInvite(false);
          }}
          onCancel={() => setShowInvite(false)}
        />
      )}

      {/* User list table */}
      <div className="rounded-lg border border-default overflow-hidden">
        {/* Table header */}
        <div className={`grid gap-x-2 border-b border-default bg-surface-2 px-3 py-2 ${showBulkBar ? "grid-cols-[28px_1fr_1fr_80px_60px_60px_28px]" : "grid-cols-[1fr_1fr_80px_60px_60px_28px]"}`}>
          {showBulkBar && (
            <div className="flex items-center">
              <button type="button" onClick={toggleSelectAll} className="text-muted hover:text-secondary">
                {selectedIds.size === filtered.length && filtered.length > 0 ? <CheckSquare className="h-3.5 w-3.5 text-accent" /> : <Square className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("colName")}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("colEmail")}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("colRole")}</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted text-center">Caps</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-muted text-center">Status</span>
          <span />
        </div>

        {/* Grouped or flat rows */}
        {groups.map((group) => (
          <div key={group.label || "_flat"}>
            {groupByRole && group.label && (
              <div className="flex items-center gap-2 border-b border-subtle bg-surface-1/50 px-3 py-1.5">
                <RoleBadge role={group.label} />
                <span className="text-[9px] text-muted">{group.users.length}</span>
              </div>
            )}
            {group.users.map((user) => {
              const isSelected = selectedUserId === user.id;
              const visibleCaps = visibleCapDefs.filter((d) => !d.moduleGate);
              const activeBaseCaps = visibleCaps.filter((d) => user[d.key]).length;
              const totalBaseCaps = visibleCaps.length;
              const visibleAddons = visibleCapDefs.filter((d) => d.moduleGate);
              const activeAddons = visibleAddons.filter((d) => user[d.key]).length;

              return (
                <div
                  key={user.id}
                  className={`grid gap-x-2 border-b border-subtle px-3 py-2 cursor-pointer transition-colors hover:bg-surface-1/80 ${
                    isSelected ? "bg-accent/5 ring-1 ring-inset ring-accent/20" : ""
                  } ${!user.is_active ? "opacity-50" : ""} ${showBulkBar ? "grid-cols-[28px_1fr_1fr_80px_60px_60px_28px]" : "grid-cols-[1fr_1fr_80px_60px_60px_28px]"}`}
                  onClick={() => { setSelectedUserId(user.id); startEdit(user); }}
                >
                  {/* Checkbox or avatar */}
                  {showBulkBar && (
                    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => toggleSelect(user.id)}
                        className="text-muted hover:text-secondary"
                      >
                        {selectedIds.has(user.id) ? <CheckSquare className="h-3.5 w-3.5 text-accent" /> : <Square className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )}
                  {/* Name + job title */}
                  <div className="flex flex-col justify-center min-w-0">
                    <span className="truncate text-[11px] font-medium text-primary">{user.full_name}</span>
                    {user.job_title && <span className="truncate text-[9px] text-muted">{user.job_title}</span>}
                  </div>
                  {/* Email */}
                  <span className="truncate text-[10px] text-muted self-center">{user.email}</span>
                  {/* Role */}
                  <div className="flex items-center">
                    <RoleBadge role={user.role} />
                  </div>
                  {/* Caps indicator */}
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[9px] tabular-nums text-secondary">{activeBaseCaps}/{totalBaseCaps}</span>
                    {visibleAddons.length > 0 && (
                      <>
                        <span className="text-[9px] text-muted">+</span>
                        <span className="text-[9px] tabular-nums text-accent">{activeAddons}</span>
                      </>
                    )}
                  </div>
                  {/* Status */}
                  <div className="flex items-center justify-center">
                    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${
                      user.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-surface-2 text-muted border border-default"
                    }`}>
                      {user.is_active ? t("statusActive") : t("statusInactive")}
                    </span>
                  </div>
                  {/* Expand indicator */}
                  <div className="flex items-center justify-center">
                    <MoreHorizontal className="h-3.5 w-3.5 text-muted" />
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-[11px] text-muted">
            {searchQuery ? "No users match your search" : t("noUsers")}
          </div>
        )}
      </div>

      {/* ── User detail modal ────────────────────────────────────────────── */}
      {selectedUser && (
        <UserDetailModal
          user={selectedUser}
          editMode={editMode}
          editForm={editForm}
          setEditMode={setEditMode}
          setEditForm={setEditForm}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={closeModal}
          saving={saving}
          error={error}
          legalEntities={legalEntities}
          users={users}
          visibleCapDefs={visibleCapDefs}
          t={t}
        />
      )}
    </div>
  );
}

// ── User detail modal (centered popup) ────────────────────────────────────────

function UserDetailModal({
  user, editMode, editForm, setEditMode, setEditForm, onSave, onDelete, onClose,
  saving, error, legalEntities, users, visibleCapDefs, t,
}: {
  user: UserFull;
  editMode: boolean;
  editForm: Partial<UserFull>;
  setEditMode: (v: boolean) => void;
  setEditForm: (v: Partial<UserFull>) => void;
  onSave: () => void;
  onDelete: (id: number) => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
  legalEntities: LegalEntity[];
  users: UserFull[];
  visibleCapDefs: CapDef[];
  t: (k: string) => string;
}) {
  const [confirmDel, setConfirmDel] = useState(false);
  const isSecretary = user.role === "secretary";
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  const groupCaps = (caps: CapDef[]) => {
    const groups: Record<string, CapDef[]> = {};
    for (const c of caps) {
      const g = c.group;
      (groups[g] ??= []).push(c);
    }
    return groups;
  };

  const capGroups = groupCaps(visibleCapDefs);
  const groupLabels: Record<string, string> = {
    expense: t("capGroupExpense"),
    accounting: t("capGroupAccounting"),
    addon: t("capGroupAddOns"),
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overlay-backdrop-blur"
      onClick={handleBackdrop}
    >
      <div
        ref={modalRef}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-default bg-surface-0 shadow-2xl"
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-default px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-sm font-bold text-accent">
              {user.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-primary">{user.full_name}</span>
              <span className="text-[10px] text-muted">{user.email}</span>
            </div>
            <RoleBadge role={user.role} />
            {!user.is_active && (
              <span className="rounded-full bg-surface-2 border border-default px-2 py-0.5 text-[8px] font-semibold text-muted">
                {t("statusInactive")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editMode ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] font-semibold text-secondary hover:text-primary hover:border-strong transition-colors"
              >
                <UserCog className="h-3 w-3" />
                {t("editPermissions")}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className="rounded-lg border border-default bg-surface-2 px-2.5 py-1.5 text-[10px] text-muted hover:text-secondary"
                >
                  {t("bulkCancel")}
                </button>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  {t("update")}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="border-b border-subtle bg-error/5 px-5 py-2 text-[10px] text-error">{error}</div>
        )}

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-[1fr_1fr] gap-x-8 gap-y-4">
            {/* Left column: Identity + Org */}
            <div className="space-y-4">
              {/* Identity section */}
              <div>
                <SectionLabel>{t("identityLabel")}</SectionLabel>
                <div className="space-y-2">
                  <DetailField label={t("fieldFullName")} value={editMode ? undefined : user.full_name}>
                    {editMode && (
                      <input
                        value={editForm.full_name ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                        className={inputClasses.base}
                      />
                    )}
                  </DetailField>
                  <DetailField label={t("fieldJobTitle")} value={editMode ? undefined : user.job_title ?? "—"}>
                    {editMode && (
                      <input
                        value={editForm.job_title ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value || null })}
                        className={inputClasses.base}
                        placeholder={t("invitePlaceholderJobTitle")}
                      />
                    )}
                  </DetailField>
                  <DetailField label={t("fieldDepartment")} value={editMode ? undefined : user.department ?? "—"}>
                    {editMode && (
                      <input
                        value={editForm.department ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, department: e.target.value || null })}
                        className={inputClasses.base}
                        placeholder={t("invitePlaceholderDepartment")}
                      />
                    )}
                  </DetailField>
                  <DetailField label={t("fieldPhone")} value={editMode ? undefined : user.phone ?? "—"}>
                    {editMode && (
                      <input
                        value={editForm.phone ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, phone: e.target.value || null })}
                        className={inputClasses.base}
                        placeholder={t("invitePlaceholderPhone")}
                      />
                    )}
                  </DetailField>
                </div>
              </div>

              {/* Role + Status */}
              <div>
                <SectionLabel>{t("roleLabel")} & {t("fieldStatus")}</SectionLabel>
                <div className="space-y-2">
                  {editMode ? (
                    <>
                      <div>
                        <label className="mb-1 block text-[9px] text-muted">{t("fieldRole")}</label>
                        <select
                          value={editForm.role ?? user.role}
                          onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                          className={inputClasses.select}
                        >
                          {ROLES.map((r) => roleOption(r, t, hasExistingAdmin(users, user.id), r === 'admin' && user.role === 'admin'))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-[9px] text-muted">{t("fieldStatus")}</label>
                        <button
                          type="button"
                          onClick={() => setEditForm({ ...editForm, is_active: !editForm.is_active })}
                          className={`inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] transition-colors ${
                            editForm.is_active ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "border-default bg-surface-2 text-muted"
                          }`}
                        >
                          {editForm.is_active ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
                          {editForm.is_active ? t("statusActive") : t("statusInactive")}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <RoleBadge role={user.role} />
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-semibold ${
                        user.is_active ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-surface-2 text-muted border border-default"
                      }`}>
                        {user.is_active ? t("statusActive") : t("statusInactive")}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Organisation */}
              <div>
                <SectionLabel>{t("organisationLabel")}</SectionLabel>
                <div className="space-y-2">
                  <DetailField label={t("legalEntity")} value={editMode ? undefined : (legalEntities.find((e) => e.id === user.legal_entity_id)?.entity_name ?? t("unassigned"))}>
                    {editMode && (
                      <select
                        value={editForm.legal_entity_id ?? ""}
                        onChange={(e) => setEditForm({ ...editForm, legal_entity_id: e.target.value ? parseInt(e.target.value) : null })}
                        className={inputClasses.select}
                      >
                        <option value="">{t("entityNone")}</option>
                        {legalEntities.map((e) => (
                          <option key={e.id} value={e.id}>{e.entity_name}</option>
                        ))}
                      </select>
                    )}
                  </DetailField>
                  {isSecretary && (
                    <DetailField
                      label={t("delegatesFor")}
                      value={editMode ? undefined : (user.delegates_for_user_name ?? t("noDelegation"))}
                    >
                      {editMode && (
                        <select
                          value={editForm.delegates_for_user_id ?? ""}
                          onChange={(e) => setEditForm({ ...editForm, delegates_for_user_id: e.target.value ? parseInt(e.target.value) : null })}
                          className={inputClasses.select}
                        >
                          <option value="">{t("noDelegation")}</option>
                          {users
                            .filter((u) => u.id !== user.id && (u.role === "executive" || u.role === "manager"))
                            .map((u) => (
                              <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                            ))}
                        </select>
                      )}
                    </DetailField>
                  )}
                </div>
              </div>

              {/* Activity */}
              <div>
                <SectionLabel>{t("activityMetrics")}</SectionLabel>
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded border border-default bg-surface-0 px-2 py-1.5">
                    <div className="text-[9px] text-muted">{t("created")}</div>
                    <div className="font-medium text-secondary">{formatDate(user.created_at)}</div>
                  </div>
                  <div className="rounded border border-default bg-surface-0 px-2 py-1.5">
                    <div className="text-[9px] text-muted">{t("lastLogin")}</div>
                    <div className="font-medium text-secondary">{formatDate(user.last_login_at)}</div>
                  </div>
                  <div className="rounded border border-default bg-surface-0 px-2 py-1.5">
                    <div className="text-[9px] text-muted">{t("timestampInvited")}</div>
                    <div className="font-medium text-secondary">{formatDate(user.invited_at)}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right column: Capabilities */}
            <div className="space-y-4">
              <div>
                <SectionLabel>{t("capabilitiesLabel")}</SectionLabel>
                {Object.entries(capGroups).map(([groupKey, caps]) => (
                  <div key={groupKey} className="mb-3">
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted">{groupLabels[groupKey] ?? groupKey}</p>
                    <div className="space-y-1">
                      {caps.map((cap) => {
                        const currentValue = editMode ? (editForm[cap.key] as boolean) ?? false : (user[cap.key] as boolean);
                        return (
                          <div key={cap.key} className="flex items-center justify-between rounded border border-default bg-surface-0 px-2 py-1.5">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-medium text-primary">{t(cap.labelKey)}</span>
                              <span className="text-[9px] text-muted">{t(cap.descKey)}</span>
                            </div>
                            {editMode ? (
                              <button
                                type="button"
                                onClick={() => setEditForm({ ...editForm, [cap.key]: !currentValue })}
                                className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-semibold transition-colors ${
                                  currentValue ? "bg-accent/10 text-accent border-accent/20" : "border-default bg-surface-2 text-muted"
                                }`}
                              >
                                {currentValue ? "On" : "Off"}
                              </button>
                            ) : (
                              <CapDot active={currentValue} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Delete */}
              {editMode && (
                <div className="pt-2 border-t border-default">
                  {!confirmDel ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDel(true)}
                      className="text-[10px] text-error/60 hover:text-error"
                    >
                      {t("actionRemove")}
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-error">{t("actionConfirmRemove")}? </span>
                      <button
                        type="button"
                        onClick={() => { onDelete(user.id); onClose(); }}
                        className="rounded bg-error/10 border border-error/20 px-2 py-0.5 text-[9px] font-semibold text-error hover:bg-error/20"
                      >
                        {t("actionConfirmRemove")}
                      </button>
                      <button type="button" onClick={() => setConfirmDel(false)} className="text-[9px] text-muted">
                        {t("bulkCancel")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail field helper ──────────────────────────────────────────────────────

function DetailField({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[9px] text-muted">{label}</span>
      {children ?? <span className="text-[11px] text-secondary truncate">{value}</span>}
    </div>
  );
}

// ── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

// ── Invite form ──────────────────────────────────────────────────────────────

function InviteForm({
  companyId, allUsers, legalEntities, onCreated, onCancel,
}: {
  companyId: number;
  allUsers: UserFull[];
  legalEntities: LegalEntity[];
  onCreated: (u: UserFull) => void;
  onCancel: () => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<RoleOption>("employee");
  const [jobTitle, setJobTitle] = useState("");
  const [entityId, setEntityId] = useState("");
  const [delegatesForId, setDelegatesForId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tu = useTranslations("admin.users");

  const handleCreate = async () => {
    if (!email.trim() || !fullName.trim()) { setError(tu("inviteErrorRequired")); return; }
    setSaving(true); setError(null);
    try {
      const user = await apiPost<UserFull>(`/users?company_id=${companyId}`, {
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        job_title: jobTitle || null,
        legal_entity_id: entityId ? parseInt(entityId) : null,
        delegates_for_user_id: delegatesForId ? parseInt(delegatesForId) : null,
        company_id: companyId,
        can_create_expenses: true,
        is_active: true,
      });
      onCreated(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : tu("inviteErrorCreate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/20 bg-surface-1 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold text-primary">{tu("inviteFormTitle")}</p>
        <button type="button" onClick={onCancel} className="text-muted hover:text-secondary"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[9px] text-muted">{tu("invitePlaceholderName")}</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClasses.base} />
        </div>
        <div>
          <label className="mb-1 block text-[9px] text-muted">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses.base} />
        </div>
        <div>
          <label className="mb-1 block text-[9px] text-muted">{tu("fieldRole")}</label>
          <select value={role} onChange={(e) => setRole(e.target.value as RoleOption)} className={inputClasses.select}>
            {ROLES.map((r) => roleOption(r, tu, hasExistingAdmin(allUsers)))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[9px] text-muted">{tu("invitePlaceholderJobTitle")}</label>
          <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputClasses.base} />
        </div>
      </div>
      {error && <p className="text-[10px] text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md border border-default bg-surface-2 px-3 py-1.5 text-[11px] text-secondary">{tu("bulkCancel")}</button>
        <button type="button" onClick={handleCreate} disabled={saving} className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          {" "}{tu("inviteCreateUser")}
        </button>
      </div>
    </div>
  );
}
