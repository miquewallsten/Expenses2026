"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart2, Bot, Calendar, ChevronDown, ChevronUp, Download,
  FileText, Filter, Search, Send, SlidersHorizontal, TrendingUp, X,
} from "lucide-react";
import { useUserContext } from "@/context/UserContext";
import { apiCall, apiPost } from "@/lib/api/client";
import { statusClasses, EXPENSE_STATUS_STYLES } from "@/lib/status-styles";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Expense {
  id: number;
  amount: number;
  description: string;
  status: string;
  detected_category: string | null;
  account_code: string | null;
  category_code: string | null;
  expense_date: string | null;
  created_at: string;
  report_id: number | null;
  notes: string | null;
  tags: string | null;
  expense_type: string | null;
}

type SortKey = keyof Pick<Expense, "amount" | "description" | "status" | "detected_category" | "expense_date" | "created_at">;
type SortDir = "asc" | "desc";


// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return " - ";
  const d = new Date(s);
  return isNaN(d.getTime()) ? " - " : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Tiny SVG sparkline ─────────────────────────────────────────────────────────

function Sparkline({ data, w = 120, h = 32, color = "var(--color-accent)" }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - clamp((v / max) * h * 0.85, 0, h - 2) - 1;
    return `${x},${y}`;
  }).join(" ");
  const fill = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - clamp((v / max) * h * 0.85, 0, h - 2) - 1;
    return `${x},${y}`;
  });
  const areaPath = `M0,${h} ${fill.map((p, i) => (i === 0 ? `L${p}` : `L${p}`)).join(" ")} L${w},${h} Z`;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#sg-${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Bar chart (horizontal) ────────────────────────────────────────────────────

function HBarChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d) => (
        <div key={d.label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 truncate text-right text-[9px] text-muted">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-[9px] tabular-nums text-tertiary">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Monthly area chart (SVG) ──────────────────────────────────────────────────

function MonthlyChart({ buckets }: { buckets: { label: string; total: number; count: number }[] }) {
  const W = 600; const H = 110; const PAD_L = 44; const PAD_B = 24; const PAD_T = 8;
  const plotW = W - PAD_L - 8;
  const plotH = H - PAD_B - PAD_T;
  const maxV = Math.max(...buckets.map((b) => b.total), 1);

  const pts = buckets.map((b, i) => {
    const x = PAD_L + (i / Math.max(buckets.length - 1, 1)) * plotW;
    const y = PAD_T + plotH - (b.total / maxV) * plotH;
    return { x, y, ...b };
  });

  const lineD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaD = pts.length
    ? `M${PAD_L},${PAD_T + plotH} ${pts.map((p) => `L${p.x},${p.y}`).join(" ")} L${pts[pts.length - 1].x},${PAD_T + plotH} Z`
    : "";

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: maxV * f, y: PAD_T + plotH - f * plotH }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* Y grid + labels */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line x1={PAD_L} y1={t.y} x2={W - 8} y2={t.y} stroke="var(--color-subtle)" strokeWidth="1" />
          <text x={PAD_L - 4} y={t.y + 3.5} textAnchor="end" fill="var(--color-tertiary)" fontSize="8">
            {t.v >= 1000 ? `$${(t.v / 1000).toFixed(0)}k` : `$${t.v.toFixed(0)}`}
          </text>
        </g>
      ))}
      {/* Area fill */}
      {areaD && <path d={areaD} fill="url(#chartFill)" />}
      {/* Line */}
      {lineD && <path d={lineD} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {/* X labels + dots */}
      {pts.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="2.5" fill="var(--color-accent)" opacity="0.8" />
          <text x={p.x} y={H - 6} textAnchor="middle" fill="var(--color-tertiary)" fontSize="8">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, sparkData, color = "var(--color-accent)" }: {
  label: string; value: string; sub?: string; sparkData?: number[]; color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-subtle bg-surface-1 px-4 py-3">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{label}</span>
      <span className="text-xl font-bold tabular-nums text-primary">{value}</span>
      {sub && <span className="text-[9px] text-muted">{sub}</span>}
      {sparkData && sparkData.length > 1 && (
        <div className="mt-1">
          <Sparkline data={sparkData} color={color} />
        </div>
      )}
    </div>
  );
}

// ── AI insight panel ──────────────────────────────────────────────────────────

