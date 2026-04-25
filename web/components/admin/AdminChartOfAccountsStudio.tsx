"use client";

/**
 * AdminChartOfAccountsStudio — Motor de Pólizas.
 *
 * Five tabs:
 *   • Mapeo    — 3-column live engine: sample expense → mapping decisions
 *                → live journal-entry preview
 *   • Cuentas  — read-only list of CoA accounts (Phase C makes editable)
 *   • IVA      — read-only list of tax rates    (Phase C makes editable)
 *   • Pruebas  — interactive simulator (Phase D adds presets)
 *   • Exportar — placeholder for Phase D export formats
 *
 * Backend: /admin/coa/* + /admin/accounting-categories/*
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  PlayCircle,
  Plus,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from "lucide-react";
import { getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types mirrored from backend ──────────────────────────────────────────────

interface AccountRead {
  id: number;
  code: string;
  name: string;
  parent_id: number | null;
  sat_group_code: string | null;
  account_class: string;
  is_postable: boolean;
  split_by: string;
  sort_order: number;
  is_active: boolean;
}
interface TaxRateRead {
  id: number;
  name: string;
  rate: number;
  behavior: string;
  gl_account_id: number | null;
  is_active: boolean;
}
interface CategoryRead {
  id: number;
  code: string;
  name: string;
  expense_account_id: number | null;
  tax_rate_id: number | null;
  counterparty_account_id: number | null;
}
interface PolizaLine {
  account_code: string;
  account_name: string;
  debit:  string;
  credit: string;
  note:   string;
}
interface PolizaResult {
  lines: PolizaLine[];
  balanced: boolean;
  total_debit:  string;
  total_credit: string;
  warnings: string[];
}

// ── Sample expenses (deterministic, no backend calls) ────────────────────────

const SAMPLE_EXPENSES: {
  category_code: string;
  amount: number;
  description: string;
  vendor: string;
}[] = [
  { category_code: "TRAVEL",                amount: 1856.00, description: "Vuelo MEX-MTY",          vendor: "Aeroméxico" },
  { category_code: "MEALS",                 amount:   742.40, description: "Cena con cliente",       vendor: "Pujol" },
  { category_code: "SOFTWARE",              amount:  3480.00, description: "Suscripción Notion",     vendor: "Notion Labs" },
  { category_code: "OFFICE",                amount:   464.00, description: "Papelería trimestral",   vendor: "Office Depot" },
  { category_code: "PROFESSIONAL_SERVICES", amount: 12760.00, description: "Honorarios legales",     vendor: "Bufete García" },
  { category_code: "MARKETING",             amount:  5800.00, description: "Campaña LinkedIn",       vendor: "LinkedIn Corp" },
  { category_code: "UTILITIES",             amount:  1276.00, description: "Internet oficina",       vendor: "Totalplay" },
  { category_code: "MISCELLANEOUS",         amount:   348.00, description: "Estacionamiento",        vendor: "OperaPark" },
];

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
}

type Tab = "mapeo" | "cuentas" | "iva" | "importar" | "pruebas" | "exportar";

export default function AdminChartOfAccountsStudio({ companyId }: Props) {
  const t  = useTranslations("admin.coa");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<Tab>("mapeo");
  const [accounts,   setAccounts]   = useState<AccountRead[]>([]);
  const [taxRates,   setTaxRates]   = useState<TaxRateRead[]>([]);
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [seeding,    setSeeding]    = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getAuthHeaders();
      const [aRes, tRes, cRes] = await Promise.all([
        fetch(`${API}/admin/coa/${companyId}/accounts`,         { headers }),
        fetch(`${API}/admin/coa/${companyId}/tax-rates`,        { headers }),
        fetch(`${API}/admin/accounting-categories/${companyId}`, { headers }),
      ]);
      if (!aRes.ok) throw new Error(`accounts ${aRes.status}`);
      if (!tRes.ok) throw new Error(`tax-rates ${tRes.status}`);
      if (!cRes.ok) throw new Error(`categories ${cRes.status}`);
      setAccounts(await aRes.json());
      setTaxRates(await tRes.json());
      setCategories(await cRes.json());
    } catch (e: any) {
      setError(e?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [companyId]);

  const applyPlanBasico = async () => {
    setSeeding(true);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/apply-preset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ preset: "plan_basico" }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "preset failed");
    } finally {
      setSeeding(false);
    }
  };

  // ── Lookups ────────────────────────────────────────────────────────────────
  const expenseAccounts = useMemo(
    () => accounts.filter(a => a.account_class === "expense" && a.is_postable),
    [accounts],
  );
  const liabilityAccounts = useMemo(
    () => accounts.filter(a => a.account_class === "liability" && a.is_postable),
    [accounts],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">{t("title")}</h2>
          <span className="rounded border border-white/[0.07] px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-white/40">
            {t("badge")}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex items-center gap-1 rounded border border-white/[0.08] px-2 py-1 text-[10px] text-white/60 hover:bg-white/[0.04] disabled:opacity-40"
          >
            <RefreshCcw className="h-3 w-3" /> {tc("refresh")}
          </button>
          <button
            onClick={() => void applyPlanBasico()}
            disabled={seeding}
            className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
          >
            {seeding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {t("applyPreset")}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-950/20 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
          <p className="text-[11px] text-red-200">{error}</p>
        </div>
      )}

      {/* Tab strip */}
      <div className="flex items-center gap-0 border-b border-white/[0.07]">
        {(["mapeo", "cuentas", "iva", "importar", "pruebas", "exportar"] as Tab[]).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              "px-3 py-1.5 text-[11px] font-medium border-b -mb-px transition-colors " +
              (tab === k
                ? "border-indigo-400 text-white"
                : "border-transparent text-white/45 hover:text-white/70")
            }
          >
            {t(`tabs.${k}`)}
          </button>
        ))}
      </div>

      {/* Tab body */}
      {loading ? (
        <div className="flex items-center justify-center py-10 text-white/40">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : tab === "mapeo" ? (
        <MapeoEngine
          companyId={companyId}
          categories={categories}
          accounts={accounts}
          taxRates={taxRates}
          expenseAccounts={expenseAccounts}
          liabilityAccounts={liabilityAccounts}
          onChanged={loadAll}
        />
      ) : tab === "cuentas" ? (
        <AccountsEditor companyId={companyId} accounts={accounts} onChanged={loadAll} />
      ) : tab === "iva" ? (
        <TaxRatesEditor companyId={companyId} rates={taxRates} accounts={accounts} onChanged={loadAll} />
      ) : tab === "importar" ? (
        <ImportPanel
          companyId={companyId}
          categories={categories}
          accounts={accounts}
          taxRates={taxRates}
          onChanged={loadAll}
        />
      ) : tab === "pruebas" ? (
        <div className="space-y-6">
          <BulkSimulatorPanel companyId={companyId} />
          <SimulatorTab
            companyId={companyId}
            categories={categories}
          />
        </div>
      ) : (
        <ExportPanel companyId={companyId} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo: 3-column live engine
// ─────────────────────────────────────────────────────────────────────────────

interface MapeoProps {
  companyId: number;
  categories: CategoryRead[];
  accounts: AccountRead[];
  taxRates: TaxRateRead[];
  expenseAccounts:   AccountRead[];
  liabilityAccounts: AccountRead[];
  onChanged: () => Promise<void>;
}

function MapeoEngine({
  companyId, categories, accounts, taxRates,
  expenseAccounts, liabilityAccounts, onChanged,
}: MapeoProps) {
  const t = useTranslations("admin.coa");
  const [sampleIdx, setSampleIdx] = useState(0);
  const [poliza, setPoliza] = useState<PolizaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);

  const sample = SAMPLE_EXPENSES[sampleIdx];
  const activeCategory = useMemo(
    () => categories.find(c => c.code === sample.category_code) ?? null,
    [categories, sample.category_code],
  );

  // Recompute the póliza preview whenever sample or category bindings change.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBusy(true);
      try {
        const res = await fetch(`${API}/admin/coa/${companyId}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ expense: sample }),
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) setPoliza(data);
      } catch {
        if (!cancelled) setPoliza(null);
      } finally {
        if (!cancelled) setBusy(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [companyId, sampleIdx, categories]);

  const updateBinding = async (
    field: "expense_account_id" | "tax_rate_id" | "counterparty_account_id",
    value: number | null,
  ) => {
    if (!activeCategory) return;
    setSavingId(activeCategory.id);
    try {
      const body = {
        expense_account_id:      activeCategory.expense_account_id,
        tax_rate_id:             activeCategory.tax_rate_id,
        counterparty_account_id: activeCategory.counterparty_account_id,
        [field]: value,
      };
      const res = await fetch(
        `${API}/admin/accounting-categories/${activeCategory.id}/bindings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      {/* COL 1 — sample expense ───────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-3">
        <SectionLabel>{t("mapeo.sampleHeader")}</SectionLabel>
        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
          <div className="px-3 py-2.5">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-semibold text-white">{sample.vendor}</p>
              <p className="text-[10px] tabular-nums text-white/55">
                ${sample.amount.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
              </p>
            </div>
            <p className="mt-0.5 text-[10px] text-white/45">{sample.description}</p>
            <p className="mt-2 text-[9px] uppercase tracking-widest text-white/30">
              {t("mapeo.category")}: {sample.category_code}
            </p>
          </div>
          <div className="flex border-t border-white/[0.07] divide-x divide-white/[0.05]">
            <button
              onClick={() => setSampleIdx((i) => (i - 1 + SAMPLE_EXPENSES.length) % SAMPLE_EXPENSES.length)}
              className="flex-1 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.04]"
            >‹ {t("mapeo.prev")}</button>
            <button
              onClick={() => setSampleIdx((i) => (i + 1) % SAMPLE_EXPENSES.length)}
              className="flex-1 py-1.5 text-[10px] text-white/55 hover:bg-white/[0.04]"
            >{t("mapeo.next")} ›</button>
          </div>
          <p className="border-t border-white/[0.07] px-3 py-1.5 text-center text-[9px] text-white/30 tabular-nums">
            {sampleIdx + 1} / {SAMPLE_EXPENSES.length}
          </p>
        </div>
      </div>

      {/* COL 2 — mapping decisions ────────────────────────────────── */}
      <div className="col-span-12 lg:col-span-5">
        <SectionLabel>
          {t("mapeo.decisionsHeader")}
          {savingId !== null && <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-white/40" />}
        </SectionLabel>

        {!activeCategory ? (
          <EmptyHint message={t("mapeo.noCategory", { code: sample.category_code })} />
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
            <BindingRow
              label={t("mapeo.expenseAccount")}
              hint={t("mapeo.expenseAccountHint")}
              value={activeCategory.expense_account_id}
              options={expenseAccounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
              onChange={(v) => updateBinding("expense_account_id", v)}
            />
            <BindingRow
              label={t("mapeo.taxRate")}
              hint={t("mapeo.taxRateHint")}
              value={activeCategory.tax_rate_id}
              options={taxRates.map(r => ({
                value: r.id,
                label: `${r.name} (${(r.rate * 100).toFixed(0)}% · ${r.behavior})`,
              }))}
              onChange={(v) => updateBinding("tax_rate_id", v)}
            />
            <BindingRow
              label={t("mapeo.counterparty")}
              hint={t("mapeo.counterpartyHint")}
              value={activeCategory.counterparty_account_id}
              options={liabilityAccounts.map(a => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
              onChange={(v) => updateBinding("counterparty_account_id", v)}
            />
          </div>
        )}

        {accounts.length === 0 && (
          <p className="mt-2 text-[10px] text-amber-300/80">
            {t("mapeo.emptyHint")}
          </p>
        )}
      </div>

      {/* COL 3 — live póliza preview ──────────────────────────────── */}
      <div className="col-span-12 lg:col-span-4">
        <SectionLabel>
          {t("mapeo.previewHeader")}
          {busy && <Loader2 className="ml-2 inline h-3 w-3 animate-spin text-white/40" />}
        </SectionLabel>
        <PolizaPreview poliza={poliza} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Cuentas / IVA — editable inline editors (Phase C)
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_CLASSES = ["expense", "asset", "liability", "income", "equity"];
const SPLIT_OPTIONS   = ["none", "cost_center", "project", "client"];
const TAX_BEHAVIORS   = ["acreditable", "no_acreditable", "trasladable", "retenido", "exento"];

type AccountDraft = {
  id?: number;
  code: string;
  name: string;
  sat_group_code: string;
  account_class: string;
  split_by: string;
  is_postable: boolean;
  parent_id: number | null;
};

const blankAccount = (): AccountDraft => ({
  code: "", name: "", sat_group_code: "",
  account_class: "expense", split_by: "none", is_postable: true,
  parent_id: null,
});

// Build an indented, parent-grouped list. Falls back to code-prefix
// matching when parent_id is not set on the row (so legacy seeds still
// render as a tree by their `601.10 → 601` numeric prefix).
function buildAccountTree(accounts: AccountRead[]): { row: AccountRead; depth: number }[] {
  const byId   = new Map<number, AccountRead>();
  const byCode = new Map<string, AccountRead>();
  accounts.forEach(a => { byId.set(a.id, a); byCode.set(a.code, a); });

  const parentOf = (a: AccountRead): AccountRead | null => {
    if (a.parent_id != null && byId.has(a.parent_id)) return byId.get(a.parent_id)!;
    // Fallback: strip last `.xx` segment and look it up by code.
    const i = a.code.lastIndexOf(".");
    if (i > 0) {
      const prefix = a.code.slice(0, i);
      const p = byCode.get(prefix);
      if (p && p.id !== a.id) return p;
    }
    return null;
  };

  const childrenOf = new Map<number | "root", AccountRead[]>();
  childrenOf.set("root", []);
  accounts.forEach(a => {
    const p = parentOf(a);
    const key: number | "root" = p ? p.id : "root";
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(a);
  });
  childrenOf.forEach(arr => arr.sort((x, y) =>
    x.sort_order - y.sort_order || x.code.localeCompare(y.code, undefined, { numeric: true })
  ));

  const out: { row: AccountRead; depth: number }[] = [];
  const walk = (parentKey: number | "root", depth: number) => {
    const kids = childrenOf.get(parentKey) ?? [];
    kids.forEach(k => { out.push({ row: k, depth }); walk(k.id, depth + 1); });
  };
  walk("root", 0);
  // Safety net: if some node was orphaned (parent missing entirely), append it flat.
  if (out.length < accounts.length) {
    const seen = new Set(out.map(o => o.row.id));
    accounts.forEach(a => { if (!seen.has(a.id)) out.push({ row: a, depth: 0 }); });
  }
  return out;
}

function AccountsEditor({
  companyId, accounts, onChanged,
}: { companyId: number; accounts: AccountRead[]; onChanged: () => Promise<void> }) {
  const t = useTranslations("admin.coa");
  const [draft, setDraft] = useState<AccountDraft>(blankAccount());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);
  // Header candidates for the parent picker = non-postable rows.
  const headerOptions = useMemo(
    () => accounts.filter(a => !a.is_postable).sort((x, y) =>
      x.code.localeCompare(y.code, undefined, { numeric: true })
    ),
    [accounts],
  );

  const startSubaccount = (parent: AccountRead) => {
    setEditing(null);
    setDraft({
      ...blankAccount(),
      parent_id: parent.id,
      account_class: parent.account_class,
      sat_group_code: parent.sat_group_code ?? "",
      code: parent.code + ".",
    });
  };

  const saveDraft = async (d: AccountDraft) => {
    if (!d.code || !d.name) { setError("code y name son obligatorios"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/accounts`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          code: d.code, name: d.name,
          sat_group_code: d.sat_group_code || null,
          account_class: d.account_class,
          split_by: d.split_by,
          is_postable: d.is_postable,
          parent_id: d.parent_id,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDraft(blankAccount());
      setEditing(null);
      await onChanged();
    } catch (e: any) {
      setError(e?.message ?? "save failed");
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar esta cuenta?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/coa/accounts/${id}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-[10px] text-red-300">{error}</p>
      )}

      {/* Add-new row */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
          <input
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder={t("cuentas.code")}
            className="col-span-2 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 font-mono text-[11px] text-white outline-none focus:border-indigo-500/40"
          />
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("cuentas.name")}
            className="col-span-3 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white outline-none focus:border-indigo-500/40"
          />
          <select
            value={draft.parent_id ?? ""}
            onChange={(e) => setDraft({ ...draft, parent_id: e.target.value ? Number(e.target.value) : null })}
            className="col-span-2 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
            title="Cuenta padre"
          >
            <option value="">— sin padre —</option>
            {headerOptions.map(h => (
              <option key={h.id} value={h.id}>{h.code} · {h.name}</option>
            ))}
          </select>
          <select
            value={draft.account_class}
            onChange={(e) => setDraft({ ...draft, account_class: e.target.value })}
            className="col-span-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
          >
            {ACCOUNT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={draft.sat_group_code}
            onChange={(e) => setDraft({ ...draft, sat_group_code: e.target.value })}
            placeholder="Agrupador SAT"
            className="col-span-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 font-mono text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
          />
          <select
            value={draft.split_by}
            onChange={(e) => setDraft({ ...draft, split_by: e.target.value })}
            className="col-span-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
          >
            {SPLIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="col-span-1 flex items-center gap-1 text-[10px] text-white/55">
            <input
              type="checkbox"
              checked={draft.is_postable}
              onChange={(e) => setDraft({ ...draft, is_postable: e.target.checked })}
            />
            postable
          </label>
          <button
            onClick={() => void saveDraft(draft)}
            disabled={busy}
            className="col-span-1 inline-flex items-center justify-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyHint message={t("cuentas.empty")} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
          <table className="w-full text-[11px]">
            <thead className="bg-white/[0.02] text-[9px] uppercase tracking-widest text-white/30">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("cuentas.code")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.name")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.class")}</th>
                <th className="px-3 py-1.5 text-left">Agrupador SAT</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.split")}</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {tree.map(({ row: a, depth }) => editing === a.id ? (
                <EditableAccountRow
                  key={a.id}
                  initial={{
                    id: a.id, code: a.code, name: a.name,
                    sat_group_code: a.sat_group_code ?? "",
                    account_class: a.account_class,
                    split_by: a.split_by,
                    is_postable: a.is_postable,
                    parent_id: a.parent_id,
                  }}
                  headerOptions={headerOptions}
                  onSave={saveDraft}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              ) : (
                <tr
                  key={a.id}
                  className={
                    "hover:bg-white/[0.02] " +
                    (!a.is_postable ? "bg-white/[0.015]" : "")
                  }
                >
                  <td
                    className={
                      "px-3 py-1.5 font-mono tabular-nums " +
                      (a.is_postable ? "text-white/70" : "text-white/85 font-semibold")
                    }
                    style={{ paddingLeft: 12 + depth * 16 }}
                  >
                    {!a.is_postable && (
                      <span className="mr-1.5 text-white/25">▸</span>
                    )}
                    {a.code}
                  </td>
                  <td className={a.is_postable ? "px-3 py-1.5 text-white/85" : "px-3 py-1.5 text-white font-medium"}>
                    {a.name}
                  </td>
                  <td className="px-3 py-1.5 text-white/45">{a.account_class}</td>
                  <td className="px-3 py-1.5 font-mono text-white/40 tabular-nums">{a.sat_group_code ?? "—"}</td>
                  <td className="px-3 py-1.5 text-white/45">{a.is_postable ? a.split_by : "—"}</td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    {!a.is_postable && (
                      <button
                        onClick={() => startSubaccount(a)}
                        className="mr-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/55 hover:bg-white/[0.04]"
                        title="Crear subcuenta bajo esta cuenta"
                      >+ subcuenta</button>
                    )}
                    <button
                      onClick={() => setEditing(a.id)}
                      className="mr-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/55 hover:bg-white/[0.04]"
                    >Editar</button>
                    <button
                      onClick={() => void remove(a.id)}
                      className="rounded border border-red-500/20 px-1.5 py-0.5 text-[9px] text-red-300/80 hover:bg-red-500/10"
                    ><Trash2 className="inline h-3 w-3" /></button>
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

function EditableAccountRow({
  initial, headerOptions, onSave, onCancel, busy,
}: {
  initial: AccountDraft;
  headerOptions: AccountRead[];
  onSave: (d: AccountDraft) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [d, setD] = useState<AccountDraft>(initial);
  return (
    <tr className="bg-indigo-500/5">
      <td className="px-2 py-1">
        <input
          value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })}
          className="w-full rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-white outline-none focus:border-indigo-500/40"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
          className="w-full rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white outline-none focus:border-indigo-500/40"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex flex-col gap-1">
          <select
            value={d.account_class}
            onChange={(e) => setD({ ...d, account_class: e.target.value })}
            className="rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/70 outline-none"
          >
            {ACCOUNT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={d.parent_id ?? ""}
            onChange={(e) => setD({ ...d, parent_id: e.target.value ? Number(e.target.value) : null })}
            className="rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/55 outline-none"
            title="Cuenta padre"
          >
            <option value="">— sin padre —</option>
            {headerOptions
              .filter(h => h.id !== d.id)
              .map(h => <option key={h.id} value={h.id}>{h.code}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[9px] text-white/55">
            <input
              type="checkbox"
              checked={d.is_postable}
              onChange={(e) => setD({ ...d, is_postable: e.target.checked })}
            />
            postable
          </label>
        </div>
      </td>
      <td className="px-2 py-1">
        <input
          value={d.sat_group_code}
          onChange={(e) => setD({ ...d, sat_group_code: e.target.value })}
          className="w-20 rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 font-mono text-[10px] text-white/70 outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={d.split_by}
          onChange={(e) => setD({ ...d, split_by: e.target.value })}
          className="rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/70 outline-none"
        >
          {SPLIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <button
          onClick={() => void onSave(d)} disabled={busy}
          className="mr-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200 hover:bg-indigo-500/20"
        >Guardar</button>
        <button
          onClick={onCancel}
          className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/55 hover:bg-white/[0.04]"
        >×</button>
      </td>
    </tr>
  );
}

// ── Tax-rate editor ─────────────────────────────────────────────────────────

type TaxRateDraft = {
  id?: number;
  name: string;
  rate: string;       // string for input control
  behavior: string;
  gl_account_id: number | null;
};

const blankRate = (): TaxRateDraft => ({
  name: "", rate: "0.16", behavior: "acreditable", gl_account_id: null,
});

function TaxRatesEditor({
  companyId, rates, accounts, onChanged,
}: { companyId: number; rates: TaxRateRead[]; accounts: AccountRead[]; onChanged: () => Promise<void> }) {
  const t = useTranslations("admin.coa");
  const [draft, setDraft] = useState<TaxRateDraft>(blankRate());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const glOptions = accounts.filter(a =>
    a.account_class === "asset" || a.account_class === "liability"
  );

  const saveDraft = async (d: TaxRateDraft) => {
    if (!d.name) { setError("nombre obligatorio"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/tax-rates`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name: d.name,
          rate: Number(d.rate) || 0,
          behavior: d.behavior,
          gl_account_id: d.gl_account_id,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setDraft(blankRate());
      setEditing(null);
      await onChanged();
    } catch (e: any) {
      setError(e?.message ?? "save failed");
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("¿Eliminar esta tasa de IVA?")) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/coa/tax-rates/${id}`, {
        method: "DELETE", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-[10px] text-red-300">{error}</p>}

      {/* Add-new */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("iva.name")}
            className="col-span-4 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[11px] text-white outline-none focus:border-indigo-500/40"
          />
          <input
            type="number" step="0.0001" min="0" max="1"
            value={draft.rate}
            onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
            className="col-span-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-right text-[11px] tabular-nums text-white outline-none focus:border-indigo-500/40"
          />
          <select
            value={draft.behavior}
            onChange={(e) => setDraft({ ...draft, behavior: e.target.value })}
            className="col-span-3 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
          >
            {TAX_BEHAVIORS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={draft.gl_account_id ?? ""}
            onChange={(e) => setDraft({ ...draft, gl_account_id: e.target.value ? Number(e.target.value) : null })}
            className="col-span-3 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
          >
            <option value="">— GL —</option>
            {glOptions.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
          <button
            onClick={() => void saveDraft(draft)}
            disabled={busy}
            className="col-span-1 inline-flex items-center justify-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {rates.length === 0 ? (
        <EmptyHint message={t("iva.empty")} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
          <table className="w-full text-[11px]">
            <thead className="bg-white/[0.02] text-[9px] uppercase tracking-widest text-white/30">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("iva.name")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.rate")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.behavior")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.glAccount")}</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rates.map(r => editing === r.id ? (
                <EditableTaxRow
                  key={r.id}
                  initial={{
                    id: r.id, name: r.name, rate: String(r.rate),
                    behavior: r.behavior, gl_account_id: r.gl_account_id,
                  }}
                  glOptions={glOptions}
                  onSave={saveDraft}
                  onCancel={() => setEditing(null)}
                  busy={busy}
                />
              ) : (
                <tr key={r.id} className="hover:bg-white/[0.02]">
                  <td className="px-3 py-1.5 text-white/85">{r.name}</td>
                  <td className="px-3 py-1.5 tabular-nums text-white/70">{(r.rate * 100).toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-white/45">{r.behavior}</td>
                  <td className="px-3 py-1.5 font-mono text-white/40 tabular-nums">
                    {r.gl_account_id === null ? "—" : accounts.find(a => a.id === r.gl_account_id)?.code ?? "?"}
                  </td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(r.id)}
                      className="mr-1 rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/55 hover:bg-white/[0.04]"
                    >Editar</button>
                    <button
                      onClick={() => void remove(r.id)}
                      className="rounded border border-red-500/20 px-1.5 py-0.5 text-[9px] text-red-300/80 hover:bg-red-500/10"
                    ><Trash2 className="inline h-3 w-3" /></button>
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

function EditableTaxRow({
  initial, glOptions, onSave, onCancel, busy,
}: {
  initial: TaxRateDraft;
  glOptions: AccountRead[];
  onSave: (d: TaxRateDraft) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [d, setD] = useState<TaxRateDraft>(initial);
  return (
    <tr className="bg-indigo-500/5">
      <td className="px-2 py-1">
        <input
          value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
          className="w-full rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[11px] text-white outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number" step="0.0001" min="0" max="1"
          value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })}
          className="w-20 rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-right text-[11px] tabular-nums text-white outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={d.behavior} onChange={(e) => setD({ ...d, behavior: e.target.value })}
          className="rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/70 outline-none"
        >
          {TAX_BEHAVIORS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <select
          value={d.gl_account_id ?? ""}
          onChange={(e) => setD({ ...d, gl_account_id: e.target.value ? Number(e.target.value) : null })}
          className="rounded border border-white/[0.08] bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white/70 outline-none"
        >
          <option value="">—</option>
          {glOptions.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <button
          onClick={() => void onSave(d)} disabled={busy}
          className="mr-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200 hover:bg-indigo-500/20"
        >Guardar</button>
        <button
          onClick={onCancel}
          className="rounded border border-white/[0.08] px-1.5 py-0.5 text-[9px] text-white/55 hover:bg-white/[0.04]"
        >×</button>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Importar (CSV upload + AI suggestions)
// ─────────────────────────────────────────────────────────────────────────────

interface AiSuggestion {
  category_id: number;
  category_code: string;
  expense_account_id: number | null;
  tax_rate_id: number | null;
  counterparty_account_id: number | null;
  reasoning: string;
}

function ImportPanel({
  companyId, categories, accounts, taxRates, onChanged,
}: {
  companyId: number;
  categories: CategoryRead[];
  accounts: AccountRead[];
  taxRates: TaxRateRead[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin.coa");

  // CSV import
  const [csv, setCsv] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvResult, setCsvResult] = useState<{ created_or_updated: number; errors: string[]; warnings: string[] } | null>(null);

  const onFile = async (f: File) => {
    setCsv(await f.text());
  };

  const runImport = async () => {
    setCsvBusy(true); setCsvResult(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/import-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ csv_text: csv }),
      });
      const data = await res.json();
      setCsvResult(data);
      if (data.created_or_updated > 0) await onChanged();
    } finally { setCsvBusy(false); }
  };

  // AI suggestions
  const [hint, setHint] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<number>>(new Set());

  const runAi = async () => {
    setAiBusy(true); setAiNote(null); setSuggestions([]); setAccepted(new Set());
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/ai-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ hint, only_unmapped: true }),
      });
      const data = await res.json();
      if (!data.ok) {
        setAiNote(data.note ?? "Falló la sugerencia IA");
      } else {
        setSuggestions(data.suggestions || []);
        setAccepted(new Set((data.suggestions || []).map((s: AiSuggestion) => s.category_id)));
        if (data.suggestions?.length === 0) setAiNote(data.note ?? "Sin sugerencias.");
      }
    } catch (e: any) {
      setAiNote(e?.message ?? "error");
    } finally { setAiBusy(false); }
  };

  const applyAccepted = async () => {
    const bindings = suggestions
      .filter(s => accepted.has(s.category_id))
      .map(s => ({
        category_id: s.category_id,
        expense_account_id: s.expense_account_id,
        tax_rate_id: s.tax_rate_id,
        counterparty_account_id: s.counterparty_account_id,
      }));
    if (bindings.length === 0) return;
    const res = await fetch(`${API}/admin/coa/${companyId}/bulk-bindings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ bindings }),
    });
    if (res.ok) {
      setSuggestions([]);
      setAccepted(new Set());
      await onChanged();
    }
  };

  const acctCode = (id: number | null) =>
    id === null ? "—" : accounts.find(a => a.id === id)?.code ?? "?";
  const rateName = (id: number | null) =>
    id === null ? "—" : taxRates.find(r => r.id === id)?.name ?? "?";

  return (
    <div className="space-y-4">
      {/* Unified import — CSV + Copilot in a single panel */}
      <UnifiedImportPanel
        companyId={companyId}
        onChanged={onChanged}
        csv={csv}
        setCsv={setCsv}
        csvBusy={csvBusy}
        csvResult={csvResult}
        onFile={onFile}
        runImport={runImport}
      />

      {/* AI mapping — compact strip */}
      <div>
        <div className="mb-1 flex items-baseline justify-between px-1">
          <SectionLabel>{t("importar.aiHeader")}</SectionLabel>
          <span className="text-[10px] text-white/30">
            {categories.length} categorías · {accounts.length} cuentas
          </span>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
          <p className="text-[10px] text-white/45">{t("importar.aiHint")}</p>
          <div className="flex items-center gap-2">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("importar.aiPlaceholder")}
              className="flex-1 rounded border border-white/[0.07] bg-black/30 px-2 py-1 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
            <button
              onClick={() => void runAi()}
              disabled={aiBusy}
              className="shrink-0 inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
            >
              {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
              {t("importar.aiRun")}
            </button>
            {suggestions.length > 0 && (
              <button
                onClick={() => void applyAccepted()}
                className="shrink-0 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20"
              >
                <CheckCircle2 className="h-3 w-3" />
                {t("importar.aiApply", { count: accepted.size })}
              </button>
            )}
          </div>

          {aiNote && (
            <p className="rounded border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
              {aiNote}
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="overflow-hidden rounded border border-white/[0.07]">
              <table className="w-full text-[10px]">
                <thead className="bg-white/[0.03] text-[9px] uppercase tracking-widest text-white/30">
                  <tr>
                    <th className="px-2 py-1 text-left">✓</th>
                    <th className="px-2 py-1 text-left">Cat.</th>
                    <th className="px-2 py-1 text-left">Cuenta</th>
                    <th className="px-2 py-1 text-left">IVA</th>
                    <th className="px-2 py-1 text-left">Contrap.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {suggestions.map(s => (
                    <tr key={s.category_id} title={s.reasoning}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={accepted.has(s.category_id)}
                          onChange={(e) => {
                            const next = new Set(accepted);
                            if (e.target.checked) next.add(s.category_id); else next.delete(s.category_id);
                            setAccepted(next);
                          }}
                        />
                      </td>
                      <td className="px-2 py-1 font-mono text-white/65">{s.category_code}</td>
                      <td className="px-2 py-1 font-mono text-white/65 tabular-nums">{acctCode(s.expense_account_id)}</td>
                      <td className="px-2 py-1 text-white/55">{rateName(s.tax_rate_id)}</td>
                      <td className="px-2 py-1 font-mono text-white/65 tabular-nums">{acctCode(s.counterparty_account_id)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified import — CSV directo OR Copilot (cualquier formato) in one panel
// ─────────────────────────────────────────────────────────────────────────────

function UnifiedImportPanel({
  companyId,
  onChanged,
  csv,
  setCsv,
  csvBusy,
  csvResult,
  onFile: onCsvFile,
  runImport,
}: {
  companyId: number;
  onChanged: () => Promise<void>;
  csv: string;
  setCsv: (v: string) => void;
  csvBusy: boolean;
  csvResult: { created_or_updated: number; errors: string[]; warnings: string[] } | null;
  onFile: (f: File) => Promise<void>;
  runImport: () => Promise<void>;
}) {
  const t = useTranslations("admin.coa");
  const [mode, setMode] = useState<"csv" | "copilot">("csv");

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between px-1">
        <SectionLabel>Importar catálogo</SectionLabel>
        <div className="inline-flex overflow-hidden rounded border border-white/[0.08]">
          <button
            onClick={() => setMode("csv")}
            className={`px-2 py-0.5 text-[10px] transition-colors ${
              mode === "csv" ? "bg-indigo-500/20 text-indigo-200" : "bg-white/[0.02] text-white/45 hover:text-white/70"
            }`}
          >
            CSV directo
          </button>
          <button
            onClick={() => setMode("copilot")}
            className={`border-l border-white/[0.08] px-2 py-0.5 text-[10px] transition-colors ${
              mode === "copilot" ? "bg-violet-500/20 text-violet-200" : "bg-white/[0.02] text-white/45 hover:text-white/70"
            }`}
          >
            <Sparkles className="mr-1 -mt-0.5 inline h-2.5 w-2.5" />
            Copilot · cualquier formato
          </button>
        </div>
      </div>

      {mode === "csv" ? (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
          <p className="text-[10px] text-white/45">{t("importar.csvHint")}</p>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[0.06]">
              <Upload className="h-3 w-3" />
              {t("importar.chooseFile")}
              <input
                type="file"
                accept=".csv,.txt,.tsv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void onCsvFile(f); }}
              />
            </label>
            <button
              onClick={() => void runImport()}
              disabled={!csv.trim() || csvBusy}
              className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
            >
              {csvBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {t("importar.run")}
            </button>
          </div>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            rows={6}
            placeholder={"code,name,class,sat,split\n601.30,Renta de oficina,expense,601.30,none\n..."}
            className="w-full resize-y rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
          />
          {csvResult && (
            <div className="space-y-1 rounded border border-white/[0.07] bg-black/20 p-2 text-[10px]">
              <p className="text-emerald-300">✓ {csvResult.created_or_updated} cuentas procesadas</p>
              {csvResult.warnings?.map((w, i) => <p key={i} className="text-amber-300/80">• {w}</p>)}
              {csvResult.errors?.map((e, i) => <p key={i} className="text-red-300/80">× {e}</p>)}
            </div>
          )}
        </div>
      ) : (
        <TemplateCopilotPanel companyId={companyId} onChanged={onChanged} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Subir template (Copilot) — AI normaliza cualquier formato a nuestro esquema
// ─────────────────────────────────────────────────────────────────────────────

interface NormalizedAccount {
  code: string;
  name: string;
  account_class: string;
  sat_group_code: string | null;
  split_by: string;
}

function TemplateCopilotPanel({
  companyId,
  onChanged,
}: {
  companyId: number;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations("admin.coa");
  const [raw, setRaw] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreview] = useState<NormalizedAccount[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ created_or_updated: number; errors: string[]; warnings: string[] } | null>(null);

  const onFile = async (f: File) => {
    setRaw(await f.text());
  };

  const analyze = async () => {
    setBusy(true); setNote(null); setPreview([]); setAccepted(new Set()); setImportResult(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/ai-normalize-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ raw_text: raw, hint }),
      });
      const data = await res.json();
      if (!data.ok) {
        setNote(data.note ?? "Falló el análisis");
      } else {
        const list: NormalizedAccount[] = data.accounts || [];
        setPreview(list);
        setAccepted(new Set(list.map(a => a.code)));
        if (data.note) setNote(data.note);
        if (list.length === 0) setNote(data.note ?? "El modelo no detectó cuentas.");
      }
    } catch (e: any) {
      setNote(e?.message ?? "error");
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    const rows = preview.filter(a => accepted.has(a.code));
    if (rows.length === 0) return;
    const header = "code,name,class,sat,split";
    const csv = header + "\n" + rows.map(a =>
      [a.code, a.name.replace(/,/g, " "), a.account_class, a.sat_group_code ?? "", a.split_by]
        .map(v => String(v).includes(",") ? `"${v}"` : String(v))
        .join(",")
    ).join("\n");
    setImportBusy(true); setImportResult(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/import-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ csv_text: csv }),
      });
      const data = await res.json();
      setImportResult(data);
      if (data.created_or_updated > 0) {
        await onChanged();
        setPreview([]); setAccepted(new Set());
      }
    } finally {
      setImportBusy(false);
    }
  };

  const toggle = (code: string) => {
    const next = new Set(accepted);
    if (next.has(code)) next.delete(code); else next.add(code);
    setAccepted(next);
  };

  const toggleAll = () => {
    if (accepted.size === preview.length) setAccepted(new Set());
    else setAccepted(new Set(preview.map(a => a.code)));
  };

  return (
    <div className="rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-950/20 to-transparent p-3 space-y-2">
      <p className="text-[10px] text-white/55">{t("importar.copilotHint")}</p>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 lg:col-span-7 space-y-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[0.06]">
                <Upload className="h-3 w-3" />
                {t("importar.chooseFile")}
                <input
                  type="file"
                  accept=".csv,.tsv,.txt,.md,.json"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
                />
              </label>
              <button
                onClick={() => void analyze()}
                disabled={!raw.trim() || busy}
                className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {t("importar.copilotAnalyze")}
              </button>
              <span className="text-[10px] text-white/35">{raw.length} chars</span>
            </div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={t("importar.copilotPlaceholder")}
              className="w-full resize-y rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
          </div>
          <div className="col-span-12 lg:col-span-5 space-y-2">
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
              placeholder={t("importar.copilotHintPlaceholder")}
              className="w-full resize-none rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
            {note && (
              <p className="rounded border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-[10px] text-amber-200">
                {note}
              </p>
            )}
            {importResult && (
              <div className="space-y-1 rounded border border-white/[0.07] bg-black/20 p-2 text-[10px]">
                <p className="text-emerald-300">✓ {importResult.created_or_updated} cuentas importadas</p>
                {importResult.errors?.slice(0, 4).map((e, i) => <p key={i} className="text-red-300/80">× {e}</p>)}
              </div>
            )}
          </div>
        </div>

        {preview.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-white/45">
                {preview.length} cuentas detectadas · {accepted.size} seleccionadas
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="rounded border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[10px] text-white/65 hover:bg-white/[0.06]"
                >
                  {accepted.size === preview.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
                <button
                  onClick={() => void importSelected()}
                  disabled={accepted.size === 0 || importBusy}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  {importBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  {t("importar.copilotImport", { count: accepted.size })}
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-auto rounded border border-white/[0.07]">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-zinc-950 text-[9px] uppercase tracking-widest text-white/30">
                  <tr>
                    <th className="px-2 py-1 text-left">✓</th>
                    <th className="px-2 py-1 text-left">Código</th>
                    <th className="px-2 py-1 text-left">Nombre</th>
                    <th className="px-2 py-1 text-left">Clase</th>
                    <th className="px-2 py-1 text-left">SAT</th>
                    <th className="px-2 py-1 text-left">Split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {preview.map(a => (
                    <tr key={a.code} className={accepted.has(a.code) ? "" : "opacity-40"}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={accepted.has(a.code)}
                          onChange={() => toggle(a.code)}
                        />
                      </td>
                      <td className="px-2 py-1 font-mono text-white/75 tabular-nums">{a.code}</td>
                      <td className="px-2 py-1 text-white/75">{a.name}</td>
                      <td className="px-2 py-1 text-white/55">{a.account_class}</td>
                      <td className="px-2 py-1 font-mono text-white/45 tabular-nums">{a.sat_group_code ?? "—"}</td>
                      <td className="px-2 py-1 text-white/45">{a.split_by}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pruebas (interactive simulator)
// ─────────────────────────────────────────────────────────────────────────────

function SimulatorTab({ companyId, categories }: { companyId: number; categories: CategoryRead[] }) {
  const t = useTranslations("admin.coa");
  const [amount, setAmount] = useState("1160.00");
  const [categoryCode, setCategoryCode] = useState(categories[0]?.code ?? "");
  const [result, setResult] = useState<PolizaResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!categoryCode && categories.length > 0) setCategoryCode(categories[0].code);
  }, [categories, categoryCode]);

  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          expense: {
            amount: Number(amount) || 0,
            category_code: categoryCode,
            description: "Prueba manual",
          },
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setResult(await res.json());
    } catch {
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-12 lg:col-span-5">
        <SectionLabel>{t("pruebas.input")}</SectionLabel>
        <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-[11px] text-white/68">{t("pruebas.amount")}</p>
            <input
              type="number" step="0.01" min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-right text-[11px] tabular-nums text-white outline-none focus:border-indigo-500/40"
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-[11px] text-white/68">{t("pruebas.category")}</p>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="w-48 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40"
            >
              {categories.map(c => (
                <option key={c.id} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div className="px-3 py-2">
            <button
              onClick={() => void run()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
              {t("pruebas.run")}
            </button>
          </div>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-7">
        <SectionLabel>{t("pruebas.output")}</SectionLabel>
        <PolizaPreview poliza={result} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk simulator (Phase D — Pruebas tab)
// ─────────────────────────────────────────────────────────────────────────────

interface BulkRow {
  expense_id: number;
  date: string | null;
  description: string;
  amount: string;
  category_code: string | null;
  balanced: boolean;
  warning_count: number;
  warnings: string[];
}
interface BulkResult {
  count: number;
  balanced: number;
  unmapped: number;
  missing_iva: number;
  total_debit: string;
  total_credit: string;
  rows: BulkRow[];
}

function BulkSimulatorPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.coa");
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/bulk-simulate?limit=${limit}`, {
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e?.message ?? "error");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <SectionLabel>{t("pruebas.bulkHeader")}</SectionLabel>
      <div className="space-y-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">{t("pruebas.bulkLimit")}</span>
          <input
            type="number" min="1" max="500" value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 50)}
            className="w-20 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-right text-[11px] tabular-nums text-white outline-none focus:border-indigo-500/40"
          />
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
            {t("pruebas.bulkRun")}
          </button>
          {result && (
            <span className="ml-auto text-[10px] text-white/40">
              {result.count} gastos · {result.balanced}/{result.count} balanceados ·
              {" "}<span className="text-amber-300/80">{result.unmapped}</span> sin mapeo ·
              {" "}<span className="text-amber-300/80">{result.missing_iva}</span> sin IVA
            </span>
          )}
        </div>

        {error && <p className="text-[10px] text-red-300">{error}</p>}

        {result && result.rows.length > 0 && (
          <div className="overflow-hidden rounded border border-white/[0.07]">
            <table className="w-full text-[10px]">
              <thead className="bg-white/[0.03] text-[9px] uppercase tracking-widest text-white/30">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">Fecha</th>
                  <th className="px-2 py-1 text-left">Descripción</th>
                  <th className="px-2 py-1 text-left">Cat.</th>
                  <th className="px-2 py-1 text-right">Monto</th>
                  <th className="px-2 py-1 text-center">✓</th>
                  <th className="px-2 py-1 text-left">Avisos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {result.rows.map(r => (
                  <tr key={r.expense_id} className={r.balanced ? "" : "bg-rose-500/5"}>
                    <td className="px-2 py-1 font-mono text-white/55 tabular-nums">{r.expense_id}</td>
                    <td className="px-2 py-1 font-mono text-white/40 tabular-nums">{r.date ?? "—"}</td>
                    <td className="px-2 py-1 text-white/75">{r.description.slice(0, 60)}</td>
                    <td className="px-2 py-1 font-mono text-white/55">{r.category_code ?? "—"}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-white/80">{r.amount}</td>
                    <td className="px-2 py-1 text-center">
                      {r.balanced
                        ? <CheckCircle2 className="inline h-3 w-3 text-emerald-300" />
                        : <AlertTriangle className="inline h-3 w-3 text-rose-300" />}
                    </td>
                    <td className="px-2 py-1 text-amber-200/70" title={r.warnings.join(" · ")}>
                      {r.warning_count > 0 ? `${r.warning_count} aviso(s)` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-white/[0.03]">
                <tr>
                  <td colSpan={4} className="px-2 py-1 text-right text-[9px] uppercase tracking-widest text-white/30">Totales</td>
                  <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-300/90">{result.total_debit}</td>
                  <td colSpan={2} className="px-2 py-1 text-right font-mono tabular-nums text-rose-300/90">{result.total_credit}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export panel (Phase D — Exportar tab)
// ─────────────────────────────────────────────────────────────────────────────

function ExportPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.coa");
  const [limit, setLimit] = useState(200);
  const [rfc, setRfc] = useState("XAXX010101000");

  const download = (format: "coi" | "contpaqi" | "sat-polizas") => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (format === "sat-polizas") qs.set("rfc", rfc);
    // Auth headers via fetch then create a blob — keeps the JWT off the URL.
    void (async () => {
      const res = await fetch(
        `${API}/admin/coa/${companyId}/export/${format}?${qs.toString()}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) {
        alert(`Export failed: ${res.status}`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1]
        ?? `${format}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    })();
  };

  const Card = ({ title, desc, format, icon: Icon }: {
    title: string; desc: string; format: "coi" | "contpaqi" | "sat-polizas"; icon: typeof FileText;
  }) => (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-indigo-300/80" />
        <p className="text-[12px] font-semibold text-white/85">{title}</p>
      </div>
      <p className="mb-3 text-[10px] text-white/45">{desc}</p>
      <button
        onClick={() => download(format)}
        className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-2 py-1 text-[10px] text-indigo-200 hover:bg-indigo-500/20"
      >
        <Download className="h-3 w-3" />
        {t("exportar.download")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionLabel>{t("exportar.params")}</SectionLabel>
      <div className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
        <label className="flex items-center gap-2 text-[10px] text-white/45">
          {t("exportar.limit")}
          <input
            type="number" min="1" max="500" value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 200)}
            className="w-20 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-right text-[11px] tabular-nums text-white outline-none focus:border-indigo-500/40"
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] text-white/45">
          RFC
          <input
            value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())}
            maxLength={13}
            className="w-32 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 font-mono text-[11px] text-white outline-none focus:border-indigo-500/40"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card
          title="Aspel COI"
          desc={t("exportar.coiDesc")}
          format="coi"
          icon={FileText}
        />
        <Card
          title="CONTPAQi"
          desc={t("exportar.contpaqiDesc")}
          format="contpaqi"
          icon={FileText}
        />
        <Card
          title={t("exportar.satTitle")}
          desc={t("exportar.satDesc")}
          format="sat-polizas"
          icon={FileText}
        />
      </div>

      <CustomExportPanel companyId={companyId} defaultLimit={limit} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom export — define your own format with a template + live preview
// ─────────────────────────────────────────────────────────────────────────────

const CUSTOM_PRESETS: { label: string; header: string; line: string; ext: string }[] = [
  {
    label: "CSV plano (1 fila por movimiento)",
    header: "fecha,poliza,cuenta,debe,haber,concepto",
    line:   "{date},EXP-{expense_id},{account_code},{debit},{credit},{description}",
    ext:    "csv",
  },
  {
    label: "TXT tabulado (ERP genérico)",
    header: "FECHA\tCUENTA\tDEBE\tHABER\tCONCEPTO",
    line:   "{date}\t{account_code}\t{debit}\t{credit}\t{description}",
    ext:    "txt",
  },
  {
    label: "Resumen por gasto (1 fila)",
    header: "id,fecha,categoría,monto,balanceado",
    line:   "{expense_id},{date},{category_code},{amount},{balanced}",
    ext:    "csv",
  },
];

function CustomExportPanel({ companyId, defaultLimit }: { companyId: number; defaultLimit: number }) {
  const t = useTranslations("admin.coa");
  const [header, setHeader] = useState(CUSTOM_PRESETS[0].header);
  const [line,   setLine]   = useState(CUSTOM_PRESETS[0].line);
  const [footer, setFooter] = useState("");
  const [perExpense, setPerExpense] = useState(false);
  const [limit, setLimit] = useState(defaultLimit);
  const [filename, setFilename] = useState("export");
  const [extension, setExtension] = useState("csv");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    line_count: number; byte_count: number; preview: string; truncated: boolean;
    row_count: number; balanced: number; total_debit: string; total_credit: string;
  } | null>(null);

  const applyPreset = (idx: number) => {
    const p = CUSTOM_PRESETS[idx];
    setHeader(p.header);
    setLine(p.line);
    setExtension(p.ext);
  };

  const callExport = async (download: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(`${API}/admin/coa/${companyId}/export/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          line_template: line,
          header,
          footer,
          one_line_per: perExpense ? "expense" : "movement",
          limit,
          filename,
          extension,
          download,
        }),
      });
      if (!res.ok) {
        alert(`Export failed: ${res.status}`);
        return;
      }
      if (download) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.headers.get("Content-Disposition")?.match(/filename="(.+?)"/)?.[1]
          ?? `${filename}.${extension}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } else {
        setPreview(await res.json());
      }
    } finally {
      setBusy(false);
    }
  };

  const insertPlaceholder = (token: string) => {
    setLine((prev) => prev + (prev.endsWith(",") || prev.endsWith("\t") || prev === "" ? "" : "") + `{${token}}`);
  };

  const EXPENSE_KEYS = ["expense_id", "date", "description", "category_code", "amount", "balanced"];
  const LINE_KEYS    = ["line_no", "account_code", "account_name", "debit", "credit", "note"];

  return (
    <div className="space-y-2 rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-950/15 to-transparent p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-white/85">{t("exportar.customTitle")}</p>
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => applyPreset(Number(e.target.value))}
            defaultValue=""
            className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/65"
          >
            <option value="" disabled>{t("exportar.customPresets")}</option>
            {CUSTOM_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[10px] text-white/50">{t("exportar.customHint")}</p>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 lg:col-span-7 space-y-2">
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-white/30">{t("exportar.customHeader")}</p>
            <input
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="fecha,cuenta,debe,haber,concepto"
              className="w-full rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
          </div>
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-white/30">{t("exportar.customLine")}</p>
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              placeholder="{date},{account_code},{debit},{credit},{description}"
              className="w-full resize-y rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
          </div>
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-white/30">{t("exportar.customFooter")}</p>
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="(opcional)"
              className="w-full rounded border border-white/[0.07] bg-black/30 px-2 py-1.5 font-mono text-[10px] text-white/70 placeholder:text-white/20 outline-none focus:border-white/20"
            />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-2">
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-white/30">{t("exportar.customPlaceholders")}</p>
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {EXPENSE_KEYS.map(k => (
                  <button key={k}
                    onClick={() => insertPlaceholder(k)}
                    className="rounded border border-indigo-500/20 bg-indigo-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-indigo-200/85 hover:bg-indigo-500/15"
                  >{`{${k}}`}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {LINE_KEYS.map(k => (
                  <button key={k}
                    onClick={() => insertPlaceholder(k)}
                    disabled={perExpense}
                    className="rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-emerald-200/85 hover:bg-emerald-500/15 disabled:opacity-30"
                  >{`{${k}}`}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[10px] text-white/55">
              {t("exportar.customGranularity")}
              <select
                value={perExpense ? "expense" : "movement"}
                onChange={(e) => setPerExpense(e.target.value === "expense")}
                className="flex-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/65"
              >
                <option value="movement">por movimiento</option>
                <option value="expense">por gasto</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-white/55">
              {t("exportar.limit")}
              <input
                type="number" min={1} max={500} value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 200)}
                className="w-16 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-right text-[10px] tabular-nums text-white/85"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[10px] text-white/55">
              {t("exportar.customFilename")}
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                className="flex-1 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 font-mono text-[10px] text-white/85"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-white/55">
              {t("exportar.customExtension")}
              <input
                value={extension}
                onChange={(e) => setExtension(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                maxLength={5}
                className="w-16 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 font-mono text-[10px] text-white/85"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => void callExport(false)}
          disabled={!line.trim() || busy}
          className="inline-flex items-center gap-1 rounded border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
          {t("exportar.customPreview")}
        </button>
        <button
          onClick={() => void callExport(true)}
          disabled={!line.trim() || busy}
          className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40"
        >
          <Download className="h-3 w-3" />
          {t("exportar.customDownload")}
        </button>
        {preview && (
          <span className="text-[10px] text-white/40">
            {preview.row_count} gastos · {preview.line_count} líneas · {preview.byte_count} bytes
          </span>
        )}
      </div>

      {preview && (
        <pre className="max-h-[280px] overflow-auto rounded border border-white/[0.07] bg-black/40 p-2 font-mono text-[10px] text-white/70">{preview.preview}{preview.truncated ? "\n…" : ""}</pre>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-white/22">
      {children}
    </p>
  );
}

function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-6 text-center">
      <p className="text-[10px] text-white/40">{message}</p>
    </div>
  );
}

function BindingRow({
  label, hint, value, options, onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  options: { value: number; label: string }[];
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {hint && <p className="text-[10px] text-white/28">{hint}</p>}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/70 outline-none focus:border-indigo-500/40 max-w-[260px]"
      >
        <option value="">—</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function PolizaPreview({ poliza }: { poliza: PolizaResult | null }) {
  const t = useTranslations("admin.coa");
  if (!poliza) {
    return <EmptyHint message={t("preview.empty")} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
      <table className="w-full text-[10.5px]">
        <thead className="bg-white/[0.02] text-[9px] uppercase tracking-widest text-white/30">
          <tr>
            <th className="px-2 py-1 text-left">{t("preview.account")}</th>
            <th className="px-2 py-1 text-right">{t("preview.debit")}</th>
            <th className="px-2 py-1 text-right">{t("preview.credit")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.04]">
          {poliza.lines.map((ln, i) => (
            <tr key={i} className={ln.account_code === "?" ? "bg-amber-950/15" : ""}>
              <td className="px-2 py-1">
                <p className="font-mono tabular-nums text-white/80">{ln.account_code}</p>
                <p className="text-[9.5px] text-white/35">{ln.account_name} · {ln.note}</p>
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-emerald-300/85">
                {ln.debit !== "0.00" ? ln.debit : <span className="text-white/15">—</span>}
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-rose-300/85">
                {ln.credit !== "0.00" ? ln.credit : <span className="text-white/15">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-white/[0.07] bg-white/[0.02] text-[10px] font-semibold">
          <tr>
            <td className="px-2 py-1 text-white/55">
              {poliza.balanced
                ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Balanceado</span>
                : <span className="inline-flex items-center gap-1 text-rose-300"><AlertTriangle className="h-3 w-3" /> Descuadrado</span>}
            </td>
            <td className="px-2 py-1 text-right tabular-nums text-emerald-300/85">{poliza.total_debit}</td>
            <td className="px-2 py-1 text-right tabular-nums text-rose-300/85">{poliza.total_credit}</td>
          </tr>
        </tfoot>
      </table>
      {poliza.warnings.length > 0 && (
        <div className="border-t border-white/[0.07] bg-amber-950/10 px-2 py-1.5">
          {poliza.warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-amber-200/80">• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
