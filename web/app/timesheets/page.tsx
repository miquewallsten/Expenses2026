"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import { UserProvider, useUserContext } from "@/context/UserContext";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types ──────────────────────────────────────────────────────────────────────

interface SubmittedWeek {
  user_id: number;
  user_name: string | null;
  week_start: string;
  total_hours: number;
  entry_count: number;
  status: string;
  entry_ids: number[];
}

interface TimeEntry {
  id: number;
  project_id: number;
  activity_id: number | null;
  entry_date: string;
  hours: number;
  description: string | null;
  status: string;
  reviewer_notes: string | null;
  rejection_reason: string | null;
}

interface ProjectMeta {
  id: number;
  name: string;
  code: string | null;
}

interface ActivityMeta {
  id: number;
  name: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtWeek(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const end = new Date(d);
  end.setDate(d.getDate() + 6);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

function StatusBadge({ status }: { status: string }) {
  const tt = useTranslations("timesheets");
  const STATUS_LABELS: Record<string, string> = {
    submitted:          tt("statusSubmitted"),
    partial:            tt("statusPartial"),
    approved:           tt("statusApproved"),
    rejected:           tt("statusRejected"),
    partially_approved: tt("statusPartial"),
  };
  const STATUS_CLS: Record<string, string> = {
    submitted:          "text-blue-300/80 bg-blue-500/[0.10]",
    partial:            "text-amber-300/80 bg-amber-500/[0.10]",
    approved:           "text-emerald-300/80 bg-emerald-500/[0.10]",
    rejected:           "text-red-300/80 bg-red-500/[0.10]",
    partially_approved: "text-amber-300/80 bg-amber-500/[0.10]",
  };
  const label = STATUS_LABELS[status] ?? status;
  const cls   = STATUS_CLS[status]   ?? "text-white/30 bg-white/[0.06]";
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}>
      {label}
    </span>
  );
}

// ── Entry detail table ────────────────────────────────────────────────────────

