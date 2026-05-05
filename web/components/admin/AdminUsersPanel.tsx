"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Users, Plus, Trash2, Loader2, Check, ChevronRight,
  ToggleLeft, ToggleRight, ArrowLeft,
} from "lucide-react";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import UserDetailPanel from "./UserDetailPanel";

const ROLES = ["employee", "manager", "accounting", "admin", "executive", "secretary"] as const;
type RoleOption = (typeof ROLES)[number];

// Display labels for roles that differ from the stored key
const roleLabel = (r: string, tFn: (k: string) => string) =>
  r === "secretary" ? tFn("roleSecretaryLabel") : (r.charAt(0).toUpperCase() + r.slice(1));

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

interface Props {
  companyId: number;
  users: UserFull[];
  onUsersChanged: (users: UserFull[]) => void;
  /**
   * Company setup flags. Used to hide capability chips that belong to
   * add-on modules the company has not installed (e.g. Time Tracking,
   * Amex Reconciliation).
   */
  companySetup?: Record<string, unknown> | null;
}

interface Project {
  id: number;
  name: string;
  code: string;
}

interface LegalEntity {
  id: number;
  entity_name: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin:      "text-violet-300/70  border-violet-500/20  bg-violet-500/[0.06]",
  manager:    "text-accent/70     border-sky-500/20     bg-accent/[0.06]",
  accounting: "text-warning/70   border-amber-500/20   bg-amber-500/[0.06]",
  executive:  "text-rose-300/70    border-rose-500/20    bg-rose-500/[0.06]",
  secretary:  "text-purple-300/70  border-purple-500/20  bg-purple-500/[0.06]",
  employee:   "text-tertiary       border-default   bg-surface-1",
};

