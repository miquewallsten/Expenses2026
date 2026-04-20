"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { UserProvider, useUserContext } from "@/context/UserContext";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeProject {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  client: string | null;
  cost_center: string | null;
  discipline: string | null;
  status: string;
  budget_hours: number | null;
  start_date: string | null;
  end_date: string | null;
}

interface TimeActivity {
  id: number;
  code: string | null;
  name: string;
  discipline: string | null;
  is_active: boolean;
}

interface TimeAssignment {
  id: number;
  project_id: number;
  user_id: number;
  user_name: string | null;
  role: string;
  budget_hours: number | null;
  is_active: boolean;
}

type AdminTab = "projects" | "activities";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_CLS: Record<string, string> = {
  active:    "text-emerald-300/70 bg-emerald-500/[0.08]",
  inactive:  "text-white/30 bg-white/[0.05]",
  completed: "text-blue-300/70 bg-blue-500/[0.08]",
  on_hold:   "text-amber-300/70 bg-amber-500/[0.08]",
};

// ── Project form ───────────────────────────────────────────────────────────────

function ProjectForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial?: Partial<TimeProject>;
  onSave: (data: Partial<TimeProject>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<TimeProject>>(
    initial ?? { status: "active" }
  );
  const set = (k: keyof TimeProject, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Code</label>
          <input
            value={form.code ?? ""}
            onChange={(e) => set("code", e.target.value || null)}
            placeholder="e.g. PROJ-001"
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Status</label>
          <select
            value={form.status ?? "active"}
            onChange={(e) => set("status", e.target.value)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="on_hold">On Hold</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>
      <div>
        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Name *</label>
        <input
          value={form.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Project name"
          className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Client</label>
          <input
            value={form.client ?? ""}
            onChange={(e) => set("client", e.target.value || null)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Cost Center</label>
          <input
            value={form.cost_center ?? ""}
            onChange={(e) => set("cost_center", e.target.value || null)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Budget Hours</label>
          <input
            type="number"
            value={form.budget_hours ?? ""}
            onChange={(e) => set("budget_hours", e.target.value ? parseFloat(e.target.value) : null)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Start</label>
          <input
            type="date"
            value={form.start_date ?? ""}
            onChange={(e) => set("start_date", e.target.value || null)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/60 outline-none focus:border-white/[0.14]"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">End</label>
          <input
            type="date"
            value={form.end_date ?? ""}
            onChange={(e) => set("end_date", e.target.value || null)}
            className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/60 outline-none focus:border-white/[0.14]"
          />
        </div>
      </div>
      <div>
        <label className="mb-0.5 block text-[9px] font-bold uppercase tracking-widest text-white/28">Description</label>
        <textarea
          value={form.description ?? ""}
          onChange={(e) => set("description", e.target.value || null)}
          rows={2}
          className="w-full resize-none rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/70 outline-none focus:border-white/[0.14]"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={!form.name || saving}
          onClick={() => onSave(form)}
          className="flex items-center gap-1.5 rounded bg-indigo-600/70 px-3 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-indigo-600/90 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
          {initial?.id ? "Save Changes" : "Create Project"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-[10px] text-white/30 hover:text-white/55"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({
  asgn,
  onRemove,
}: {
  asgn: TimeAssignment;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-white/[0.06] px-2.5 py-1.5">
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/[0.05] text-[7px] font-bold uppercase text-white/30">
        {(asgn.user_name ?? "?").slice(0, 2)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium text-white/60">{asgn.user_name ?? `User ${asgn.user_id}`}</p>
        <p className="text-[9px] text-white/25 capitalize">{asgn.role}{asgn.budget_hours ? ` · ${asgn.budget_hours} h budget` : ""}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="text-white/18 hover:text-red-300/50"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Project row (expandable) ──────────────────────────────────────────────────

function ProjectRow({
  proj,
  companyId,
  onEdit,
  onDeleted,
}: {
  proj: TimeProject;
  companyId: number;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [assignments, setAssignments] = useState<TimeAssignment[]>([]);
  const [loadingAsgn, setLoadingAsgn] = useState(false);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newRole, setNewRole] = useState("team_member");
  const [newBudget, setNewBudget] = useState("");
  const [savingAsgn, setSavingAsgn] = useState(false);

  async function loadAssignments() {
    setLoadingAsgn(true);
    try {
      const res = await fetch(`${API}/time/${companyId}/projects/${proj.id}/assignments`);
      if (res.ok) setAssignments(await res.json());
    } finally {
      setLoadingAsgn(false);
    }
  }

  function toggle() {
    if (!expanded) loadAssignments();
    setExpanded((v) => !v);
  }

  async function addAssignment() {
    if (!newUserId) return;
    setSavingAsgn(true);
    try {
      const res = await fetch(`${API}/time/${companyId}/projects/${proj.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: parseInt(newUserId, 10),
          user_name: newUserName || null,
          role: newRole,
          budget_hours: newBudget ? parseFloat(newBudget) : null,
        }),
      });
      if (res.ok) {
        await loadAssignments();
        setShowAssignForm(false);
        setNewUserId(""); setNewUserName(""); setNewRole("team_member"); setNewBudget("");
      }
    } finally {
      setSavingAsgn(false);
    }
  }

  async function removeAssignment(id: number) {
    await fetch(`${API}/time/${companyId}/assignments/${id}`, { method: "DELETE" });
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  const statusCls = STATUS_CLS[proj.status] ?? "text-white/25 bg-white/[0.04]";
  const util = proj.budget_hours
    ? null // would need logged hours from server; just show budget for now
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.01]">
      {/* Summary row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" onClick={toggle} className="text-white/22 hover:text-white/50">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {proj.code && <span className="text-[9px] text-white/30">[{proj.code}]</span>}
            <span className="text-[11px] font-medium text-white/65">{proj.name}</span>
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${statusCls}`}>
              {proj.status}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[9px] text-white/25">
            {proj.client && <span>{proj.client}</span>}
            {proj.cost_center && <span>· {proj.cost_center}</span>}
            {proj.budget_hours && <span>· {proj.budget_hours} h budget</span>}
            {proj.start_date && <span>· {fmtDate(proj.start_date)} → {fmtDate(proj.end_date)}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex h-6 w-6 items-center justify-center rounded text-white/20 hover:bg-white/[0.05] hover:text-white/50"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>

      {/* Expanded: assignments */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2.5">
          <div className="mb-2 flex items-center gap-1.5">
            <Users className="h-3 w-3 text-white/22" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-white/22">Assigned Personnel</span>
            <button
              type="button"
              onClick={() => setShowAssignForm((v) => !v)}
              className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] text-white/28 hover:bg-white/[0.05] hover:text-white/55"
            >
              <Plus className="h-2.5 w-2.5" /> Assign
            </button>
          </div>

          {loadingAsgn ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white/20" />
          ) : (
            <div className="space-y-1.5">
              {assignments.filter((a) => a.is_active).map((a) => (
                <AssignmentRow key={a.id} asgn={a} onRemove={() => removeAssignment(a.id)} />
              ))}
              {assignments.filter((a) => a.is_active).length === 0 && (
                <p className="text-[9px] text-white/20">No personnel assigned.</p>
              )}
            </div>
          )}

          {showAssignForm && (
            <div className="mt-2.5 space-y-2 rounded border border-white/[0.07] p-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">User ID *</label>
                  <input
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
                    placeholder="e.g. 42"
                    className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Full Name</label>
                  <input
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Display name"
                    className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none"
                  >
                    <option value="team_member">Team Member</option>
                    <option value="lead">Lead</option>
                    <option value="coordinator">Coordinator</option>
                  </select>
                </div>
                <div>
                  <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Budget Hours</label>
                  <input
                    type="number"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!newUserId || savingAsgn}
                  onClick={addAssignment}
                  className="flex items-center gap-1 rounded bg-indigo-600/60 px-2.5 py-1 text-[9px] font-semibold text-white/90 disabled:opacity-40 hover:bg-indigo-600/80"
                >
                  {savingAsgn ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
                  Assign
                </button>
                <button type="button" onClick={() => setShowAssignForm(false)} className="text-[9px] text-white/28 hover:text-white/50">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Activities panel ──────────────────────────────────────────────────────────

function ActivitiesPanel({ companyId }: { companyId: number }) {
  const [activities, setActivities] = useState<TimeActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDiscipline, setNewDiscipline] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const res = await fetch(`${API}/time/${companyId}/activities?active_only=false`);
    if (res.ok) setActivities(await res.json());
    setLoading(false);
  }

  useEffect(() => { load(); }, [companyId]);

  async function createActivity() {
    if (!newName) return;
    setSaving(true);
    const res = await fetch(`${API}/time/${companyId}/activities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: newCode || null, name: newName, discipline: newDiscipline || null }),
    });
    if (res.ok) {
      await load();
      setNewCode(""); setNewName(""); setNewDiscipline("");
      setShowForm(false);
    }
    setSaving(false);
  }

  async function toggleActive(id: number, current: boolean) {
    await fetch(`${API}/time/${companyId}/activities/${id}/active?is_active=${!current}`, { method: "PATCH" });
    setActivities((prev) => prev.map((a) => a.id === id ? { ...a, is_active: !current } : a));
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/35">Activity / Discipline Catalog</h3>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-[9px] text-white/30 hover:bg-white/[0.05] hover:text-white/55"
        >
          <Plus className="h-2.5 w-2.5" /> New Activity
        </button>
      </div>

      {showForm && (
        <div className="mb-3 space-y-2 rounded-lg border border-white/[0.07] p-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Code</label>
              <input value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none" />
            </div>
            <div>
              <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Name *</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none" />
            </div>
            <div>
              <label className="mb-0.5 block text-[8px] font-bold uppercase tracking-widest text-white/22">Discipline</label>
              <input value={newDiscipline} onChange={(e) => setNewDiscipline(e.target.value)} placeholder="e.g. Engineering" className="w-full rounded border border-white/[0.07] bg-white/[0.03] px-2 py-1 text-[10px] text-white/70 outline-none" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!newName || saving}
              onClick={createActivity}
              className="flex items-center gap-1 rounded bg-indigo-600/60 px-2.5 py-1 text-[9px] font-semibold text-white/90 disabled:opacity-40 hover:bg-indigo-600/80"
            >
              {saving ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : null}
              Create
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-[9px] text-white/28 hover:text-white/50">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white/20" />
      ) : activities.length === 0 ? (
        <p className="text-[10px] text-white/22">No activities configured yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07]">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">Code</th>
                <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">Name</th>
                <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">Discipline</th>
                <th className="px-3 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest text-white/22">Active</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((a) => (
                <tr key={a.id} className={`border-b border-white/[0.04] ${!a.is_active ? "opacity-40" : ""}`}>
                  <td className="px-3 py-1.5 text-white/30">{a.code ?? "—"}</td>
                  <td className="px-3 py-1.5 font-medium text-white/60">{a.name}</td>
                  <td className="px-3 py-1.5 text-white/35">{a.discipline ?? "—"}</td>
                  <td className="px-3 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => toggleActive(a.id, a.is_active)}
                      className={`h-4 w-7 rounded-full transition-colors ${a.is_active ? "bg-emerald-600/50" : "bg-white/[0.08]"}`}
                    >
                      <span className={`block h-3 w-3 rounded-full bg-white/70 transition-transform ${a.is_active ? "translate-x-3.5" : "translate-x-0.5"}`} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function TimeAdminPanel() {
  const { companyId } = useUserContext();
  const [tab, setTab] = useState<AdminTab>("projects");
  const [projects, setProjects] = useState<TimeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewProject, setShowNewProject] = useState(false);
  const [editingProject, setEditingProject] = useState<TimeProject | null>(null);
  const [saving, setSaving] = useState(false);

  const loadProjects = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const res = await fetch(`${API}/time/${companyId}/projects`);
    if (res.ok) setProjects(await res.json());
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadProjects(); }, [loadProjects]);

  async function saveProject(data: Partial<TimeProject>) {
    if (!companyId) return;
    setSaving(true);
    try {
      const isEdit = !!editingProject?.id;
      const url = isEdit
        ? `${API}/time/${companyId}/projects/${editingProject!.id}`
        : `${API}/time/${companyId}/projects`;
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await loadProjects();
        setShowNewProject(false);
        setEditingProject(null);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-zinc-950 text-white">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] px-4">
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Time Tracking Setup</span>
        <div className="ml-8 flex gap-1">
          {(["projects", "activities"] as AdminTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                tab === t ? "bg-white/[0.07] text-white/65" : "text-white/25 hover:text-white/45"
              }`}
            >
              {t === "projects" ? "Projects" : "Activities"}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tab === "projects" && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <h2 className="text-[11px] font-semibold text-white/50">Projects</h2>
              <button
                type="button"
                onClick={() => { setShowNewProject(true); setEditingProject(null); }}
                className="ml-auto flex items-center gap-1.5 rounded bg-indigo-600/60 px-3 py-1.5 text-[10px] font-semibold text-white/90 hover:bg-indigo-600/80"
              >
                <Plus className="h-3 w-3" /> New Project
              </button>
            </div>

            {/* New / edit form */}
            {(showNewProject || editingProject) && (
              <div className="mb-4 rounded-lg border border-indigo-500/20 bg-indigo-900/[0.06] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-white/50">
                    {editingProject ? "Edit Project" : "New Project"}
                  </span>
                  <button
                    type="button"
                    onClick={() => { setShowNewProject(false); setEditingProject(null); }}
                    className="text-white/25 hover:text-white/50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <ProjectForm
                  initial={editingProject ?? undefined}
                  onSave={saveProject}
                  onCancel={() => { setShowNewProject(false); setEditingProject(null); }}
                  saving={saving}
                />
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-white/20" />
              </div>
            ) : projects.length === 0 ? (
              <p className="py-8 text-center text-[11px] text-white/22">No projects yet.</p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <ProjectRow
                    key={p.id}
                    proj={p}
                    companyId={companyId!}
                    onEdit={() => { setEditingProject(p); setShowNewProject(false); }}
                    onDeleted={loadProjects}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "activities" && companyId && (
          <ActivitiesPanel companyId={companyId} />
        )}
      </div>
    </div>
  );
}

export default function TimeAdminPage() {
  return (
    <UserProvider>
      <TimeAdminPanel />
    </UserProvider>
  );
}