function EntryTable({
  entries,
  projects,
  activities,
}: {
  entries: TimeEntry[];
  projects: ProjectMeta[];
  activities: ActivityMeta[];
}) {
  const projMap = Object.fromEntries(projects.map((p) => [p.id, p]));
  const actMap  = Object.fromEntries(activities.map((a) => [a.id, a]));
  const tt = useTranslations("timesheets");
  const DAY_LABELS_T: Record<string, string> = {
    "1": tt("dayMon"), "2": tt("dayTue"), "3": tt("dayWed"),
    "4": tt("dayThu"), "5": tt("dayFri"), "6": tt("daySat"), "0": tt("daySun"),
  };

  // Group by date
  const byDate: Record<string, TimeEntry[]> = {};
  for (const e of entries) {
    if (!byDate[e.entry_date]) byDate[e.entry_date] = [];
    byDate[e.entry_date].push(e);
  }
  const dates = Object.keys(byDate).sort();

  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("colDate")}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("colProject")}</th>
            <th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("colActivity")}</th>
            <th className="px-2 py-1.5 text-right text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("colHours")}</th>
            <th className="px-2 py-1.5 text-center text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {dates.map((d) =>
            byDate[d].map((e, i) => {
              const proj = projMap[e.project_id];
              const act  = e.activity_id ? actMap[e.activity_id] : null;
              const dayLabel = DAY_LABELS_T[String(new Date(d + "T00:00:00").getDay())];
              return (
                <tr key={e.id} className="border-b border-white/[0.04] hover:bg-white/[0.015]">
                  <td className="px-3 py-1.5 text-white/40">
                    {i === 0 ? (
                      <>
                        <span className="font-medium">{dayLabel}</span>
                        <span className="ml-1 text-white/25">{fmtDate(d)}</span>
                      </>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-white/60">
                    {proj ? (
                      <>
                        {proj.code && <span className="text-white/28 mr-1">[{proj.code}]</span>}
                        {proj.name}
                      </>
                    ) : `Project ${e.project_id}`}
                  </td>
                  <td className="px-3 py-1.5 text-white/35">{act?.name ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-white/55">{Number(e.hours).toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-center">
                    <StatusBadge status={e.status} />
                    {e.rejection_reason && (
                      <p className="mt-0.5 text-[8px] text-red-300/50">{e.rejection_reason}</p>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/[0.07]">
            <td colSpan={3} className="px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("totalFooter")}</td>
            <td className="px-2 py-1.5 text-right text-[11px] font-bold text-white/55">
              {entries.reduce((s, e) => s + Number(e.hours), 0).toFixed(1)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function WeekDetail({
  week,
  entries,
  projects,
  activities,
  onAction,
  acting,
}: {
  week: SubmittedWeek;
  entries: TimeEntry[];
  projects: ProjectMeta[];
  activities: ActivityMeta[];
  onAction: (action: "approve" | "reject", notes?: string, reason?: string) => void;
  acting: boolean;
}) {
  const [notesInput,  setNotesInput]  = useState("");
  const [rejectInput, setRejectInput] = useState("");
  const tt = useTranslations("timesheets");

  const submittedEntries = entries.filter((e) => e.status === "submitted");
  const canAct = submittedEntries.length > 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-4">
        <span className="flex-1 text-[11px] font-semibold text-white/65">
          {week.user_name ?? `User ${week.user_id}`} — {fmtWeek(week.week_start)}
        </span>
        <StatusBadge status={week.status} />
      </div>

      <div className="flex-1 space-y-4 px-4 py-4">
        {/* Summary row */}
        <div className="flex items-center gap-4 rounded-lg border border-white/[0.07] px-3 py-2.5">
          <div>
            <p className="text-[9px] text-white/28">{tt("totalHours")}</p>
            <p className="text-[18px] font-bold text-white/65">{Number(week.total_hours).toFixed(1)}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/28">{tt("entriesCount")}</p>
            <p className="text-[14px] font-semibold text-white/40">{week.entry_count}</p>
          </div>
          <div>
            <p className="text-[9px] text-white/28">{tt("weekLabel")}</p>
            <p className="text-[11px] font-medium text-white/40">{fmtWeek(week.week_start)}</p>
          </div>
        </div>

        {/* Entry table */}
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">{tt("sectionTimeEntries")}</p>
          <EntryTable entries={entries} projects={projects} activities={activities} />
        </div>

        {/* Action area */}
        {canAct && (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
            <p className="mb-2.5 text-[9px] font-bold uppercase tracking-widest text-white/25">{tt("sectionReviewAction")}</p>

            <div className="mb-2.5">
              <textarea
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                rows={2}
                placeholder={tt("placeholderApprovalNotes")}
                className="w-full resize-none rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/65 placeholder-white/18 outline-none focus:border-white/[0.12]"
              />
            </div>
            <div className="mb-2.5">
              <textarea
                value={rejectInput}
                onChange={(e) => setRejectInput(e.target.value)}
                rows={2}
                placeholder={tt("placeholderRejectionReason")}
                className="w-full resize-none rounded border border-white/[0.07] bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/65 placeholder-white/18 outline-none focus:border-white/[0.12]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={acting}
                onClick={() => onAction("approve", notesInput || undefined)}
                className="flex items-center gap-1.5 rounded bg-emerald-600/70 px-3 py-1.5 text-[10px] font-semibold text-white/90 transition-colors hover:bg-emerald-600/90 disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                {tt("actionApproveAll")}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => onAction("reject", undefined, rejectInput || undefined)}
                className="flex items-center gap-1.5 rounded border border-red-500/20 px-3 py-1.5 text-[10px] font-medium text-red-300/60 transition-colors hover:bg-red-900/[0.12] disabled:opacity-50"
              >
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                {tt("actionRejectAll")}
              </button>
            </div>
          </div>
        )}

        {week.status === "approved" && (
          <div className="flex items-center gap-2 rounded border border-emerald-500/20 bg-emerald-900/[0.08] px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/60" />
            <span className="text-[10px] text-emerald-300/60">{tt("bannerApproved")}</span>
          </div>
        )}
        {week.status === "rejected" && (
          <div className="flex items-center gap-2 rounded border border-red-500/20 bg-red-900/[0.08] px-3 py-2">
            <XCircle className="h-3.5 w-3.5 text-red-400/60" />
            <span className="text-[10px] text-red-300/60">{tt("bannerRejected")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function TimesheetsInbox() {
  const { companyId, userId, displayName } = useUserContext();
  const tt = useTranslations("timesheets");

  const [weeks, setWeeks] = useState<SubmittedWeek[]>([]);
  const [selected, setSelected] = useState<SubmittedWeek | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activities, setActivities] = useState<ActivityMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [acting, setActing] = useState(false);
  const [tab, setTab] = useState<"pending" | "done">("pending");

  const loadIncoming = useCallback(async () => {
    if (!companyId) return;
    try {
      const [wRes, pRes, aRes] = await Promise.all([
        fetch(`${API}/time/${companyId}/incoming`),
        fetch(`${API}/time/${companyId}/projects`),
        fetch(`${API}/time/${companyId}/activities?active_only=false`),
      ]);
      if (wRes.ok) setWeeks(await wRes.json());
      if (pRes.ok) setProjects(await pRes.json());
      if (aRes.ok) setActivities(await aRes.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { loadIncoming(); }, [loadIncoming]);

  async function selectWeek(w: SubmittedWeek) {
    setSelected(w);
    setLoadingDetail(true);
    try {
      const res = await fetch(
        `${API}/time/${companyId}/incoming/entries?user_id=${w.user_id}&week_start=${w.week_start}`
      );
      if (res.ok) setEntries(await res.json());
    } finally {
      setLoadingDetail(false);
    }
  }

  async function handleAction(action: "approve" | "reject", notes?: string, reason?: string) {
    if (!selected || !companyId || !userId || acting) return;
    const submittedIds = entries.filter((e) => e.status === "submitted").map((e) => e.id);
    if (!submittedIds.length) return;
    setActing(true);
    try {
      const res = await fetch(
        `${API}/time/${companyId}/entries/${action}?reviewer_id=${userId}&reviewer_name=${encodeURIComponent(displayName ?? "")}&${submittedIds.map((id) => `entry_ids=${id}`).join("&")}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: notes ?? null, rejection_reason: reason ?? null }),
        }
      );
      if (res.ok) {
        await loadIncoming();
        await selectWeek({ ...selected });
      }
    } finally {
      setActing(false);
    }
  }

  const pending = weeks.filter((w) => ["submitted", "partial", "partially_approved"].includes(w.status));
  const done    = weeks.filter((w) => ["approved", "rejected"].includes(w.status));
  const visible = tab === "pending" ? pending : done;

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-zinc-950 text-white">
      {/* List */}
      <div className="flex w-[280px] shrink-0 flex-col overflow-hidden border-r border-white/[0.06]">
        <div className="flex h-9 shrink-0 items-center border-b border-white/[0.06] px-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{tt("pageTitle")}</span>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b border-white/[0.06]">
          {(["pending", "done"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-[9px] font-bold uppercase tracking-widest transition-colors ${
                tab === t ? "border-b border-indigo-500/50 text-white/60" : "text-white/22 hover:text-white/40"
              }`}
            >
              {t === "pending" ? tt("tabPending", { count: pending.length }) : tt("tabDone", { count: done.length })}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-white/20" />
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Clock className="h-5 w-5 text-white/12" />
              <p className="text-[10px] text-white/22">
                {tab === "pending" ? tt("emptyPending") : tt("emptyDone")}
              </p>
            </div>
          ) : (
            <div className="space-y-px px-1.5">
              {visible.map((w) => {
                const active = selected?.user_id === w.user_id && selected?.week_start === w.week_start;
                return (
                  <button
                    key={`${w.user_id}-${w.week_start}`}
                    type="button"
                    onClick={() => selectWeek(w)}
                    className={`group relative flex w-full items-center gap-2.5 rounded px-3 py-2 text-left transition-colors ${
                      active ? "bg-indigo-600/[0.18] text-white" : "text-white/50 hover:bg-white/[0.04] hover:text-white/75"
                    }`}
                  >
                    {active && (
                      <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-indigo-400/70" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-[11px] font-medium leading-tight">
                          {w.user_name ?? `User ${w.user_id}`}
                        </p>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <StatusBadge status={w.status} />
                        <span className="text-[9px] text-white/22">{fmtWeek(w.week_start)}</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-medium text-white/35">
                      {Number(w.total_hours).toFixed(1)} h
                    </span>
                    <ChevronRight className={`h-3 w-3 shrink-0 ${active ? "text-indigo-300/50" : "text-white/15"}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Clock className="mx-auto mb-2 h-6 w-6 text-white/12" />
              <p className="text-[11px] text-white/22">{tt("selectTimesheet")}</p>
            </div>
          </div>
        ) : loadingDetail ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-white/20" />
          </div>
        ) : (
          <WeekDetail
            week={selected}
            entries={entries}
            projects={projects}
            activities={activities}
            onAction={handleAction}
            acting={acting}
          />
        )}
      </div>
    </div>
  );
}

export default function TimesheetsPage() {
  return (
    <UserProvider>
      <TimesheetsInbox />
    </UserProvider>
  );
}
