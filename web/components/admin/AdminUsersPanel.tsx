"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Users, Plus, Trash2, Loader2, Check, ChevronRight,
  ToggleLeft, ToggleRight, ArrowLeft,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

const ROLES = ["employee", "manager", "accounting", "admin", "executive", "secretary"] as const;
type RoleOption = (typeof ROLES)[number];

// Display labels for roles that differ from the stored key
const ROLE_LABELS: Record<string, string> = {
  secretary: "Executive Assistant",
};
const roleLabel = (r: string) => ROLE_LABELS[r] ?? (r.charAt(0).toUpperCase() + r.slice(1));

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
  invited_at: string | null;
  last_login_at: string | null;
  created_at: string;
  project_ids: number[];
}

interface Props {
  companyId: number;
  users: UserFull[];
  onUsersChanged: (users: UserFull[]) => void;
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
  manager:    "text-sky-300/70     border-sky-500/20     bg-sky-500/[0.06]",
  accounting: "text-amber-300/70   border-amber-500/20   bg-amber-500/[0.06]",
  executive:  "text-rose-300/70    border-rose-500/20    bg-rose-500/[0.06]",
  secretary:  "text-purple-300/70  border-purple-500/20  bg-purple-500/[0.06]",
  employee:   "text-white/40       border-white/[0.08]   bg-white/[0.03]",
};

