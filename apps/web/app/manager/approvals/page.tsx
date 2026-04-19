"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

type ExpenseReport = {
  id: number;
  company_id: number;
  title: string;
  status: string;
  created_at: string;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const STATUS_BADGE: Record<string, string> = {
  draft:     "bg-zinc-500/15 text-zinc-400 border-zinc-500/25",
  submitted: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  approved:  "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  rejected:  "bg-red-500/15 text-red-300 border-red-500/25",
};

const ACCENT_BAR: Record<string, string> = {
  draft:     "bg-zinc-600/50",
  submitted: "bg-amber-500/50",
  approved:  "bg-emerald-500/60",
  rejected:  "bg-red-500/60",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

function ReportCard({ report, onClick }: { report: ExpenseReport; onClick: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="group relative flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 cursor-pointer transition-all hover:bg-white/[0.08] hover:border-white/20"
    >
      {/* Accent bar */}
      <div className={`absolute left-0 top-3 bottom-3 w-[3px] rounded-full ${ACCENT_BAR[report.status] ?? ACCENT_BAR.draft}`} />

      <div className="flex-1 min-w-0 ml-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-white truncate">{report.title}</span>
          <StatusBadge status={report.status} />
        </div>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-white/40">#{report.id}</span>
          <span className="text-white/20 text-xs">·</span>
          <span className="text-xs text-white/40">{formatDate(report.created_at)}</span>
        </div>
      </div>

      <svg
        className="h-4 w-4 text-white/25 group-hover:text-white/50 shrink-0 transition-colors"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ExpenseReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/expenses/reports`, {
      headers: { "X-User-Id": "1" },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json() as Promise<ExpenseReport[]>;
      })
      .then(setReports)
      .catch(() => setError("Failed to load reports."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* Header */}
        <div className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-sky-500/10 p-8 shadow-2xl shadow-black/20 backdrop-blur">
          <p className="mb-3 text-sm uppercase tracking-[0.25em] text-white/50">
            Manager Portal
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Pending Approvals</h1>
          <p className="mt-3 text-sm text-white/60">
            Review submitted expense reports and approve or reject them.
          </p>
        </div>

        {/* Metrics */}
        {!loading && !error && (
          <div className="mb-8 grid grid-cols-4 gap-3">
            {([
              { label: "Total", value: reports.length, cls: "text-white" },
              { label: "Draft",     value: reports.filter((r) => r.status === "draft").length,     cls: "text-zinc-400" },
              { label: "Submitted", value: reports.filter((r) => r.status === "submitted").length, cls: "text-amber-300" },
              { label: "Approved",  value: reports.filter((r) => r.status === "approved").length,  cls: "text-emerald-300" },
            ] as { label: string; value: number; cls: string }[]).map(({ label, value, cls }) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/40">{label}</div>
                <div className={`mt-1 text-2xl font-semibold tabular-nums ${cls}`}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16 text-white/40 text-sm">
            Loading reports…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && reports.length === 0 && (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-16 text-center text-sm text-white/35">
            No reports found.
          </div>
        )}

        {/* List */}
        {!loading && !error && reports.length > 0 && (
          <div className="space-y-2">
            {reports.map((report) => (
              <ReportCard
                key={report.id}
                report={report}
                onClick={() => router.push(`/manager/approvals/${report.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