function RoleBadge({ role }: { role: string }) {
  const tu = useTranslations("admin.users");
  const cls = ROLE_COLORS[role] ?? ROLE_COLORS.employee;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {roleLabel(role, tu)}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400/70" : "bg-surface-2"}`} />
  );
}

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function FlagToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] transition-colors ${
        value
          ? "bg-accent-muted-muted bg-blue-600/10 text-accent/70"
          : "border-default bg-surface-1 text-muted hover:text-tertiary"
      }`}
    >
      {value ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
      {label}
    </button>
  );
}

// ── User edit panel ─────────────────────────────────────────────────────────

function UserEditPanel({
  user,
  allUsers,
  projects,
  legalEntities,
  companySetup,
  onSaved,
  onDeleted,
  onBack,
}: {
  user: UserFull;
  allUsers: UserFull[];
  projects: Project[];
  legalEntities: LegalEntity[];
  companySetup: Record<string, unknown> | null;
  onSaved: (u: UserFull) => void;
  onDeleted: (id: number) => void;
  onBack: () => void;
}) {
  const [fullName,      setFullName]      = useState(user.full_name);
  const [role,          setRole]          = useState<RoleOption>(user.role as RoleOption);
  const [isActive,      setIsActive]      = useState(user.is_active);
  const [department,    setDepartment]    = useState(user.department ?? "");
  const [jobTitle,      setJobTitle]      = useState(user.job_title ?? "");
  const [phone,         setPhone]         = useState(user.phone ?? "");
  const [legalEntityId, setLegalEntityId] = useState<string>(user.legal_entity_id ? String(user.legal_entity_id) : "");
  const [delegatesForId, setDelegatesForId] = useState<string>(user.delegates_for_user_id ? String(user.delegates_for_user_id) : "");
  const [canExpenses,   setCanExpenses]   = useState(user.can_create_expenses);
  const [canCorp,       setCanCorp]       = useState(user.can_create_corporate_expenses);
  const [canInvoice,    setCanInvoice]    = useState(user.can_invoice_corporation);
  const [isAmex,        setIsAmex]        = useState(user.is_amex_reconciler);
  const [timeTracking,  setTimeTracking]  = useState(user.requires_time_tracking);
  const [execReporting, setExecReporting] = useState(user.has_executive_reporting);
  const [canAccounting, setCanAccounting] = useState(user.can_access_accounting);
  const [canAnalytics,  setCanAnalytics]  = useState(user.can_view_analytics);
  const [projectIds,    setProjectIds]    = useState<number[]>(user.project_ids ?? []);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [confirmDel,    setConfirmDel]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const tu = useTranslations("admin.users");

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const updated = await apiPatch<UserFull>(`/users/${user.id}`, {
        full_name: fullName,
        role,
        is_active: isActive,
        department: department || null,
        job_title: jobTitle || null,
        phone: phone || null,
        legal_entity_id: legalEntityId ? Number(legalEntityId) : null,
        delegates_for_user_id: delegatesForId ? Number(delegatesForId) : null,
        can_create_expenses: canExpenses,
        can_create_corporate_expenses: canCorp,
        can_invoice_corporation: canInvoice,
        is_amex_reconciler: isAmex,
        requires_time_tracking: timeTracking,
        has_executive_reporting: execReporting,
        can_access_accounting: canAccounting,
        can_view_analytics: canAnalytics,
        project_ids: projectIds,
      });
      onSaved(updated);
    } catch (e: any) {
      setError(e?.message ?? tu("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      await apiDelete(`/users/${user.id}`);
      onDeleted(user.id);
    } finally { setDeleting(false); }
  };

  const bossCandidates = allUsers.filter((u) => u.id !== user.id && ["manager", "executive"].includes(u.role));
  const inp = (value: string, set: (v: string) => void, ph = "") => (
    <input type="text" placeholder={ph} value={value} onChange={(e) => set(e.target.value)}
      className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted" />
  );
  const fieldLabel = (label: string) => (
    <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted">{label}</p>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-subtle px-4 py-3">
        <button type="button" onClick={onBack} className="mr-1 text-muted hover:text-secondary">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <StatusDot active={isActive} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[12px] font-semibold text-secondary">{user.full_name}</p>
          <p className="truncate font-mono text-[10px] text-muted">{user.email}</p>
        </div>
        <RoleBadge role={user.role} />
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Identity */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{tu("sectionIdentity")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>{fieldLabel(tu("fieldFullName"))}{inp(fullName, setFullName, tu("invitePlaceholderName"))}</div>
            <div>{fieldLabel(tu("fieldJobTitle"))}{inp(jobTitle, setJobTitle, tu("invitePlaceholderJobTitle"))}</div>
            <div>{fieldLabel(tu("fieldDepartment"))}{inp(department, setDepartment, tu("invitePlaceholderDepartment"))}</div>
            <div>{fieldLabel(tu("fieldPhone"))}{inp(phone, setPhone, tu("invitePlaceholderPhone"))}</div>
          </div>
        </div>

        {/* Role & Status */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{tu("sectionRoleStatus")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {fieldLabel(tu("fieldRole"))}
              <select value={role} onChange={(e) => setRole(e.target.value as RoleOption)}
                className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary outline-none focus:bg-accent-muted">
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, tu)}</option>)}
              </select>
            </div>
            <div>
              {fieldLabel(tu("fieldStatus"))}
              <button type="button" onClick={() => setIsActive(!isActive)}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                  isActive ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300/70" : "border-default bg-surface-1 text-muted"
                }`}>
                <StatusDot active={isActive} />
                {isActive ? tu("statusActive") : tu("statusInactive")}
              </button>
            </div>
          </div>
        </div>

        {/* Organisation */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{tu("sectionOrganisation")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {fieldLabel(tu("fieldLegalEntity"))}
              <select value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}
                className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary outline-none focus:bg-accent-muted">
                <option value="">{tu("entityNone")}</option>
                {legalEntities.map((e) => <option key={e.id} value={String(e.id)}>{e.entity_name}</option>)}
              </select>
            </div>
            {role === "secretary" && (
              <div>
                {fieldLabel(tu("fieldDelegatesFor"))}
                <select value={delegatesForId} onChange={(e) => setDelegatesForId(e.target.value)}
                  className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary outline-none focus:bg-accent-muted">
                  <option value="">{tu("entityNotAssigned")}</option>
                  {bossCandidates.map((u) => <option key={u.id} value={String(u.id)}>{u.full_name} ({u.role})</option>)}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Projects */}
        {projects.length > 0 && (
          <div>
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{tu("sectionProjects")}</p>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const on = projectIds.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => setProjectIds(on ? projectIds.filter((x) => x !== p.id) : [...projectIds, p.id])}
                    className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                      on ? "border-sky-500/25 bg-accent/[0.08] text-accent/70" : "border-default text-muted hover:text-tertiary"
                    }`}>
                    {p.code || p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Capabilities
            Only show chips whose underlying module is actually installed.
            Time Tracking and Amex Reconciliation are add-on modules — their
            capability chips must disappear when the add-on is not installed,
            otherwise admins could grant a capability that has no UI anywhere. */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-muted">{tu("sectionCapabilities")}</p>
          <div className="flex flex-wrap gap-1.5">
            <FlagToggle label={tu("capCreateExpenses")}    value={canExpenses}   onChange={setCanExpenses} />
            <FlagToggle label={tu("capCorporateExpenses")}  value={canCorp}       onChange={setCanCorp} />
            {companySetup?.time_allocation_module_enabled ? (
              <FlagToggle label={tu("capTimeTracking")}     value={timeTracking}  onChange={setTimeTracking} />
            ) : null}
            {companySetup?.amex_reconciliation_module_enabled ? (
              <FlagToggle label={tu("capAmexReconciler")}   value={isAmex}        onChange={setIsAmex} />
            ) : null}
            <FlagToggle label={tu("capExecReporting")}      value={execReporting} onChange={setExecReporting} />
            {companySetup?.accounting_module_enabled ? (
              <>
                <FlagToggle label={tu("capAccessAccounting")} value={canAccounting} onChange={setCanAccounting} />
                <FlagToggle label={tu("capViewAnalytics")}   value={canAnalytics}  onChange={setCanAnalytics} />
              </>
            ) : null}
          </div>
          {role === "secretary" && (
            <p className="mt-2 text-[9px] text-muted">{tu("secretaryNote")}</p>
          )}
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-subtle bg-surface-1 p-3 text-center">
          {[[tu("timestampCreated"), user.created_at], [tu("timestampInvited"), user.invited_at], [tu("timestampLastLogin"), user.last_login_at]].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-[9px] uppercase tracking-widest text-muted">{label}</p>
              <p className="mt-0.5 font-mono text-[9.5px] text-tertiary">{formatDate(value as string | null)}</p>
            </div>
          ))}
        </div>

        {error && <p className="text-[10px] text-error/60">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-subtle pt-3">
          <button type="button" onClick={handleDelete} disabled={deleting}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
              confirmDel ? "border-error bg-red-600/15 text-error/80" : "border-default text-muted hover:text-error/60"
            }`}>
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {confirmDel ? tu("actionConfirmRemove") : tu("actionRemove")}
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded border border-subtle bg-surface-2 px-3 py-1 text-[10px] font-semibold text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tu("inviteCreating")}…</> : <><Check className="h-3 w-3" /> {tu("update")}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Invite form ───────────────────────────────────────────────────────────────