function RoleBadge({ role }: { role: string }) {
  const cls = ROLE_COLORS[role] ?? ROLE_COLORS.employee;
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {roleLabel(role)}
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className={`inline-block h-1.5 w-1.5 rounded-full ${active ? "bg-emerald-400/70" : "bg-white/15"}`} />
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
          ? "border-indigo-500/25 bg-indigo-600/10 text-indigo-300/70"
          : "border-white/[0.07] bg-white/[0.02] text-white/30 hover:text-white/55"
      }`}
    >
      {value ? <ToggleRight className="h-3 w-3" /> : <ToggleLeft className="h-3 w-3" />}
      {label}
    </button>
  );
}

// ── User detail panel ─────────────────────────────────────────────────────────

function UserDetailPanel({
  user,
  allUsers,
  projects,
  legalEntities,
  onSaved,
  onDeleted,
  onBack,
}: {
  user: UserFull;
  allUsers: UserFull[];
  projects: Project[];
  legalEntities: LegalEntity[];
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
  const [projectIds,    setProjectIds]    = useState<number[]>(user.project_ids ?? []);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [confirmDel,    setConfirmDel]    = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const tu = useTranslations("admin.users");

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
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
          project_ids: projectIds,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `${res.status}`);
      }
      const updated = await res.json();
      onSaved(updated);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    setDeleting(true);
    try {
      const res = await fetch(`${API}/users/${user.id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`${res.status}`);
      onDeleted(user.id);
    } finally { setDeleting(false); }
  };

  const bossCandidates = allUsers.filter((u) => u.id !== user.id && ["manager", "executive"].includes(u.role));
  const inp = (value: string, set: (v: string) => void, ph = "") => (
    <input type="text" placeholder={ph} value={value} onChange={(e) => set(e.target.value)}
      className="w-full rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-indigo-500/40" />
  );
  const fieldLabel = (label: string) => (
    <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-white/22">{label}</p>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <button type="button" onClick={onBack} className="mr-1 text-white/25 hover:text-white/60">
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <StatusDot active={isActive} />
        <div className="flex-1 min-w-0">
          <p className="truncate text-[12px] font-semibold text-white/80">{user.full_name}</p>
          <p className="truncate font-mono text-[10px] text-white/35">{user.email}</p>
        </div>
        <RoleBadge role={user.role} />
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* Identity */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/18">{tu("sectionIdentity")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>{fieldLabel(tu("fieldFullName"))}{inp(fullName, setFullName, tu("invitePlaceholderName"))}</div>
            <div>{fieldLabel(tu("fieldJobTitle"))}{inp(jobTitle, setJobTitle, "e.g. Finance Manager")}</div>
            <div>{fieldLabel(tu("fieldDepartment"))}{inp(department, setDepartment, "e.g. Finance")}</div>
            <div>{fieldLabel(tu("fieldPhone"))}{inp(phone, setPhone, "+52 55 1234 5678")}</div>
          </div>
        </div>

        {/* Role & Status */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/18">{tu("sectionRoleStatus")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {fieldLabel(tu("fieldRole"))}
              <select value={role} onChange={(e) => setRole(e.target.value as RoleOption)}
                className="w-full rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-indigo-500/40">
                {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
              </select>
            </div>
            <div>
              {fieldLabel(tu("fieldStatus"))}
              <button type="button" onClick={() => setIsActive(!isActive)}
                className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[10px] font-semibold transition-colors ${
                  isActive ? "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300/70" : "border-white/[0.07] bg-white/[0.03] text-white/30"
                }`}>
                <StatusDot active={isActive} />
                {isActive ? tu("statusActive") : tu("statusInactive")}
              </button>
            </div>
          </div>
        </div>

        {/* Organisation */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/18">{tu("sectionOrganisation")}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              {fieldLabel(tu("fieldLegalEntity"))}
              <select value={legalEntityId} onChange={(e) => setLegalEntityId(e.target.value)}
                className="w-full rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-indigo-500/40">
                <option value="">{tu("entityNone")}</option>
                {legalEntities.map((e) => <option key={e.id} value={String(e.id)}>{e.entity_name}</option>)}
              </select>
            </div>
            {role === "secretary" && (
              <div>
                {fieldLabel(tu("fieldDelegatesFor"))}
                <select value={delegatesForId} onChange={(e) => setDelegatesForId(e.target.value)}
                  className="w-full rounded border border-white/[0.08] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-indigo-500/40">
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
            <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/18">{tu("sectionProjects")}</p>
            <div className="flex flex-wrap gap-1.5">
              {projects.map((p) => {
                const on = projectIds.includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => setProjectIds(on ? projectIds.filter((x) => x !== p.id) : [...projectIds, p.id])}
                    className={`rounded border px-2 py-0.5 text-[10px] transition-colors ${
                      on ? "border-sky-500/25 bg-sky-500/[0.08] text-sky-300/70" : "border-white/[0.07] text-white/30 hover:text-white/55"
                    }`}>
                    {p.code || p.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Capabilities */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-white/18">{tu("sectionCapabilities")}</p>
          <div className="flex flex-wrap gap-1.5">
            <FlagToggle label={tu("capCreateExpenses")}    value={canExpenses}   onChange={setCanExpenses} />
            <FlagToggle label={tu("capCorporateExpenses")}  value={canCorp}       onChange={setCanCorp} />
            <FlagToggle label={tu("capInvoiceCorporation")} value={canInvoice}    onChange={setCanInvoice} />
            <FlagToggle label={tu("capAmexReconciler")}     value={isAmex}        onChange={setIsAmex} />
            <FlagToggle label={tu("capTimeTracking")}       value={timeTracking}  onChange={setTimeTracking} />
            <FlagToggle label={tu("capExecReporting")}      value={execReporting} onChange={setExecReporting} />
          </div>
          {role === "secretary" && (
            <p className="mt-2 text-[9px] text-white/20">{tu("secretaryNote")}</p>
          )}
        </div>

        {/* Timestamps */}
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-white/[0.06] bg-white/[0.015] p-3 text-center">
          {[[tu("timestampCreated"), user.created_at], [tu("timestampInvited"), user.invited_at], [tu("timestampLastLogin"), user.last_login_at]].map(([label, value]) => (
            <div key={label as string}>
              <p className="text-[9px] uppercase tracking-widest text-white/20">{label}</p>
              <p className="mt-0.5 font-mono text-[9.5px] text-white/40">{formatDate(value as string | null)}</p>
            </div>
          ))}
        </div>

        {error && <p className="text-[10px] text-red-400/60">{error}</p>}

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
          <button type="button" onClick={handleDelete} disabled={deleting}
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
              confirmDel ? "border-red-500/30 bg-red-600/15 text-red-400/80" : "border-white/[0.07] text-white/25 hover:text-red-400/60"
            }`}>
            {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            {confirmDel ? tu("actionConfirmRemove") : tu("actionRemove")}
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:opacity-50">
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
      const res = await fetch(`${API}/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          company_id: companyId,
          email: email.trim(),
          full_name: fullName.trim(),
          role,
          job_title: jobTitle || null,
          legal_entity_id: entityId ? Number(entityId) : null,
          delegates_for_user_id: delegatesForId ? Number(delegatesForId) : null,
          send_invite: sendInvite,
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.detail ?? `${res.status}`); }
      onCreated(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "Create failed");
    } finally { setSaving(false); }
  };

  const bossCandidates = allUsers.filter((u) => ["manager", "executive"].includes(u.role));

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <div className="border-b border-white/[0.05] px-4 py-2.5">
        <p className="text-[9px] font-bold uppercase tracking-widest text-white/22">{tu("inviteFormTitle")}</p>
      </div>
      <div className="px-4 py-3">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input type="text" placeholder={tu("invitePlaceholderName")} value={fullName} onChange={(e) => setFullName(e.target.value)}
            className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-indigo-500/40" />
          <input type="email" placeholder={tu("invitePlaceholderEmail")} value={email} onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40" />
          <input type="text" placeholder={tu("invitePlaceholderJobTitle")} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
            className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-indigo-500/40" />
          <select value={role} onChange={(e) => setRole(e.target.value as RoleOption)}
            className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[10px] text-white/55 outline-none focus:border-indigo-500/40">
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
          {legalEntities.length > 0 && (
            <select value={entityId} onChange={(e) => setEntityId(e.target.value)}
              className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[10px] text-white/55 outline-none focus:border-indigo-500/40">
              <option value="">{tu("inviteLegalEntityOptional")}</option>
              {legalEntities.map((e) => <option key={e.id} value={String(e.id)}>{e.entity_name}</option>)}
            </select>
          )}
          {role === "secretary" && bossCandidates.length > 0 && (
            <select value={delegatesForId} onChange={(e) => setDelegatesForId(e.target.value)}
              className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[10px] text-white/55 outline-none focus:border-indigo-500/40">
              <option value="">{tu("inviteDelegatesFor")}</option>
              {bossCandidates.map((u) => <option key={u.id} value={String(u.id)}>{u.full_name}</option>)}
            </select>
          )}
        </div>
        <label className="mb-3 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={sendInvite} onChange={(e) => setSendInvite(e.target.checked)} className="h-3 w-3 accent-indigo-500" />
          <span className="text-[10px] text-white/40">{tu("inviteSendLink")}</span>
        </label>
        {error && <p className="mb-2 text-[10px] text-red-400/60">{error}</p>}
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCreate} disabled={saving}
            className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:opacity-50">
            {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tu("inviteCreating")}…</> : tu("inviteCreateUser")}
          </button>
          <button type="button" onClick={onCancel} className="text-[10px] text-white/30 hover:text-white/55">{tc("cancel")}</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AdminUsersPanel({ companyId, users, onUsersChanged }: Props) {
  const tu = useTranslations("admin.users");
  const [selectedUser,  setSelectedUser]  = useState<UserFull | null>(null);
  const [showForm,      setShowForm]      = useState(false);
  const [projects,      setProjects]      = useState<Project[]>([]);
  const [legalEntities, setLegalEntities] = useState<LegalEntity[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/projects/?company_id=${companyId}`, { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/admin/company-setup/${companyId}/legal-entities`, { headers: getAuthHeaders() }).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([p, e]) => {
      if (Array.isArray(p)) setProjects(p);
      if (Array.isArray(e)) setLegalEntities(e);
    });
  }, [companyId]);

  const handleSaved = (updated: UserFull) => {
    onUsersChanged(users.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUser(updated);
  };
  const handleDeleted = (id: number) => { onUsersChanged(users.filter((u) => u.id !== id)); setSelectedUser(null); };
  const handleCreated = (created: UserFull) => { onUsersChanged([...users, created]); setShowForm(false); };

  if (selectedUser) {
    return (
      <div className="max-w-xl">
        <UserDetailPanel
          user={selectedUser} allUsers={users} projects={projects} legalEntities={legalEntities}
          onSaved={handleSaved} onDeleted={handleDeleted} onBack={() => setSelectedUser(null)}
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
          <Users className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white">{tu("title")}</h2>
          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
            {users.filter((u) => u.is_active).length} / {users.length}
          </span>
        </div>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70">
            <Plus className="h-3 w-3" />
            {tu("inviteUser")}
          </button>
        )}
      </div>

      {users.length === 0 && !showForm ? (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
          <Users className="mx-auto mb-2 h-6 w-6 text-white/10" />
          <p className="text-xs text-white/20 italic">{tu("noUsers")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07]">
          {/* Column headers */}
          <div className="grid grid-cols-[1fr_1.5fr_110px_80px_20px] items-center gap-x-3 border-b border-white/[0.06] bg-white/[0.025] px-4 py-1.5">
            {[tu("colName"), tu("colEmail"), tu("colRole"), tu("colFlags"), ""].map((h, i) => (
              <span key={i} className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/18">{h}</span>
            ))}
          </div>

          {[...roleGroups, ...(others.length > 0 ? [{ label: tu("groupOther"), roles: [], users: others }] : [])].map((group) => {
            if (group.users.length === 0) return null;
            return (
              <div key={group.label}>
                <div className="px-4 py-1 bg-white/[0.01] border-b border-white/[0.035]">
                  <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-white/18">{group.label}</span>
                </div>
                {group.users.map((user) => (
                  <button key={user.id} type="button" onClick={() => setSelectedUser(user)}
                    className="grid w-full grid-cols-[1fr_1.5fr_110px_80px_20px] items-center gap-x-3 border-b border-white/[0.04] px-4 py-2.5 text-left last:border-0 hover:bg-white/[0.025] group">
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusDot active={user.is_active} />
                      <span className="truncate text-[11px] font-medium text-white/70">{user.full_name}</span>
                      {user.delegates_for_user_name && (
                        <span className="shrink-0 text-[9px] text-purple-300/50">→ {user.delegates_for_user_name}</span>
                      )}
                    </div>
                    <span className="truncate font-mono text-[10px] text-white/40">{user.email}</span>
                    <div><RoleBadge role={user.role} /></div>
                    <div className="flex flex-wrap gap-0.5">
                      {user.can_create_corporate_expenses && (
                        <span className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-1 py-0.5 text-[8px] text-amber-300/50">corp</span>
                      )}
                      {user.is_amex_reconciler && (
                        <span className="rounded border border-sky-500/20 bg-sky-500/[0.06] px-1 py-0.5 text-[8px] text-sky-300/50">amex</span>
                      )}
                      {user.has_executive_reporting && (
                        <span className="rounded border border-rose-500/20 bg-rose-500/[0.06] px-1 py-0.5 text-[8px] text-rose-300/50">exec</span>
                      )}
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-white/15 opacity-0 group-hover:opacity-100 transition-opacity" />
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
