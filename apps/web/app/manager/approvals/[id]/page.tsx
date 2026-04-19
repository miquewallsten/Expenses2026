"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

type ExpenseReport = {
  id: number;
  company_id: number;
  title: string;
  status: string;
  created_at: string;
};

type Expense = {
  id: number;
  description: string | null;
  amount: number;
  status: string;
  detected_category: string | null;
  account_code: string | null;
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

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"approve" | "reject" | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`${API}/expenses/reports/${id}`, { headers: { "X-User-Id": "1" } }),
      fetch(`${API}/expenses/reports/${id}/expenses`, { headers: { "X-User-Id": "1" } }),
    ])
      .then(async ([reportRes, expensesRes]) => {
        if (!reportRes.ok) throw new Error("Report not found");
        if (!expensesRes.ok) throw new Error("Failed to load expenses");
        const [reportData, expensesData] = await Promise.all([
          reportRes.json() as Promise<ExpenseReport>,
          expensesRes.json() as Promise<Expense[]>,
        ]);
        setReport(reportData);
        setExpenses(expensesData);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAction = async (action: "approve" | "reject") => {
    if (acting) return;
    setActing(action);
    try {
      const res = await fetch(`${API}/expenses/reports/${id}/${action}`, {
        method: "POST",
        headers: { "X-User-Id": "1" },
      });
      if (!res.ok) throw new Error(`Failed to ${action}`);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : `Failed to ${action}`);
    } finally {
      setActing(null);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-10">

        {/* Back */}
        <button
          onClick={() => router.push("/manager/approvals")}
          className="mb-6 flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to approvals
        </button>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-white/40">
            Loading…
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Content */}
        {!loading && !error && report && (
          <>
            {/* Report header */}
            <div className="mb-8 rounded-3xl border border-white/10 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-sky-500/10 p-8 shadow-2xl shadow-black/20 backdrop-blur">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="mb-3 text-sm uppercase tracking-[0.25em] text-white/50">
                    Report #{report.id}
                  </p>
                  <h1 className="text-3xl font-semibold tracking-tight">{report.title}</h1>
                  <p className="mt-2 text-sm text-white/50">{formatDate(report.created_at)}</p>
                </div>
                <StatusBadge status={report.status} />
              </div>

              {/* Approve / Reject */}
              {report.status === "submitted" && (
                <div className="mt-6 flex items-center gap-3">
                  <button
                    onClick={() => handleAction("approve")}
                    disabled={acting !== null}
                    className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
                      acting === null
                        ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/20"
                        : "bg-white/10 text-white/30 cursor-not-allowed"
                    }`}
                  >
                    {acting === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleAction("reject")}
                    disabled={acting !== null}
                    className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition-all ${
                      acting === null
                        ? "bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20"
                        : "bg-white/10 text-white/30 cursor-not-allowed"
                    }`}
                  >
                    {acting === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              )}
            </div>

            {/* Expenses */}
            <div>
              <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">
                Expenses ({expenses.length})
              </p>

              {expenses.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center text-sm text-white/35">
                  No expenses linked to this report.
                </div>
              ) : (
                <div className="space-y-2">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {expense.description ?? "—"}
                          </p>
                          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                            {expense.detected_category && (
                              <span className="text-xs text-white/45">
                                Category: <span className="text-white/70">{expense.detected_category}</span>
                              </span>
                            )}
                            {expense.account_code && (
                              <span className="text-xs text-white/45">
                                Account: <span className="font-mono text-white/70">{expense.account_code}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <StatusBadge status={expense.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