function InviteForm({
  companyId, allUsers, legalEntities, onCreated, onCancel,
}: {
  companyId: number;
  allUsers: UserFull[];
  legalEntities: LegalEntity[];
  onCreated: (u: UserFull) => void;
  onCancel: () => void;
}) {
  const [email,    setEmail]    = useState("");
  const [fullName, setFullName] = useState("");
  const [role,     setRole]     = useState<RoleOption>("employee");
  const [jobTitle, setJobTitle] = useState("");
  const [entityId, setEntityId] = useState("");
  const [delegatesForId, setDelegatesForId] = useState("");
  const [sendInvite, setSendInvite] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const tu = useTranslations("admin.users");
  const tc = useTranslations("common");

  const handleCreate = async () => {
    if (!email.trim() || !fullName.trim()) { setError(tu("inviteErrorRequired")); return; }
    setSaving(true); setError(null);
    try {
      const created = await apiPost<UserFull>("/users/", {
        company_id: companyId,
        email: email.trim(),
        full_name: fullName.trim(),
        role,
        job_title: jobTitle || null,
        legal_entity_id: entityId ? Number(entityId) : null,
        delegates_for_user_id: delegatesForId ? Number(delegatesForId) : null,
        send_invite: sendInvite,
      });
      onCreated(created);
    } catch (e: any) {
      setError(e?.message ?? tu("inviteErrorCreate"));
    } finally { setSaving(false); }
  };

  const bossCandidates = allUsers.filter((u) => ["manager", "executive"].includes(u.role));

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-default bg-surface-1">
      <div className="border-b border-subtle px-4 py-2.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{tu("inviteFormTitle")}</p>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input type="text" placeholder={tu("invitePlaceholderName")} value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted" />
          <input type="email" placeholder={tu("invitePlaceholderEmail")} value={email} onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-default bg-surface-1 px-2 py-1.5 font-mono text-[10px] text-tertiary placeholder:text-muted outline-none focus:bg-accent-muted" />
          <input type="text" placeholder={tu("invitePlaceholderJobTitle")} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
            className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted" />
          <select value={role} onChange={(e) => setRole(e.target.value as RoleOption)}
            className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-tertiary outline-none focus:bg-accent-muted">
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r, tu)}</option>)}
          </select>
          {legalEntities.length > 0 && (
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}
              className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-tertiary outline-none focus:bg-accent-muted">
              <option value="">{tu("inviteLegalEntityOptional")}</option>
              {legalEntities.map((e) => <option key={e.id} value={String(e.id)}>{e.entity_name}</option>)}
            </select>
          )}
          {role === "secretary" && bossCandidates.length > 0 && (
            <select value={delegatesForId} onChange={(e) => setDelegatesForId(e.target.value)}
              className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-tertiary outline-none focus:bg-accent-muted">
              <option value="">{tu("inviteDelegatesFor")}</option>
              {bossCandidates.map((u) => <option key={u.id} value={String(u.id)}>{u.full_name}</option>)}
            </select>
          )}
        </div>
        <label className="mb-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-3 w-3 accent-blue-500" />
          <span className="text-[10px] text-tertiary">{tu("inviteSendLink")}</span>
        </label>
        {error && <p className="mb-2 text-[10px] text-error/60">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCreate} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded border border-subtle bg-surface-2 px-3 py-1 text-[10px] font-semibold text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tu("inviteCreating")}…</> : tu("inviteCreateUser")}
          </button>
          <button type="button" onClick={onCancel} className="text-[10px] text-muted hover:text-tertiary">{tc("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminUsersPanel({ companyId, users, onUsersChanged, companySetup }: Props) {
  const tu = useTranslations("admin.users");
  const [selectedUser,  setSelectedUser]  = useState<UserFull | null>(null);
  const [isEditMode,    setIsEditMode]    = useState(false);
  const [showForm,      setShowForm]      = useState(false);
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);

  useEffect(() => {
    Promise.all([
      apiCall<Project[]>(`/projects/?company_id=${companyId}`).catch(() => []),
      apiCall<LegalEntity[]>(`/admin/company-setup/${companyId}/legal-entities`).catch(() => []),
    ]).then(([p, e]) => {
      if (Array.isArray(p)) setProjects(p);
      if (Array.isArray(e)) setLegalEntities(e);
    });
  }, [companyId]);

  const handleSaved = (updated: UserFull) => {
    onUsersChanged(users.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUser(updated);
    setIsEditMode(false);
  };
  const handleDeleted = (id: number) => { onUsersChanged(users.filter((u) => u.id !== id)); setSelectedUser(null); setIsEditMode(false); };
  const handleCreated = (created: UserFull) => { onUsersChanged([...users, created]); setShowForm(false); };

  // Show edit panel when in edit mode
  if (selectedUser && isEditMode) {
    return (
      <div className="max-w-xl">
        <UserEditPanel
          user={selectedUser} allUsers={users} projects={projects} legalEntities={legalEntities}
          companySetup={companySetup ?? null}
          onSaved={handleSaved} onDeleted={handleDeleted} onBack={() => setIsEditMode(false)}
        />
      </div>
    );
  }

  // Show detail panel when a user is selected
  if (selectedUser) {
    return (
      <div className="max-w-xl">
        <UserDetailPanel
          user={selectedUser}
          legalEntities={legalEntities}
          onSaved={handleSaved}
          onBack={() => { setSelectedUser(null); setIsEditMode(false); }}
          onEdit={() => setIsEditMode(true)}
        />
      </div>
    );
  }

  const roleGroups = [
    { label: tu("groupExecManagement"), roles: ["admin", "executive", "manager"] },
    { label: tu("groupOperations"),      roles: ["secretary", "accounting"] },
    { label: tu("groupEmployees"),        roles: ["employee"] },
  ].map((g) => ({ ...g, users: users.filter((u) => g.roles.includes(u.role)) }));

  const allGrouped = new Set(roleGroups.flatMap((g) => g.users.map((u) => u.id)));
  const others = users.filter((u) => !allGrouped.has(u.id));

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-primary">{tu("title")}</h2>
          <span className="rounded border border-default bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {users.filter((u) => u.is_active).length} / {users.length}
          </span>
        </div>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-default bg-surface-1 px-2.5 py-1 text-[10px] font-semibold text-tertiary transition-colors hover:border-strong hover:text-secondary">
            <Plus className="h-3 w-3" />
            {tu("inviteUser")}
          </button>
        )}
      </div>

      {users.length === 0 && !showForm ? (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-8 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-muted" />
          <p className="text-xs text-muted italic">{tu("noUsers")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-default">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1.5fr_110px_80px_20px] items-center gap-x-3 border-b border-subtle bg-surface-1 px-4 py-1.5">
            {[tu("colName"), tu("colEmail"), tu("colRole"), tu("colFlags"), ""].map((h, i) => (
              <span key={i} className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-muted">{h}</span>
            ))}
          </div>

          {[...roleGroups, ...(others.length > 0 ? [{ label: tu("groupOther"), roles: [], users: others }] : [])].map((group) => {
            if (group.users.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-4 py-1 bg-surface-0 border-b border-subtle">
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">{group.label}</span>
                </div>
                {group.users.map((user) => (
                  <button key={user.id} type="button" onClick={() => setSelectedUser(user)}
                    className="grid w-full grid-cols-[1fr_1.5fr_110px_80px_20px] items-center gap-x-3 border-b border-subtle px-4 py-2.5 text-left last:border-0 hover:bg-surface-1 group">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot active={user.is_active} />
                      <span className="truncate text-[11px] font-medium text-secondary">{user.full_name}</span>
                      {user.delegates_for_user_name && (
                        <span className="shrink-0 text-[9px] text-purple-300/50">→ {user.delegates_for_user_name}</span>
                      )}
                    </div>
                    <span className="truncate font-mono text-[10px] text-tertiary">{user.email}</span>
                    <div><RoleBadge role={user.role} /></div>
                    <div className="flex flex-wrap gap-0.5">
                      {user.can_create_corporate_expenses && (
                        <span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1 py-0.5 text-[8px] text-warning/50">corp</span>
                      )}
                      {user.is_amex_reconciler && (
                        <span className="rounded border border-sky-500/20 bg-accent/[0.06] px-1 py-0.5 text-[8px] text-accent/50">amex</span>
                      )}
                      {user.has_executive_reporting && (
                        <span className="rounded border border-rose-500/20 bg-rose-500/[0.06] px-1 py-0.5 text-[8px] text-rose-300/50">exec</span>
                      )}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <InviteForm
          companyId={companyId} allUsers={users} legalEntities={legalEntities}
          onCreated={handleCreated} onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
