"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart2, Bot, Calendar, ChevronDown, ChevronUp, Download,
  FileText, Filter, Search, Send, SlidersHorizontal, TrendingUp, X,
} from "lucide-react";
import { useUserContext } from "@/context/UserContext";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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

const STATUS_COLORS: Record<string, string> = {
  draft:     "text-white/35 bg-white/[0.05] border-white/[0.07]",
  submitted: "text-sky-300/70 bg-sky-500/[0.08] border-sky-500/20",
  approved:  "text-emerald-300/70 bg-emerald-500/[0.08] border-emerald-500/20",
  rejected:  "text-red-300/70 bg-red-500/[0.08] border-red-500/20",
  processed: "text-indigo-300/70 bg-indigo-500/[0.08] border-indigo-500/20",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// ── Tiny SVG sparkline ─────────────────────────────────────────────────────────

function Sparkline({ data, w = 120, h = 32, color = "#6366f1" }: { data: number[]; w?: number; h?: number; color?: string }) {
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
          <span className="w-28 shrink-0 truncate text-right text-[9px] text-white/35">{d.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, backgroundColor: d.color }}
            />
          </div>
          <span className="w-16 shrink-0 text-[9px] tabular-nums text-white/40">{fmt(d.value)}</span>
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
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* Y grid + labels */}
      {yTicks.map((t) => (
        <g key={t.v}>
          <line x1={PAD_L} y1={t.y} x2={W - 8} y2={t.y} stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          <text x={PAD_L - 4} y={t.y + 3.5} textAnchor="end" fill="rgba(255,255,255,0.22)" fontSize="8">
            {t.v >= 1000 ? `$${(t.v / 1000).toFixed(0)}k` : `$${t.v.toFixed(0)}`}
          </text>
        </g>
      ))}
      {/* Area fill */}
      {areaD && <path d={areaD} fill="url(#chartFill)" />}
      {/* Line */}
      {lineD && <path d={lineD} fill="none" stroke="#6366f1" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />}
      {/* X labels + dots */}
      {pts.map((p) => (
        <g key={p.label}>
          <circle cx={p.x} cy={p.y} r="2.5" fill="#6366f1" opacity="0.8" />
          <text x={p.x} y={H - 6} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize="8">{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, sparkData, color = "#6366f1" }: {
  label: string; value: string; sub?: string; sparkData?: number[]; color?: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/28">{label}</span>
      <span className="text-xl font-bold tabular-nums text-white/85">{value}</span>
      {sub && <span className="text-[9px] text-white/28">{sub}</span>}
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
    fetch(`${API}/ai/status`, { headers: getAuthHeaders() }).then((r) => r.json()).then((d) => setAiAvail(d.available)).catch(() => setAiAvail(false));
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
      const r = await fetch(`${API}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, context: buildContext() }),
      });
      const d = await r.json();
      setMessages((m) => [...m, { role: "assistant", text: d.response ?? d.message ?? "No response." }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", text: "AI unavailable right now." }]);
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-white/[0.06] bg-zinc-950">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-white/[0.06] px-3">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3 w-3 text-indigo-300/60" />
          <span className="text-[9px] font-semibold uppercase tracking-widest text-white/35">{tr("aiAnalyst")}</span>
          {aiAvail === false && (
            <span className="rounded border border-amber-500/20 bg-amber-500/[0.07] px-1 py-px text-[8px] text-amber-400/60">{tr("aiOffline")}</span>
          )}
        </div>
        <button onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded text-white/25 hover:text-white/50">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && (
          <div className="space-y-1.5 pt-1">
            <p className="text-[9px] text-white/25">{tr("aiHint")}</p>
            {[
              tr("aiExample1"),
              tr("aiExample2"),
              tr("aiExample3"),
              tr("aiExample4"),
            ].map((s) => (
              <button
                key={s}
                onClick={() => { setPrompt(s); }}
                className="block w-full rounded border border-white/[0.07] bg-white/[0.02] px-2 py-1 text-left text-[9px] text-white/40 hover:bg-white/[0.04] hover:text-white/60"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`rounded px-2.5 py-1.5 text-[10px] leading-relaxed ${
            m.role === "user"
              ? "ml-4 bg-indigo-600/[0.12] text-white/65"
              : "mr-4 bg-white/[0.03] text-white/55"
          }`}>
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="mr-4 rounded bg-white/[0.03] px-2.5 py-1.5 text-[10px] text-white/30">
            {tr("analyzing")}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-2">
        <div className="flex gap-1.5">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={tr("askPlaceholder")}
            className="h-7 flex-1 rounded border border-white/[0.07] bg-white/[0.03] px-2 text-[10px] text-white/70 placeholder:text-white/22 focus:border-indigo-500/30 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !prompt.trim()}
            className="flex h-7 w-7 items-center justify-center rounded border border-indigo-500/20 bg-indigo-600/[0.12] text-indigo-300/70 hover:bg-indigo-600/20 disabled:opacity-30"
          >
            <Send className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main module ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS = ["#6366f1","#22d3ee","#a78bfa","#34d399","#f59e0b","#f87171","#e879f9","#38bdf8"];

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
        const r = await fetch(`${API}/expenses/`, { headers: { ...getAuthHeaders() } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
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
      <span className="text-[11px] text-white/25">{tr("loadingReports")}</span>
    </div>
  );
  if (error) return (
    <div className="flex h-full items-center justify-center">
      <span className="text-[11px] text-red-400/50">{error}</span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Main content */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Toolbar ── */}
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-zinc-950 px-4">
          {/* View toggle */}
          <div className="flex items-center rounded border border-white/[0.07] p-px">
            <button
              onClick={() => setView("overview")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${view === "overview" ? "bg-white/[0.07] text-white/70" : "text-white/30 hover:text-white/50"}`}
            >
              <BarChart2 className="h-3 w-3" /> {tr("overview")}
            </button>
            <button
              onClick={() => setView("table")}
              className={`flex items-center gap-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${view === "table" ? "bg-white/[0.07] text-white/70" : "text-white/30 hover:text-white/50"}`}
            >
              <FileText className="h-3 w-3" /> {tr("table")}
            </button>
          </div>

          {/* Search */}
          <div className="relative ml-2 flex-1 max-w-xs">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-white/20" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("searchPlaceholder")}
              className="h-6 w-full rounded border border-white/[0.07] bg-white/[0.03] pl-6 pr-2 text-[10px] text-white/65 placeholder:text-white/20 focus:border-indigo-500/30 focus:outline-none"
            />
          </div>

          {/* Date preset */}
          <div className="flex items-center gap-1">
            {(["all","30d","90d","ytd","custom"] as DatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`rounded px-2 py-0.5 text-[9px] font-medium transition-colors ${datePreset === p ? "bg-indigo-600/20 text-indigo-300/80" : "text-white/28 hover:text-white/50"}`}
              >
                {p === "all" ? tr("allTime") : p === "ytd" ? tr("ytd") : p === "custom" ? tr("custom") : p}
              </button>
            ))}
          </div>
          {datePreset === "custom" && (
            <>
              <input type="date" value={customFrom} onChange={(e)=>setCustomFrom(e.target.value)}
                className="h-6 rounded border border-white/[0.07] bg-white/[0.03] px-2 text-[9px] text-white/55 focus:outline-none" />
              <span className="text-[9px] text-white/25">–</span>
              <input type="date" value={customTo} onChange={(e)=>setCustomTo(e.target.value)}
                className="h-6 rounded border border-white/[0.07] bg-white/[0.03] px-2 text-[9px] text-white/55 focus:outline-none" />
            </>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-medium transition-colors ${showFilters ? "border-indigo-500/25 bg-indigo-600/10 text-indigo-300/70" : "border-white/[0.07] text-white/30 hover:text-white/50"}`}
            >
              <Filter className="h-3 w-3" />
              {tr("filters")}
              {(statusFilter !== "all" || catFilter !== "all") && (
                <span className="ml-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-indigo-500/40 text-[7px] text-white">
                  {(statusFilter !== "all" ? 1 : 0) + (catFilter !== "all" ? 1 : 0)}
                </span>
              )}
            </button>

            {/* AI toggle */}
            <button
              onClick={() => setAiOpen((v) => !v)}
              className={`flex items-center gap-1 rounded border px-2 py-1 text-[9px] font-medium transition-colors ${aiOpen ? "border-indigo-500/25 bg-indigo-600/10 text-indigo-300/70" : "border-white/[0.07] text-white/30 hover:text-white/50"}`}
            >
              <Bot className="h-3 w-3" /> AI
            </button>

            {/* Export */}
            <button
              onClick={exportCsv}
              className="flex items-center gap-1 rounded border border-white/[0.07] px-2 py-1 text-[9px] font-medium text-white/30 hover:text-white/55 transition-colors"
            >
              <Download className="h-3 w-3" /> CSV
            </button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        {showFilters && (
          <div className="flex shrink-0 items-center gap-4 border-b border-white/[0.06] bg-zinc-900/50 px-4 py-1.5">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-3 w-3 text-white/25" />
              <span className="text-[9px] text-white/30">{tr("statusLabel")}</span>
              <div className="flex gap-1">
                {["all", ...allStatuses].map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)}
                    className={`rounded px-1.5 py-0.5 text-[9px] font-medium capitalize transition-colors ${statusFilter === s ? "bg-white/[0.1] text-white/70" : "text-white/30 hover:text-white/50"}`}>
                    {s === "all" ? tc("all") : s}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-white/30">{tr("categoryLabel")}</span>
              <select
                value={catFilter}
                onChange={(e) => setCatFilter(e.target.value)}
                className="h-5 rounded border border-white/[0.07] bg-zinc-900 px-1.5 text-[9px] text-white/55 focus:outline-none"
              >
                <option value="all">{tr("allCategories")}</option>
                {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            {(statusFilter !== "all" || catFilter !== "all") && (
              <button onClick={() => { setStatusFilter("all"); setCatFilter("all"); }}
                className="ml-auto flex items-center gap-1 text-[9px] text-white/28 hover:text-white/50">
                <X className="h-2.5 w-2.5" /> {tr("clearFilters")}
              </button>
            )}
          </div>
        )}

        {/* ── Body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {/* Result count */}
          <div className="flex items-center justify-between px-4 py-1.5">
            <span className="text-[9px] text-white/25">
              {expenses.length !== filtered.length
                ? tr("expenseCountOf", { count: filtered.length, total: expenses.length })
                : tr("expenseCount", { count: filtered.length })
              }
            </span>
            <span className="text-[9px] font-semibold tabular-nums text-white/35">{fmt(totalAmt)}</span>
          </div>

          {view === "overview" && (
            <div className="space-y-4 px-4 pb-6">
              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3">
                <KpiCard label={tr("totalSpend")} value={fmt(totalAmt)} sub={tr("expenseCountSub", { count: filtered.length })} sparkData={sparkData} />
                <KpiCard label={tr("avgPerExpense")} value={fmt(avgAmt)} color="#22d3ee" />
                <KpiCard label={tr("submittedApproved")} value={String(submitted)} sub={tr("percentOfTotal", { pct: filtered.length ? Math.round((submitted/filtered.length)*100) : 0 })} color="#34d399" />
                <KpiCard label={tc("draft")} value={String(byStatus["draft"] ?? 0)} sub={tr("pendingAction")} color="#f59e0b" />
              </div>

              {/* Monthly chart */}
              {monthlyBuckets.length > 1 && (
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <TrendingUp className="h-3 w-3 text-indigo-300/50" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-white/28">{tr("monthlySpend")}</span>
                  </div>
                  <MonthlyChart buckets={monthlyBuckets} />
                </div>
              )}

              {/* Category breakdown + status */}
              <div className="grid grid-cols-2 gap-3">
                {categoryData.length > 0 && (
                  <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="mb-2 flex items-center gap-2">
                      <BarChart2 className="h-3 w-3 text-indigo-300/50" />
                      <span className="text-[9px] font-semibold uppercase tracking-widest text-white/28">{tr("byCategory")}</span>
                    </div>
                    <HBarChart data={categoryData} />
                  </div>
                )}
                <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <Calendar className="h-3 w-3 text-indigo-300/50" />
                    <span className="text-[9px] font-semibold uppercase tracking-widest text-white/28">{tr("byStatus")}</span>
                  </div>
                  <HBarChart data={
                    Object.entries(byStatus)
                      .sort((a,b)=>b[1]-a[1])
                      .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i] ?? "#6366f1" }))
                  } />
                </div>
              </div>

              {/* Recent expenses mini-table */}
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <div className="border-b border-white/[0.05] px-4 py-2">
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-white/28">{tr("recentExpenses")}</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      <th className="px-4 py-1.5 text-left font-medium text-white/28">{tr("colDescription")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-white/28">{tr("colCategory")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-white/28">{tr("colDate")}</th>
                      <th className="px-3 py-1.5 text-right font-medium text-white/28">{tr("colAmount")}</th>
                      <th className="px-3 py-1.5 text-left font-medium text-white/28">{tr("colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.slice(0, 8).map((e) => (
                      <tr key={e.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="max-w-[180px] truncate px-4 py-1.5 text-white/60">{e.description}</td>
                        <td className="px-3 py-1.5 text-white/35">{e.detected_category ?? "—"}</td>
                        <td className="px-3 py-1.5 text-white/35">{fmtDate(e.expense_date ?? e.created_at)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-white/60">{fmt(e.amount)}</td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded border px-1.5 py-px text-[9px] capitalize ${STATUS_COLORS[e.status] ?? "text-white/35 bg-white/[0.04] border-white/[0.06]"}`}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length > 8 && (
                  <div className="px-4 py-1.5">
                    <button onClick={() => setView("table")} className="text-[9px] text-indigo-400/60 hover:text-indigo-400/80">
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
                  <tr className="border-b border-white/[0.06]">
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
                        className={`cursor-pointer select-none px-3 py-2 font-medium text-white/28 transition-colors hover:text-white/50 ${cls}`}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {label} <SortIcon col={key} />
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-white/28">{tr("colType")}</th>
                    <th className="px-3 py-2 text-left font-medium text-white/28">{tr("colAccount")}</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((e) => (
                    <tr key={e.id} className="border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors">
                      <td className="max-w-[200px] truncate px-3 py-1.5 text-white/60">{e.description}</td>
                      <td className="px-3 py-1.5 text-white/35">{e.detected_category ?? "—"}</td>
                      <td className="px-3 py-1.5 tabular-nums text-white/35">{fmtDate(e.expense_date ?? e.created_at)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/65">{fmt(e.amount)}</td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded border px-1.5 py-px text-[9px] capitalize ${STATUS_COLORS[e.status] ?? "text-white/35 bg-white/[0.04] border-white/[0.06]"}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-white/30">{e.expense_type ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono text-[9px] text-white/25">{e.account_code ?? "—"}</td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-[10px] text-white/22">{tr("noMatch")}</td></tr>
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
