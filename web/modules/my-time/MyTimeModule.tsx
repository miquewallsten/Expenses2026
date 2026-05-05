"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  Plus,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { useUserContext } from "@/context/UserContext";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimeProject {
  id: number;
  code: string | null;
  name: string;
  status: string;
  budget_hours: number | null;
}

interface TimeActivity {
  id: number;
  code: string | null;
  name: string;
  discipline: string | null;
}

interface WeekRow {
  project_id: number;
  project_name: string;
  project_code: string | null;
  activity_id: number | null;
  activity_name: string | null;
  entry_ids: Record<string, number | null>;
  hours: Record<string, number>;
  statuses: Record<string, string>;
}

interface WeekView {
  week_start: string;
  week_end: string;
  days: string[];
  rows: WeekRow[];
  daily_totals: Record<string, number>;
  week_total: number;
  week_status: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_CONFIG: Record<string, { cls: string; label: string }> = {
  draft:     { cls: "text-muted",          label: "Draft" },
  submitted: { cls: "text-blue-300/70",        label: "Submitted" },
  approved:  { cls: "text-emerald-300/70",     label: "Approved" },
  rejected:  { cls: "text-error/70",         label: "Rejected" },
  partial:   { cls: "text-warning/70",       label: "Partial" },
  empty:     { cls: "text-muted",           label: "Empty" },
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function isoMonday(d: Date): string {
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

function addWeeks(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().slice(0, 10);
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtWeekRange(weekStart: string, weekEnd: string): string {
  return `${fmtShortDate(weekStart)} – ${fmtShortDate(weekEnd)}`;
}

function isEditable(status: string): boolean {
  return status === "draft" || status === "rejected" || status === "";
}

// ── Cell input ─────────────────────────────────────────────────────────────────

function HoursCell({
  value,
  status,
  onChange,
  onDelete,
  saving,
}: {
  value: number;
  status: string;
  onChange: (h: number) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editable = isEditable(status);

  function startEdit() {
    if (!editable) return;
    setLocal(value > 0 ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const parsed = parseFloat(local.replace(",", "."));
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
    } else if (value > 0 && (local === "" || local === "0")) {
      onDelete();
    }
    setEditing(false);
  }

  const statusCls = STATUS_CONFIG[status]?.cls ?? "";

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commit(); }
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-7 w-full rounded border bg-accent-muted bg-indigo-500/[0.08] px-1 text-center text-[11px] font-medium text-primary outline-none"
        autoFocus
      />
    );
  }

  if (saving) {
    return (
      <div className="flex h-7 items-center justify-center">
        <Loader2 className="h-3 w-3 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEdit}
      disabled={!editable}
      className={`group relative h-7 w-full rounded transition-colors ${
        value > 0
          ? editable
            ? "bg-surface-2 hover:bg-surface-2"
            : "bg-surface-2"
          : editable
            ? "hover:bg-surface-2"
            : ""
      }`}
    >
      {value > 0 ? (
        <span className={`text-[11px] font-medium ${statusCls}`}>{value}</span>
      ) : editable ? (
        <span className="text-[10px] text-muted opacity-0 group-hover:opacity-100">+</span>
      ) : null}
    </button>
  );
}

// ── Add-row dialog ─────────────────────────────────────────────────────────────

function AddRowDialog({
  projects,
  activities,
  existingPairs,
  onAdd,
  onClose,
}: {
  projects: TimeProject[];
  activities: TimeActivity[];
  existingPairs: Set<string>;
  onAdd: (projectId: number, activityId: number | null) => void;
  onClose: () => void;
}) {
  const [projectId, setProjectId] = useState<number | "">("");
  const [activityId, setActivityId] = useState<number | "">("");

  const key = `${projectId}-${activityId}`;
  const alreadyAdded = projectId !== "" && existingPairs.has(key);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="w-72 overflow-hidden rounded-lg border border-strong bg-surface-1 shadow-xl">
        <div className="flex h-9 items-center justify-between border-b border-default px-3">
          <span className="text-[11px] font-semibold text-secondary">Add Project Row</span>
          <button onClick={onClose} className="text-muted hover:text-secondary">
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-3 p-3">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[10px] text-secondary outline-none focus:border-default"
            >
              <option value="">Select project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.code ? `[${p.code}] ` : ""}{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">Activity (optional)</label>
            <select
              value={activityId}
              onChange={(e) => setActivityId(e.target.value === "" ? "" : Number(e.target.value))}
              className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[10px] text-secondary outline-none focus:border-default"
            >
              <option value="">— None —</option>
              {activities.map((a) => (
                <option key={a.id} value={a.id}>{a.discipline ? `[${a.discipline}] ` : ""}{a.name}</option>
              ))}
            </select>
          </div>
          {alreadyAdded && (
            <p className="text-[9px] text-warning/60">This combination is already in your timesheet.</p>
          )}
          <button
            type="button"
            disabled={projectId === "" || alreadyAdded}
            onClick={() => {
              if (projectId !== "") {
                onAdd(Number(projectId), activityId === "" ? null : Number(activityId));
                onClose();
              }
            }}
            className="w-full rounded bg-accent py-1.5 text-[10px] font-semibold text-primary transition-colors hover:bg-accent-hover disabled:opacity-40"
          >
            Add Row
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ────────────────────────────────────────────────────────────────

export default function MyTimeModule() {
  const { userId, companyId, displayName } = useUserContext();

  const [weekStart, setWeekStart] = useState(() => isoMonday(new Date()));
  const [weekView, setWeekView] = useState<WeekView | null>(null);
  const [projects, setProjects] = useState<TimeProject[]>([]);
  const [activities, setActivities] = useState<TimeActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [showAddRow, setShowAddRow] = useState(false);

  // Extra rows the user added locally (not yet in the DB — no entries yet)
  const [extraRows, setExtraRows] = useState<{ project_id: number; activity_id: number | null }[]>([]);

  const loadWeek = useCallback(async () => {
    if (!companyId || !userId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/time/${companyId}/entries/week?user_id=${userId}&week_start=${weekStart}`
      );
      if (res.ok) {
        const data: WeekView = await res.json();
        setWeekView(data);
        // Drop extra rows that now appear in DB data
        const dbPairs = new Set(data.rows.map((r) => `${r.project_id}-${r.activity_id}`));
        setExtraRows((prev) => prev.filter((r) => !dbPairs.has(`${r.project_id}-${r.activity_id}`)));
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, userId, weekStart]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      fetch(`${API}/time/${companyId}/projects`).then((r) => r.json()),
      fetch(`${API}/time/${companyId}/activities`).then((r) => r.json()),
    ]).then(([p, a]) => {
      setProjects(p ?? []);
      setActivities(a ?? []);
    });
  }, [companyId]);

  // Merged rows: DB rows + local extra rows
  const allRows = useMemo(() => {
    if (!weekView) return [];
    const dbRows = weekView.rows;
    const days = weekView.days;
    const extra: WeekRow[] = extraRows.map((r) => {
      const proj = projects.find((p) => p.id === r.project_id);
      const act = activities.find((a) => a.id === r.activity_id);
      const empty: Record<string, number> = {};
      const emptyId: Record<string, number | null> = {};
      const emptyStatus: Record<string, string> = {};
      days.forEach((d) => { empty[d] = 0; emptyId[d] = null; emptyStatus[d] = ""; });
      return {
        project_id: r.project_id,
        project_name: proj?.name ?? `Project ${r.project_id}`,
        project_code: proj?.code ?? null,
        activity_id: r.activity_id,
        activity_name: act?.name ?? null,
        entry_ids: emptyId,
        hours: empty,
        statuses: emptyStatus,
      };
    });
    return [...dbRows, ...extra];
  }, [weekView, extraRows, projects, activities]);

  const existingPairs = useMemo(
    () => new Set(allRows.map((r) => `${r.project_id}-${r.activity_id}`)),
    [allRows],
  );

  async function saveCell(
    projectId: number,
    activityId: number | null,
    entryDate: string,
    hours: number,
  ) {
    if (!companyId || !userId) return;
    const key = `${projectId}-${activityId}-${entryDate}`;
    setSavingCells((prev) => new Set(prev).add(key));
    try {
      await fetch(
        `${API}/time/${companyId}/entries?user_id=${userId}&user_name=${encodeURIComponent(displayName ?? "")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            activity_id: activityId,
            entry_date: entryDate,
            hours,
          }),
        }
      );
      await loadWeek();
    } finally {
      setSavingCells((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  async function deleteCell(entryId: number | null, projectId: number, activityId: number | null, entryDate: string) {
    if (!companyId || !userId) return;
    if (!entryId) return;
    const key = `${projectId}-${activityId}-${entryDate}`;
    setSavingCells((prev) => new Set(prev).add(key));
    try {
      await fetch(`${API}/time/${companyId}/entries/${entryId}?user_id=${userId}`, { method: "DELETE" });
      await loadWeek();
    } finally {
      setSavingCells((prev) => { const s = new Set(prev); s.delete(key); return s; });
    }
  }

  async function submitWeek() {
    if (!companyId || !userId || submitting) return;
    setSubmitting(true);
    try {
      await fetch(
        `${API}/time/${companyId}/entries/submit-week?user_id=${userId}&week_start=${weekStart}`,
        { method: "POST" }
      );
      await loadWeek();
    } finally {
      setSubmitting(false);
    }
  }

  const weekStatus = weekView?.week_status ?? "empty";
  const canSubmit = weekStatus === "draft" || weekStatus === "partial";
  const totalHours = weekView?.week_total ?? 0;
  const days = weekView?.days ?? [];

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-surface-0 text-primary">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-subtle px-4">
        <button
          type="button"
          onClick={() => setWeekStart((w) => addWeeks(w, -1))}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 text-muted hover:text-secondary"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-semibold text-tertiary">
          {weekView ? fmtWeekRange(weekView.week_start, weekView.week_end) : "Loading…"}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart((w) => addWeeks(w, 1))}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-2 text-muted hover:text-secondary"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setWeekStart(isoMonday(new Date()))}
          className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-muted hover:text-tertiary transition-colors"
        >
          Today
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* Week status pill */}
          {weekStatus !== "empty" && (
            <span className={`text-[9px] font-bold uppercase tracking-wider ${STATUS_CONFIG[weekStatus]?.cls ?? "text-muted"}`}>
              {STATUS_CONFIG[weekStatus]?.label}
            </span>
          )}
          {/* Total hours */}
          {totalHours > 0 && (
            <span className="rounded border border-default px-2 py-0.5 text-[10px] font-semibold text-secondary">
              {Number(totalHours).toFixed(1)} h
            </span>
          )}
          {/* Submit button */}
          {canSubmit && (
            <button
              type="button"
              disabled={submitting}
              onClick={submitWeek}
              className="flex items-center gap-1.5 rounded bg-accent px-3 py-1 text-[10px] font-semibold text-primary transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Submit Week
            </button>
          )}
          {weekStatus === "submitted" && (
            <span className="flex items-center gap-1 text-[10px] text-blue-300/60">
              <Clock className="h-3 w-3" /> Pending review
            </span>
          )}
          {weekStatus === "approved" && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-300/60">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </span>
          )}
          {weekStatus === "rejected" && (
            <span className="flex items-center gap-1 text-[10px] text-error/60">
              <XCircle className="h-3 w-3" /> Rejected — fix &amp; resubmit
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : (
          <table className="w-full border-collapse text-[11px]" style={{ minWidth: 640 }}>
            <thead>
              <tr className="border-b border-subtle">
                <th className="sticky left-0 z-10 w-[220px] bg-surface-0 px-3 py-2 text-left text-[9px] font-bold uppercase tracking-widest text-muted">
                  Project / Activity
                </th>
                {days.map((d, i) => {
                  const isToday = d === new Date().toISOString().slice(0, 10);
                  return (
                    <th
                      key={d}
                      className={`w-16 px-1 py-2 text-center text-[9px] font-bold uppercase tracking-widest ${
                        isToday ? "text-accent" : "text-muted"
                      }`}
                    >
                      <div>{DAY_LABELS[i]}</div>
                      <div className={`font-normal normal-case tracking-normal ${isToday ? "text-accent/50" : "text-muted"}`}>
                        {fmtShortDate(d)}
                      </div>
                    </th>
                  );
                })}
                <th className="w-14 px-2 py-2 text-center text-[9px] font-bold uppercase tracking-widest text-muted">Total</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 && (
                <tr>
                  <td colSpan={days.length + 3} className="py-12 text-center text-[11px] text-muted">
                    No projects assigned. Add a row to start logging time.
                  </td>
                </tr>
              )}
              {allRows.map((row) => {
                const rowTotal = days.reduce((s, d) => s + (row.hours[d] ?? 0), 0);
                return (
                  <tr
                    key={`${row.project_id}-${row.activity_id}`}
                    className="border-b border-subtle hover:bg-surface-1"
                  >
                    {/* Project/activity label */}
                    <td className="sticky left-0 z-10 bg-surface-0 px-3 py-1">
                      <div className="text-[10px] font-medium text-secondary truncate max-w-[200px]">
                        {row.project_code ? <span className="text-muted mr-1">[{row.project_code}]</span> : null}
                        {row.project_name}
                      </div>
                      {row.activity_name && (
                        <div className="text-[9px] text-muted truncate max-w-[200px]">{row.activity_name}</div>
                      )}
                    </td>

                    {/* Hour cells */}
                    {days.map((d) => {
                      const cellKey = `${row.project_id}-${row.activity_id}-${d}`;
                      return (
                        <td key={d} className="px-1 py-0.5">
                          <HoursCell
                            value={row.hours[d] ?? 0}
                            status={row.statuses[d] ?? ""}
                            saving={savingCells.has(cellKey)}
                            onChange={(h) => saveCell(row.project_id, row.activity_id, d, h)}
                            onDelete={() => deleteCell(row.entry_ids[d] ?? null, row.project_id, row.activity_id, d)}
                          />
                        </td>
                      );
                    })}

                    {/* Row total */}
                    <td className="px-2 py-0.5 text-center text-[10px] font-semibold text-tertiary">
                      {rowTotal > 0 ? rowTotal.toFixed(1) : ""}
                    </td>

                    {/* Remove row (only if all cells are empty and it's a local extra row) */}
                    <td className="px-1 py-0.5">
                      {rowTotal === 0 && extraRows.some((r) => r.project_id === row.project_id && r.activity_id === row.activity_id) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExtraRows((prev) =>
                              prev.filter((r) => !(r.project_id === row.project_id && r.activity_id === row.activity_id))
                            )
                          }
                          className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-error/50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Daily totals footer */}
            {allRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-default">
                  <td className="sticky left-0 z-10 bg-surface-0 px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-muted">
                    Daily Total
                  </td>
                  {days.map((d) => {
                    const t = weekView?.daily_totals?.[d] ?? 0;
                    const over = Number(t) > 8;
                    return (
                      <td key={d} className="px-1 py-1.5 text-center">
                        <span className={`text-[10px] font-bold ${t > 0 ? (over ? "text-warning/70" : "text-secondary") : "text-muted"}`}>
                          {t > 0 ? Number(t).toFixed(1) : "—"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center text-[11px] font-bold text-secondary">
                    {Number(totalHours).toFixed(1)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      {/* Add row button */}
      {!loading && (
        <div className="flex shrink-0 items-center border-t border-subtle px-3 py-2">
          <button
            type="button"
            onClick={() => setShowAddRow(true)}
            className="flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-tertiary"
          >
            <Plus className="h-3 w-3" />
            Add project row
          </button>
        </div>
      )}

      {/* Add-row dialog overlay */}
      {showAddRow && (
        <AddRowDialog
          projects={projects.filter((p) => p.status === "active")}
          activities={activities}
          existingPairs={existingPairs}
          onAdd={(pid, aid) => {
            setExtraRows((prev) => [...prev, { project_id: pid, activity_id: aid }]);
          }}
          onClose={() => setShowAddRow(false)}
        />
      )}
    </div>
  );
}