function AiInsightPanel({ expenses, visible, onClose }: {
  expenses: Expense[]; visible: boolean; onClose: () => void;
}) {
  const [prompt, setPrompt]     = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [busy, setBusy]         = useState(false);
  const [aiAvail, setAiAvail]   = useState<boolean | null>(null);
  const endRef                  = useRef<HTMLDivElement>(null);
  const tr = useTranslations("reports");

  useEffect(() => {
    apiCall<{ available?: boolean }>(`/ai/status`)
      .then((d) => setAiAvail(d.available ?? false))
      .catch(() => setAiAvail(false));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const buildContext = useCallback(() => {
    const total = expenses.reduce((s, e) => s + e.amount, 0);
    const byStatus = expenses.reduce<Record<string, number>>((m, e) => { m[e.status] = (m[e.status] ?? 0) + 1; return m; }, {});
    const byCat = expenses.reduce<Record<string, number>>((m, e) => {
      const k = e.detected_category ?? "uncategorized";
      m[k] = (m[k] ?? 0) + e.amount; return m;
    }, {});
    return [
      `Total expenses: ${expenses.length}`,
      `Total amount: ${fmt(total)}`,
      `By status: ${Object.entries(byStatus).map(([k, v]) => `${k}=${v}`).join(", ")}`,
      `By category: ${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}=${fmt(v)}`).join(", ")}`,
    ].join("\n");
  }, [expenses]);

  const send = async () => {
    const q = prompt.trim();
    if (!q || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setPrompt("");
    setBusy(true);
    try {
      const d = await apiPost<{ response?: string; message?: string }>(`/ai/chat`, {
        prompt: q,
        context: buildContext(),
      });
      setMessages((m) => [...m, { role: "assistant", text: d.response ?? d.message ?? "No response." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "AI unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-subtle bg-surface-0">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-subtle px-3">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3 w-3 text-accent/60" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{tr("aiAnalyst")}</span>
          {aiAvail === false && (
            <span className="rounded border border-amber-500/20 bg-amber-500/[0.07] px-1 py-px text-[8px] text-warning/60">{tr("aiOffline")}</span>
          )}
        </div>
        <button onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded text-muted hover:text-secondary">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[9px] text-muted">{tr("aiHint")}</p>
            {[
              tr("aiExample1"),
              tr("aiExample2"),
              tr("aiExample3"),
              tr("aiExample4"),
            ].map((s) => (
              <button
                key={s}
                onClick={() => { setPrompt(s); }}
                className="block w-full rounded border border-default bg-surface-1 px-2 py-1 text-left text-[9px] text-tertiary hover:bg-surface-2 hover:text-secondary"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded px-2.5 py-1.5 text-[10px] leading-relaxed ${
            m.role === "user"
              ? "ml-4 bg-indigo-600/[0.12] text-secondary"
              : "mr-4 bg-surface-1 text-tertiary"
          }`}>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="mr-4 rounded bg-surface-1 px-2.5 py-1.5 text-[10px] text-muted">
            {tr("analyzing")}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-subtle p-2">
        <div className="flex gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={tr("askPlaceholder")}
            className="h-7 flex-1 rounded border border-default bg-surface-1 px-2 text-[10px] text-secondary placeholder:text-muted focus:bg-accent-muted focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !prompt.trim()}
            className="flex h-7 w-7 items-center justify-center rounded border border-indigo-500/20 bg-indigo-600/[0.12] text-accent/70 hover:bg-accent-muted disabled:opacity-30"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS = [
  "var(--color-accent)",
  "var(--color-cyan-400)",
  "var(--color-violet-400)",
  "var(--color-emerald-400)",
  "var(--color-amber-400)",
  "var(--color-rose-400)",
  "var(--color-violet-300)",
  "var(--color-blue-400)",
];

type DatePreset = "all" | "30d" | "90d" | "ytd" | "custom";

export default function MyReportsModule() {
  const user = useUserContext();
  const tr = useTranslations("reports");
  const tc = useTranslations("common");

  const [expenses,    setExpenses]    = useState<Expense[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // Filters
  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState<string>("all");
  const [catFilter,   setCatFilter]   = useState<string>("all");
  const [datePreset,  setDatePreset]  = useState<DatePreset>("all");
  const [customFrom,  setCustomFrom]  = useState("");
  const [customTo,    setCustomTo]    = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Table sort
  const [sortKey, setSortKey]  = useState<SortKey>("created_at");
  const [sortDir, setSortDir]  = useState<SortDir>("desc");

  // View
  const [view,       setView]       = useState<"overview" | "table">("overview");
  const [aiOpen,     setAiOpen]     = useState(false);

  // Load
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const data = await apiCall<Expense[]>(`/expenses/`);
        setExpenses(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user.userIdStr]);

  // Date filter
  const dateFrom = useMemo<Date | null>(() => {
    if (datePreset === "custom") return parseDate(customFrom) ;
    if (datePreset === "30d")  { const d = new Date(); d.setDate(d.getDate() - 30); return d; }
    if (datePreset === "90d")  { const d = new Date(); d.setDate(d.getDate() - 90); return d; }
    if (datePreset === "ytd")  { const d = new Date(); d.setMonth(0); d.setDate(1); return d; }
    return null;
  }, [datePreset, customFrom]);

  const dateTo = useMemo<Date | null>(() => {
    if (datePreset === "custom") return parseDate(customTo);
    return null;
  }, [datePreset, customTo]);

  // Filtered
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return expenses.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (catFilter !== "all" && (e.detected_category ?? "uncategorized") !== catFilter) return false;
      const d = parseDate(e.expense_date ?? e.created_at);
      if (dateFrom && d && d < dateFrom) return false;
      if (dateTo   && d && d > dateTo)   return false;
      if (q && !e.description.toLowerCase().includes(q) &&
          !(e.detected_category ?? "").toLowerCase().includes(q) &&
          !(e.status ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [expenses, statusFilter, catFilter, dateFrom, dateTo, search]);

  // Sorted
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: string | number = a[sortKey] ?? "";
      let bv: string | number = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      av = String(av); bv = String(bv);
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  // KPIs
  const totalAmt   = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);
  const avgAmt     = filtered.length ? totalAmt / filtered.length : 0;
  const byStatus   = useMemo(() => {
    return filtered.reduce<Record<string,number>>((m, e) => { m[e.status] = (m[e.status]??0)+1; return m; }, {});
  }, [filtered]);
  const submitted  = (byStatus["submitted"] ?? 0) + (byStatus["approved"] ?? 0) + (byStatus["processed"] ?? 0);

  // Monthly buckets (last 12 months of filtered data)
  const monthlyBuckets = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    filtered.forEach((e) => {
      const d = parseDate(e.expense_date ?? e.created_at);
      if (!d) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const existing = map.get(key) ?? { total: 0, count: 0 };
      map.set(key, { total: existing.total + e.amount, count: existing.count + 1 });
    });
    const sorted = Array.from(map.entries()).sort(([a],[b])=>a.localeCompare(b)).slice(-12);
    return sorted.map(([key, val]) => ({
      label: new Date(key + "-01").toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      ...val,
    }));
  }, [filtered]);

  // Sparkline (monthly totals for KPI)
  const sparkData = useMemo(() => monthlyBuckets.map((b) => b.total), [monthlyBuckets]);

  // Category breakdown
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((e) => {
      const k = e.detected_category ?? "Uncategorized";
      map.set(k, (map.get(k) ?? 0) + e.amount);
    });
    return Array.from(map.entries())
      .sort((a,b)=>b[1]-a[1])
      .slice(0, 8)
      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [filtered]);

  // All unique statuses and categories for filter dropdowns
  const allStatuses = useMemo(() => [...new Set(expenses.map((e) => e.status))], [expenses]);
  const allCategories = useMemo(() => [...new Set(expenses.map((e) => e.detected_category ?? "uncategorized"))], [expenses]);

  // Sort handler
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  // CSV export
  const exportCsv = () => {
    const cols = ["ID","Date","Description","Category","Amount","Status","Account","Type","Report"];
    const rows = sorted.map((e) => [
      e.id,
      e.expense_date ?? e.created_at.split("T")[0],
      `"${e.description.replace(/"/g,'""')}"`,
      e.detected_category ?? "",
      e.amount.toFixed(2),
      e.status,
      e.account_code ?? "",
      e.expense_type ?? "",
      e.report_id ?? "",
    ]);
    const csv = [cols, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `expenses-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // SortIcon
  const SortIcon = ({ col }: { col: SortKey }) => (
    sortKey === col
      ? (sortDir === "asc" ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />)
      : <ChevronDown className="h-2.5 w-2.5 opacity-20" />
  );

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <span className="text-[11px] text-muted">{tr("loadingReports")}</span>
    </div>
  );
  if (error) return (
    <div className="flex h-full items-center justify-center">
      <span className="text-[11px] text-error/50">{error}</span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar ── */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-subtle bg-surface-0 px-4">
          {/* View toggle */}
          <div className="flex items-center rounded border border-default p-px">
            <button
              onClick={() => setView("overview")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${view === "overview" ? "bg-surface-3 text-secondary" : "text-muted hover:text-secondary"}`}
            >
              <BarChart2 className="h-3 w-3" /> {tr("overview")}
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${view === "table" ? "bg-surface-3 text-secondary" : "text-muted hover:text-secondary"}`}
            >
              <FileText className="h-3 w-3" /> {tr("table")}
            </button>
          </div>

          {/* Search */}
          <div className="relative ml-2 flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("searchPlaceholder")}
              className="h-6 w-full rounded border border-default bg-surface-1 pl-6 pr-2 text-[10px] text-secondary placeholder:text-muted focus:bg-accent-muted focus:outline-none"
            />
          </div>

          {/* Date preset */}
          <div className="flex items-center gap-1">
            {(["all","30d","90d","ytd","custom"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${datePreset === p ? "bg-accent-muted text-accent" : "text-muted hover:text-secondary"}`}
              >
                {p === "all" ? tr("allTime") : p === "ytd" ? tr("ytd") : p === "custom" ? tr("custom") : p}
              </button>
            ))}
          </div>
          {datePreset === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e)=>setCustomFrom(e.target.value)}
                className="h-6 rounded border border-default bg-surface-1 px-2 text-[9px] text-tertiary focus:outline-none" />
              <span className="text-[9px] text-muted">–</span>
              <input type="date" value={customTo} onChange={(e)=>setCustomTo(e.target.value)}
                className="h-6 rounded border border-default bg-surface-1 px-2 text-[9px] text-tertiary focus:outline-none" />
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-medium transition-colors ${showFilters ? "bg-accent-muted-muted bg-indigo-600/10 text-accent/70" : "border-default text-muted hover:text-secondary"}`}
            >
              <Filter className="h-3 w-3" />
              {tr("filters")}
              {(statusFilter !== "all" || catFilter !== "all") && (
                <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500/40 text-[7px] text-primary">
                  {(statusFilter !== "all" ? 1 : 0) + (catFilter !== "all" ? 1 : 0)}
                </span>
              )}
            </button>

            {/* AI toggle */}
            <button
              onClick={() => setAiOpen((v) => !v)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-medium transition-colors ${aiOpen ? "bg-accent-muted-muted bg-indigo-600/10 text-accent/70" : "border-default text-muted hover:text-secondary"}`}
            >
              <Bot className="h-3 w-3" /> AI
            </button>

            {/* Export */}
            <button
              onClick={exportCsv}
              className="flex items-center gap-1 rounded border border-default px-2 py-1 text-[9px] font-medium text-muted hover:text-tertiary transition-colors"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="flex shrink-0 items-center gap-4 border-b border-subtle bg-surface-1/50 px-4 py-1.5">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3 text-muted" />
              <span className="text-[9px] text-muted">{tr("statusLabel")}</span>
              <div className="flex gap-1">
                {["all", ...allStatuses].map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium capitalize transition-colors ${statusFilter === s ? "bg-surface-2 text-secondary" : "text-muted hover:text-secondary"}`}>
                    {s === "all" ? tc("all") : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted">{tr("categoryLabel")}</span>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="h-5 rounded border border-default bg-surface-1 px-1.5 text-[9px] text-tertiary focus:outline-none"
              >
                <option value="all">{tr("allCategories")}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(statusFilter !== "all" || catFilter !== "all") && (
              <button onClick={() => { setStatusFilter("all"); setCatFilter("all"); }}
                className="ml-auto flex items-center gap-1 text-[9px] text-muted hover:text-secondary">
                <X className="h-2.5 w-2.5" /> {tr("clearFilters")}
              </button>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* Result count */}
          <div className="flex items-center justify-between px-4 py-1.5">
            <span className="text-[9px] text-muted">
              {expenses.length !== filtered.length
                ? tr("expenseCountOf", { count: filtered.length, total: expenses.length })
                : tr("expenseCount", { count: filtered.length })
              }
            </span>
            <span className="text-[9px] font-semibold tabular-nums text-muted">{fmt(totalAmt)}</span>
          </div>

          {view === "overview" && (
            <div className="space-y-4 px-4 pb-6">
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard label={tr("totalSpend")} value={fmt(totalAmt)} sub={tr("expenseCountSub", { count: filtered.length })} sparkData={sparkData} />
                <KpiCard label={tr("avgPerExpense")} value={fmt(avgAmt)} color="var(--color-cyan-400)" />
                <KpiCard label={tr("submittedApproved")} value={String(submitted)} sub={tr("percentOfTotal", { pct: filtered.length ? Math.round((submitted/filtered.length)*100) : 0 })} color="var(--color-emerald-400)" />
                <KpiCard label={tc("draft")} value={String(byStatus["draft"] ?? 0)} sub={tr("pendingAction")} color="var(--color-amber-400)" />
              </div>

              {/* Monthly chart */}
              {monthlyBuckets.length > 1 && (
                <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <TrendingUp className="h-3 w-3 text-accent/50" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{tr("monthlySpend")}</span>
                  </div>
                  <MonthlyChart buckets={monthlyBuckets} />
                </div>
              )}

              {/* Category breakdown + status */}
              <div className="grid grid-cols-2 gap-3">
                {categoryData.length > 0 && (
                  <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-3">
                    <div className="mb-2 flex items-center gap-2">
                      <BarChart2 className="h-3 w-3 text-accent/50" />
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{tr("byCategory")}</span>
                    </div>
                    <HBarChart data={categoryData} />
                  </div>
                )}
                <div className="rounded-lg border border-subtle bg-surface-1 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-accent/50" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{tr("byStatus")}</span>
                  </div>
                  <HBarChart data={
                    Object.entries(byStatus)
                      .sort((a,b)=>b[1]-a[1])
                      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i] ?? "var(--color-accent)" }))
                  } />
                </div>
              </div>

              {/* Recent expenses mini-table */}
              <div className="rounded-lg border border-subtle bg-surface-1">
                <div className="border-b border-subtle px-4 py-2">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-muted">{tr("recentExpenses")}</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-subtle">
                      <th className="px-4 py-1.5 text-left font-medium text-muted">{tr("colDescription")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted">{tr("colCategory")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted">{tr("colDate")}</th>
                      <th className="px-3 py-1.5 text-right font-medium text-muted">{tr("colAmount")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-muted">{tr("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, 8).map((e) => (
                      <tr key={e.id} className="border-b border-subtle hover:bg-surface-1">
                        <td className="max-w-[180px] truncate px-4 py-1.5 text-secondary">{e.description}</td>
                        <td className="px-3 py-1.5 text-muted">{e.detected_category ?? " - "}</td>
                        <td className="px-3 py-1.5 text-muted">{fmtDate(e.expense_date ?? e.created_at)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-secondary">{fmt(e.amount)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded border px-1.5 py-px text-[9px] capitalize ${statusClasses(e.status)}`}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length > 8 && (
                  <div className="px-4 py-1.5">
                    <button onClick={() => setView("table")} className="text-[9px] text-accent/60 hover:text-accent">
                      {tr("viewAll", { count: sorted.length })}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {view === "table" && (
            <div className="px-4 pb-6">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-subtle">
                    {([
                      { key: "description" as SortKey, label: tr("colDescription"), cls: "text-left" },
                      { key: "detected_category" as SortKey, label: tr("colCategory"), cls: "text-left" },
                      { key: "expense_date" as SortKey, label: tr("colDate"), cls: "text-left" },
                      { key: "amount" as SortKey, label: tr("colAmount"), cls: "text-right" },
                      { key: "status" as SortKey, label: tr("colStatus"), cls: "text-left" },
                    ]).map(({ key, label, cls }) => (
                      <th
                        key={key}
                        onClick={() => toggleSort(key)}
                        className={`cursor-pointer select-none px-3 py-2 font-medium text-muted transition-colors hover:text-secondary ${cls}`}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {label} <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-muted">{tr("colType")}</th>
                    <th className="px-3 py-2 text-left font-medium text-muted">{tr("colAccount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.id} className="border-b border-subtle hover:bg-surface-1 transition-colors">
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-secondary">{e.description}</td>
                      <td className="px-3 py-1.5 text-muted">{e.detected_category ?? " - "}</td>
                      <td className="px-3 py-1.5 tabular-nums text-muted">{fmtDate(e.expense_date ?? e.created_at)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-secondary">{fmt(e.amount)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded border px-1.5 py-px text-[9px] capitalize ${statusClasses(e.status)}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-muted">{e.expense_type ?? " - "}</td>
                      <td className="px-3 py-1.5 font-mono text-[9px] text-muted">{e.account_code ?? " - "}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-[10px] text-muted">{tr("noMatch")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* AI panel */}
      <AiInsightPanel expenses={filtered} visible={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
