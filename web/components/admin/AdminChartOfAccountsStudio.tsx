"use client";

/**
 * AdminChartOfAccountsStudio - Motor de Pólizas.
 *
 * Five tabs:
 *   • Mapeo    - 3-column live engine: sample expense → mapping decisions
 *                → live journal-entry preview
 *   • Cuentas  - read-only list of CoA accounts (Phase C makes editable)
 *   • IVA      - read-only list of tax rates    (Phase C makes editable)
 *   • Pruebas  - interactive simulator (Phase D adds presets)
 *   • Exportar - placeholder for Phase D export formats
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
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

// ── Types & shared components imported from ./coa/ ───────────────────────
import {
  type AccountRead, type TaxRateRead, type CategoryRead,
  type PolizaLine, type PolizaResult, type Tab,
  type AccountDraft, type TaxRateDraft,
  SAMPLE_EXPENSES, ACCOUNT_CLASSES, SPLIT_OPTIONS, TAX_BEHAVIORS,
  blankAccount, blankRate, buildAccountTree, CUSTOM_PRESETS,
} from "./coa/types";
import { SectionLabel, EmptyHint, BindingRow, PolizaPreview } from "./coa/SharedComponents";
function AccountsEditor({
  companyId, accounts = [], onChanged = async () => {},
}: { companyId: number; accounts?: AccountRead[]; onChanged?: () => Promise<void> }) {
  const t = useTranslations("admin.coa");
  const [draft, setDraft] = useState<AccountDraft>(blankAccount());
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Account lookup maps
  const byId = useMemo(() => {
    const m = new Map<number, AccountRead>();
    accounts.forEach(a => m.set(a.id, a));
    return m;
  }, [accounts]);
  const byCode = useMemo(() => {
    const m = new Map<string, AccountRead>();
    accounts.forEach(a => m.set(a.code, a));
    return m;
  }, [accounts]);

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
  // Header candidates for the parent picker = non-postable rows.
  const headerOptions = useMemo(
    () => accounts.filter(a => !a.is_postable).sort((x, y) =>
      x.code.localeCompare(y.code, undefined, { numeric: true })
    ),
    [accounts],
  );

  const tree = useMemo(() => buildAccountTree(accounts), [accounts]);

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
      await apiCall(`/admin/coa/${companyId}/accounts`, {
        method: "PUT",
        json: {
          code: d.code, name: d.name,
          sat_group_code: d.sat_group_code || null,
          account_class: d.account_class,
          split_by: d.split_by,
          is_postable: d.is_postable,
          parent_id: d.parent_id,
        },
      });
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
      await apiDelete(`/admin/coa/accounts/${id}`);
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-[10px] text-error">{error}</p>
      )}

      {/* Add-new row */}
      <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
          <input
            value={draft.code}
            onChange={(e) => setDraft({ ...draft, code: e.target.value })}
            placeholder={t("cuentas.code")}
            className="col-span-2 rounded border border-default bg-surface-1 px-2 py-1 font-mono text-[11px] text-primary outline-none focus:bg-accent-muted"
          />
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("cuentas.name")}
            className="col-span-3 rounded border border-default bg-surface-1 px-2 py-1 text-[11px] text-primary outline-none focus:bg-accent-muted"
          />
          <select
            value={draft.parent_id ?? ""}
            onChange={(e) => setDraft({ ...draft, parent_id: e.target.value ? Number(e.target.value) : null })}
            className="col-span-2 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
            title="Cuenta padre"
          >
            <option value=""> -  sin padre  - </option>
            {headerOptions.map(h => (
              <option key={h.id} value={h.id}>{h.code} · {h.name}</option>
            ))}
          </select>
          <select
            value={draft.account_class}
            onChange={(e) => setDraft({ ...draft, account_class: e.target.value })}
            className="col-span-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
          >
            {ACCOUNT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            value={draft.sat_group_code}
            onChange={(e) => setDraft({ ...draft, sat_group_code: e.target.value })}
            placeholder="Agrupador SAT"
            className="col-span-1 rounded border border-default bg-surface-1 px-2 py-1 font-mono text-[10px] text-secondary outline-none focus:bg-accent-muted"
          />
          <select
            value={draft.split_by}
            onChange={(e) => setDraft({ ...draft, split_by: e.target.value })}
            className="col-span-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
          >
            {SPLIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="col-span-1 flex items-center gap-1 text-[10px] text-tertiary">
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
            className="col-span-1 inline-flex items-center justify-center gap-1 rounded border bg-accent-muted bg-accent-muted py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {accounts.length === 0 ? (
        <EmptyHint message={t("cuentas.empty")} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
          <table className="w-full text-[11px]">
            <thead className="bg-surface-1 text-[9px] uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("cuentas.code")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.name")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.class")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.satGroup")}</th>
                <th className="px-3 py-1.5 text-left">{t("cuentas.split")}</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {tree.map(({ row: a, depth }: { row: AccountRead; depth: number }) => editing === a.id ? (
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
                    "hover:bg-surface-1 " +
                    (!a.is_postable ? "bg-surface-1" : "")
                  }
                >
                  <td
                    className={
                      "px-3 py-1.5 font-mono tabular-nums " +
                      (a.is_postable ? "text-secondary" : "text-primary font-semibold")
                    }
                    style={{ paddingLeft: 12 + depth * 16 }}
                  >
                    {!a.is_postable && (
                      <span className="mr-1.5 text-muted">▸</span>
                    )}
                    {a.code}
                  </td>
                  <td className={a.is_postable ? "px-3 py-1.5 text-primary" : "px-3 py-1.5 text-primary font-medium"}>
                    {a.name}
                  </td>
                  <td className="px-3 py-1.5 text-tertiary">{a.account_class}</td>
                  <td className="px-3 py-1.5 font-mono text-tertiary tabular-nums">{a.sat_group_code ?? " - "}</td>
                  <td className="px-3 py-1.5 text-tertiary">{a.is_postable ? a.split_by : " - "}</td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    {!a.is_postable && (
                      <button
                        onClick={() => startSubaccount(a)}
                        className="mr-1 rounded border border-default px-1.5 py-0.5 text-[9px] text-tertiary hover:bg-surface-2"
                        title="Crear subcuenta bajo esta cuenta"
                      >+ subcuenta</button>
                    )}
                    <button
                      onClick={() => setEditing(a.id)}
                      className="mr-1 rounded border border-default px-1.5 py-0.5 text-[9px] text-tertiary hover:bg-surface-2"
                    >Editar</button>
                    <button
                      onClick={() => void remove(a.id)}
                      className="rounded border border-red-500/20 px-1.5 py-0.5 text-[9px] text-error/80 hover:bg-red-500/10"
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
    <tr className="bg-blue-500/5">
      <td className="px-2 py-1">
        <input
          value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })}
          className="w-full rounded border border-default bg-surface-1 px-1.5 py-0.5 font-mono text-[11px] text-primary outline-none focus:bg-accent-muted"
        />
      </td>
      <td className="px-2 py-1">
        <input
          value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
          className="w-full rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[11px] text-primary outline-none focus:bg-accent-muted"
        />
      </td>
      <td className="px-2 py-1">
        <div className="flex flex-col gap-1">
          <select
            value={d.account_class}
            onChange={(e) => setD({ ...d, account_class: e.target.value })}
            className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[10px] text-secondary outline-none"
          >
            {ACCOUNT_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={d.parent_id ?? ""}
            onChange={(e) => setD({ ...d, parent_id: e.target.value ? Number(e.target.value) : null })}
            className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[10px] text-tertiary outline-none"
            title="Cuenta padre"
          >
            <option value=""> -  sin padre  - </option>
            {headerOptions
              .filter(h => h.id !== d.id)
              .map(h => <option key={h.id} value={h.id}>{h.code}</option>)}
          </select>
          <label className="flex items-center gap-1 text-[9px] text-tertiary">
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
          className="w-20 rounded border border-default bg-surface-1 px-1.5 py-0.5 font-mono text-[10px] text-secondary outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={d.split_by}
          onChange={(e) => setD({ ...d, split_by: e.target.value })}
          className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[10px] text-secondary outline-none"
        >
          {SPLIT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <button
          onClick={() => void onSave(d)} disabled={busy}
          className="mr-1 rounded border bg-accent-muted bg-accent-muted px-1.5 py-0.5 text-[9px] text-accent hover:bg-accent-muted"
        >Guardar</button>
        <button
          onClick={onCancel}
          className="rounded border border-default px-1.5 py-0.5 text-[9px] text-tertiary hover:bg-surface-2"
        >×</button>
      </td>
    </tr>
  );
}

// ── Tax-rate editor ─────────────────────────────────────────────────────────





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
      await apiCall(`/admin/coa/${companyId}/tax-rates`, {
        method: "PUT",
        json: {
          name: d.name,
          rate: Number(d.rate) || 0,
          behavior: d.behavior,
          gl_account_id: d.gl_account_id,
        },
      });
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
      await apiDelete(`/admin/coa/tax-rates/${id}`);
      await onChanged();
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-[10px] text-error">{error}</p>}

      {/* Add-new */}
      <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
        <div className="grid grid-cols-12 items-center gap-2 px-3 py-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t("iva.name")}
            className="col-span-4 rounded border border-default bg-surface-1 px-2 py-1 text-[11px] text-primary outline-none focus:bg-accent-muted"
          />
          <input
            type="number" step="0.0001" min="0" max="1"
            value={draft.rate}
            onChange={(e) => setDraft({ ...draft, rate: e.target.value })}
            className="col-span-1 rounded border border-default bg-surface-1 px-2 py-1 text-right text-[11px] tabular-nums text-primary outline-none focus:bg-accent-muted"
          />
          <select
            value={draft.behavior}
            onChange={(e) => setDraft({ ...draft, behavior: e.target.value })}
            className="col-span-3 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
          >
            {TAX_BEHAVIORS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select
            value={draft.gl_account_id ?? ""}
            onChange={(e) => setDraft({ ...draft, gl_account_id: e.target.value ? Number(e.target.value) : null })}
            className="col-span-3 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
          >
            <option value=""> -  GL  - </option>
            {glOptions.map(a => (
              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
            ))}
          </select>
          <button
            onClick={() => void saveDraft(draft)}
            disabled={busy}
            className="col-span-1 inline-flex items-center justify-center gap-1 rounded border bg-accent-muted bg-accent-muted py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {rates.length === 0 ? (
        <EmptyHint message={t("iva.empty")} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
          <table className="w-full text-[11px]">
            <thead className="bg-surface-1 text-[9px] uppercase tracking-widest text-muted">
              <tr>
                <th className="px-3 py-1.5 text-left">{t("iva.name")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.rate")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.behavior")}</th>
                <th className="px-3 py-1.5 text-left">{t("iva.glAccount")}</th>
                <th className="px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
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
                <tr key={r.id} className="hover:bg-surface-1">
                  <td className="px-3 py-1.5 text-primary">{r.name}</td>
                  <td className="px-3 py-1.5 tabular-nums text-secondary">{(r.rate * 100).toFixed(2)}%</td>
                  <td className="px-3 py-1.5 text-tertiary">{r.behavior}</td>
                  <td className="px-3 py-1.5 font-mono text-tertiary tabular-nums">
                    {r.gl_account_id === null ? " - " : accounts.find(a => a.id === r.gl_account_id)?.code ?? "?"}
                  </td>
                  <td className="px-3 py-1 text-right whitespace-nowrap">
                    <button
                      onClick={() => setEditing(r.id)}
                      className="mr-1 rounded border border-default px-1.5 py-0.5 text-[9px] text-tertiary hover:bg-surface-2"
                    >Editar</button>
                    <button
                      onClick={() => void remove(r.id)}
                      className="rounded border border-red-500/20 px-1.5 py-0.5 text-[9px] text-error/80 hover:bg-red-500/10"
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
    <tr className="bg-blue-500/5">
      <td className="px-2 py-1">
        <input
          value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
          className="w-full rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[11px] text-primary outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="number" step="0.0001" min="0" max="1"
          value={d.rate} onChange={(e) => setD({ ...d, rate: e.target.value })}
          className="w-20 rounded border border-default bg-surface-1 px-1.5 py-0.5 text-right text-[11px] tabular-nums text-primary outline-none"
        />
      </td>
      <td className="px-2 py-1">
        <select
          value={d.behavior} onChange={(e) => setD({ ...d, behavior: e.target.value })}
          className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[10px] text-secondary outline-none"
        >
          {TAX_BEHAVIORS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </td>
      <td className="px-2 py-1">
        <select
          value={d.gl_account_id ?? ""}
          onChange={(e) => setD({ ...d, gl_account_id: e.target.value ? Number(e.target.value) : null })}
          className="rounded border border-default bg-surface-1 px-1.5 py-0.5 text-[10px] text-secondary outline-none"
        >
          <option value=""> - </option>
          {glOptions.map(a => <option key={a.id} value={a.id}>{a.code}</option>)}
        </select>
      </td>
      <td className="px-2 py-1 text-right whitespace-nowrap">
        <button
          onClick={() => void onSave(d)} disabled={busy}
          className="mr-1 rounded border bg-accent-muted bg-accent-muted px-1.5 py-0.5 text-[9px] text-accent hover:bg-accent-muted"
        >Guardar</button>
        <button
          onClick={onCancel}
          className="rounded border border-default px-1.5 py-0.5 text-[9px] text-tertiary hover:bg-surface-2"
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
      const data = await apiPost<{ created_or_updated: number; errors: string[]; warnings: string[] }>(`/admin/coa/${companyId}/import-accounts`, { csv_text: csv });
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
      const data = await apiPost<{ ok?: boolean; note?: string; suggestions?: AiSuggestion[] }>(`/admin/coa/${companyId}/ai-suggest`, { hint, only_unmapped: true });
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
    await apiPost(`/admin/coa/${companyId}/bulk-bindings`, { bindings });
    setSuggestions([]);
    setAccepted(new Set());
    await onChanged();
  };

  const acctCode = (id: number | null) =>
    id === null ? " - " : accounts.find(a => a.id === id)?.code ?? "?";
  const rateName = (id: number | null) =>
    id === null ? " - " : taxRates.find(r => r.id === id)?.name ?? "?";

  return (
    <div className="space-y-4">
      {/* Unified import - CSV + Copilot in a single panel */}
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

      {/* AI mapping - compact strip */}
      <div>
        <div className="mb-1 flex items-baseline justify-between px-1">
          <SectionLabel>{t("importar.aiHeader")}</SectionLabel>
          <span className="text-[10px] text-muted">
            {categories.length} categorías · {accounts.length} cuentas
          </span>
        </div>
        <div className="rounded-lg border border-default bg-surface-1 p-3 space-y-2">
          <p className="text-[10px] text-tertiary">{t("importar.aiHint")}</p>
          <div className="flex items-center gap-2">
            <input
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder={t("importar.aiPlaceholder")}
              className="flex-1 rounded border border-default bg-surface-2 px-2 py-1 text-[11px] text-secondary placeholder:text-muted outline-none focus:border-strong"
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
                className="shrink-0 inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-success-muted px-2 py-1 text-[10px] text-success hover:bg-success-muted"
              >
                <CheckCircle2 className="h-3 w-3" />
                {t("importar.aiApply", { count: accepted.size })}
              </button>
            )}
          </div>

          {aiNote && (
            <p className="rounded border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-[10px] text-warning">
              {aiNote}
            </p>
          )}

          {suggestions.length > 0 && (
            <div className="overflow-hidden rounded border border-default">
              <table className="w-full text-[10px]">
                <thead className="bg-surface-1 text-[9px] uppercase tracking-widest text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">✓</th>
                    <th className="px-2 py-1 text-left">Cat.</th>
                    <th className="px-2 py-1 text-left">Cuenta</th>
                    <th className="px-2 py-1 text-left">IVA</th>
                    <th className="px-2 py-1 text-left">Contrap.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
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
                      <td className="px-2 py-1 font-mono text-secondary">{s.category_code}</td>
                      <td className="px-2 py-1 font-mono text-secondary tabular-nums">{acctCode(s.expense_account_id)}</td>
                      <td className="px-2 py-1 text-tertiary">{rateName(s.tax_rate_id)}</td>
                      <td className="px-2 py-1 font-mono text-secondary tabular-nums">{acctCode(s.counterparty_account_id)}</td>
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
// Unified import - CSV directo OR Copilot (cualquier formato) in one panel
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
        <div className="inline-flex overflow-hidden rounded border border-default">
          <button
            onClick={() => setMode("csv")}
            className={`px-2 py-0.5 text-[10px] transition-colors ${
              mode === "csv" ? "bg-accent-muted text-accent" : "bg-surface-1 text-tertiary hover:text-secondary"
            }`}
          >
            CSV directo
          </button>
          <button
            onClick={() => setMode("copilot")}
            className={`border-l border-default px-2 py-0.5 text-[10px] transition-colors ${
              mode === "copilot" ? "bg-violet-500/20 text-violet-200" : "bg-surface-1 text-tertiary hover:text-secondary"
            }`}
          >
            <Sparkles className="mr-1 -mt-0.5 inline h-2.5 w-2.5" />
            Copilot · cualquier formato
          </button>
        </div>
      </div>

      {mode === "csv" ? (
        <div className="rounded-lg border border-default bg-surface-1 p-3 space-y-2">
          <p className="text-[10px] text-tertiary">{t("importar.csvHint")}</p>
          <div className="flex items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary hover:bg-surface-3">
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
              className="inline-flex items-center gap-1 rounded border bg-accent-muted bg-accent-muted px-2 py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
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
            className="w-full resize-y rounded border border-default bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-secondary placeholder:text-muted outline-none focus:border-strong"
          />
          {csvResult && (
            <div className="space-y-1 rounded border border-default section-subtle p-2 text-[10px]">
              <p className="text-emerald-300">✓ {csvResult.created_or_updated} cuentas procesadas</p>
              {csvResult.warnings?.map((w, i) => <p key={i} className="text-warning/80">• {w}</p>)}
              {csvResult.errors?.map((e, i) => <p key={i} className="text-error/80">× {e}</p>)}
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
// Subir template (Copilot) - AI normaliza cualquier formato a nuestro esquema
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
      const data = await apiPost<{ ok?: boolean; note?: string; accounts?: NormalizedAccount[] }>(`/admin/coa/${companyId}/ai-normalize-accounts`, { raw_text: raw, hint });
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
      const data = await apiPost<{ created_or_updated: number; errors: string[]; warnings: string[] }>(`/admin/coa/${companyId}/import-accounts`, { csv_text: csv });
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
    <div className="rounded-lg border border-default bg-surface-1 p-3 space-y-2">
      <p className="text-[10px] text-tertiary">{t("importar.copilotHint")}</p>

        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-12 lg:col-span-7 space-y-2">
            <div className="flex items-center gap-2">
              <label className="inline-flex cursor-pointer items-center gap-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary hover:bg-surface-3">
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
              <span className="text-[10px] text-muted">{raw.length} chars</span>
            </div>
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={8}
              placeholder={t("importar.copilotPlaceholder")}
              className="w-full resize-y rounded border border-default bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-secondary placeholder:text-muted outline-none focus:border-strong"
            />
          </div>
          <div className="col-span-12 lg:col-span-5 space-y-2">
            <textarea
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              rows={3}
              placeholder={t("importar.copilotHintPlaceholder")}
              className="w-full resize-none rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:border-strong"
            />
            {note && (
              <p className="rounded border border-amber-500/20 bg-amber-950/20 px-2 py-1 text-[10px] text-warning">
                {note}
              </p>
            )}
            {importResult && (
              <div className="space-y-1 rounded border border-default section-subtle p-2 text-[10px]">
                <p className="text-emerald-300">✓ {importResult.created_or_updated} cuentas importadas</p>
                {importResult.errors?.slice(0, 4).map((e, i) => <p key={i} className="text-error/80">× {e}</p>)}
              </div>
            )}
          </div>
        </div>

        {preview.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-tertiary">
                {preview.length} cuentas detectadas · {accepted.size} seleccionadas
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={toggleAll}
                  className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary hover:bg-surface-3"
                >
                  {accepted.size === preview.length ? "Deseleccionar todo" : "Seleccionar todo"}
                </button>
                <button
                  onClick={() => void importSelected()}
                  disabled={accepted.size === 0 || importBusy}
                  className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-success-muted px-2 py-1 text-[10px] text-success hover:bg-success-muted disabled:opacity-40"
                >
                  {importBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  {t("importar.copilotImport", { count: accepted.size })}
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-auto rounded border border-default">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-surface-0 text-[9px] uppercase tracking-widest text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">✓</th>
                    <th className="px-2 py-1 text-left">Código</th>
                    <th className="px-2 py-1 text-left">Nombre</th>
                    <th className="px-2 py-1 text-left">Clase</th>
                    <th className="px-2 py-1 text-left">SAT</th>
                    <th className="px-2 py-1 text-left">Split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {preview.map(a => (
                    <tr key={a.code} className={accepted.has(a.code) ? "" : "opacity-40"}>
                      <td className="px-2 py-1">
                        <input
                          type="checkbox"
                          checked={accepted.has(a.code)}
                          onChange={() => toggle(a.code)}
                        />
                      </td>
                      <td className="px-2 py-1 font-mono text-secondary tabular-nums">{a.code}</td>
                      <td className="px-2 py-1 text-secondary">{a.name}</td>
                      <td className="px-2 py-1 text-tertiary">{a.account_class}</td>
                      <td className="px-2 py-1 font-mono text-tertiary tabular-nums">{a.sat_group_code ?? " - "}</td>
                      <td className="px-2 py-1 text-tertiary">{a.split_by}</td>
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
      const data = await apiPost<PolizaResult>(`/admin/coa/${companyId}/simulate`, {
        expense: {
          amount: Number(amount) || 0,
          category_code: categoryCode,
          description: "Prueba manual",
        },
      });
      setResult(data);
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
        <div className="overflow-hidden rounded-lg border border-default bg-surface-1 divide-y divide-subtle">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-[11px] text-secondary">{t("pruebas.amount")}</p>
            <input
              type="number" step="0.01" min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-28 rounded border border-default bg-surface-1 px-2 py-1 text-right text-[11px] tabular-nums text-primary outline-none focus:bg-accent-muted"
            />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <p className="text-[11px] text-secondary">{t("pruebas.category")}</p>
            <select
              value={categoryCode}
              onChange={(e) => setCategoryCode(e.target.value)}
              className="w-48 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted"
            >
              {categories.map(c => (
                <option key={c.id} value={c.code}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>
          <div className="px-3 py-2">
            <button
              onClick={() => void run()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded border bg-accent-muted bg-accent-muted px-2 py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
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
// Bulk simulator (Phase D - Pruebas tab)
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
      const data = await apiCall<BulkResult>(`/admin/coa/${companyId}/bulk-simulate?limit=${limit}`);
      setResult(data);
    } catch (e: any) {
      setError(e?.message ?? "error");
    } finally { setBusy(false); }
  };

  return (
    <div>
      <SectionLabel>{t("pruebas.bulkHeader")}</SectionLabel>
      <div className="space-y-3 rounded-lg border border-default bg-surface-1 p-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-tertiary">{t("pruebas.bulkLimit")}</span>
          <input
            type="number" min="1" max="500" value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 50)}
            className="w-20 rounded border border-default bg-surface-1 px-2 py-1 text-right text-[11px] tabular-nums text-primary outline-none focus:bg-accent-muted"
          />
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border bg-accent-muted bg-accent-muted px-2 py-1 text-[10px] text-accent hover:bg-accent-muted disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
            {t("pruebas.bulkRun")}
          </button>
          {result && (
            <span className="ml-auto text-[10px] text-tertiary">
              {result.count} gastos · {result.balanced}/{result.count} balanceados ·
              {" "}<span className="text-warning/80">{result.unmapped}</span> sin mapeo ·
              {" "}<span className="text-warning/80">{result.missing_iva}</span> sin IVA
            </span>
          )}
        </div>

        {error && <p className="text-[10px] text-error">{error}</p>}

        {result && result.rows.length > 0 && (
          <div className="overflow-hidden rounded border border-default">
            <table className="w-full text-[10px]">
              <thead className="bg-surface-1 text-[9px] uppercase tracking-widest text-muted">
                <tr>
                  <th className="px-2 py-1 text-left">#</th>
                  <th className="px-2 py-1 text-left">{t("pruebas.colDate")}</th>
                  <th className="px-2 py-1 text-left">{t("pruebas.colDescription")}</th>
                  <th className="px-2 py-1 text-left">{t("pruebas.colCategory")}</th>
                  <th className="px-2 py-1 text-right">{t("pruebas.colAmount")}</th>
                  <th className="px-2 py-1 text-center">✓</th>
                  <th className="px-2 py-1 text-left">{t("pruebas.colWarnings")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-subtle">
                {result.rows.map(r => (
                  <tr key={r.expense_id} className={r.balanced ? "" : "bg-rose-500/5"}>
                    <td className="px-2 py-1 font-mono text-tertiary tabular-nums">{r.expense_id}</td>
                    <td className="px-2 py-1 font-mono text-tertiary tabular-nums">{r.date ?? " - "}</td>
                    <td className="px-2 py-1 text-secondary">{r.description.slice(0, 60)}</td>
                    <td className="px-2 py-1 font-mono text-tertiary">{r.category_code ?? " - "}</td>
                    <td className="px-2 py-1 text-right font-mono tabular-nums text-secondary">{r.amount}</td>
                    <td className="px-2 py-1 text-center">
                      {r.balanced
                        ? <CheckCircle2 className="inline h-3 w-3 text-emerald-300" />
                        : <AlertTriangle className="inline h-3 w-3 text-rose-300" />}
                    </td>
                    <td className="px-2 py-1 text-warning/70" title={r.warnings.join(" · ")}>
                      {r.warning_count > 0 ? t("pruebas.warningCount", { count: r.warning_count }) : " - "}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-1">
                <tr>
                  <td colSpan={4} className="px-2 py-1 text-right text-[9px] uppercase tracking-widest text-muted">{t("pruebas.totals")}</td>
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
// Export panel (Phase D - Exportar tab)
// ─────────────────────────────────────────────────────────────────────────────

function ExportPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.coa");
  const [limit, setLimit] = useState(200);
  const [rfc, setRfc] = useState("XAXX010101000");

  const download = (format: "coi" | "contpaqi" | "sat-polizas") => {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (format === "sat-polizas") qs.set("rfc", rfc);
    // Auth headers via fetch then create a blob - keeps the JWT off the URL.
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
    <div className="rounded-lg border border-default bg-surface-1 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <p className="text-[12px] font-semibold text-primary">{title}</p>
      </div>
      <p className="mb-3 text-[10px] text-tertiary">{desc}</p>
      <button
        onClick={() => download(format)}
        className="inline-flex items-center gap-1 rounded border bg-accent-muted bg-accent-muted px-2 py-1 text-[10px] text-accent hover:bg-accent-muted"
      >
        <Download className="h-3 w-3" />
        {t("exportar.download")}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      <SectionLabel>{t("exportar.params")}</SectionLabel>
      <div className="flex items-center gap-3 rounded-lg border border-default bg-surface-1 p-3">
        <label className="flex items-center gap-2 text-[10px] text-tertiary">
          {t("exportar.limit")}
          <input
            type="number" min="1" max="500" value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 200)}
            className="w-20 rounded border border-default bg-surface-1 px-2 py-1 text-right text-[11px] tabular-nums text-primary outline-none focus:bg-accent-muted"
          />
        </label>
        <label className="flex items-center gap-2 text-[10px] text-tertiary">
          RFC
          <input
            value={rfc} onChange={(e) => setRfc(e.target.value.toUpperCase())}
            maxLength={13}
            className="w-32 rounded border border-default bg-surface-1 px-2 py-1 font-mono text-[11px] text-primary outline-none focus:bg-accent-muted"
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
// Custom export - define your own format with a template + live preview
// ─────────────────────────────────────────────────────────────────────────────



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
      if (download) {
        // Blob download - must use raw fetch (apiCall doesn't support blob responses)
        const res = await fetch(`${API}/admin/coa/${companyId}/export/custom`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            line_template: line, header, footer,
            one_line_per: perExpense ? "expense" : "movement",
            limit, filename, extension, download: true,
          }),
        });
        if (!res.ok) { alert(`Export failed: ${res.status}`); return; }
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
        const data = await apiPost(`/admin/coa/${companyId}/export/custom`, {
          line_template: line, header, footer,
          one_line_per: perExpense ? "expense" : "movement",
          limit, filename, extension, download: false,
        });
        setPreview(data as any);
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
    <div className="space-y-2 rounded-lg border border-default bg-surface-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-primary">{t("exportar.customTitle")}</p>
        <div className="flex items-center gap-2">
          <select
            onChange={(e) => applyPreset(Number(e.target.value))}
            defaultValue=""
            className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary"
          >
            <option value="" disabled>{t("exportar.customPresets")}</option>
            {CUSTOM_PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-[10px] text-secondary">{t("exportar.customHint")}</p>

      <div className="grid grid-cols-12 gap-2">
        <div className="col-span-12 lg:col-span-7 space-y-2">
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-muted">{t("exportar.customHeader")}</p>
            <input
              value={header}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="fecha,cuenta,debe,haber,concepto"
              className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-secondary placeholder:text-muted outline-none focus:border-strong"
            />
          </div>
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-muted">{t("exportar.customLine")}</p>
            <textarea
              value={line}
              onChange={(e) => setLine(e.target.value)}
              rows={3}
              placeholder="{date},{account_code},{debit},{credit},{description}"
              className="w-full resize-y rounded border border-default bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-secondary placeholder:text-muted outline-none focus:border-strong"
            />
          </div>
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-muted">{t("exportar.customFooter")}</p>
            <input
              value={footer}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="(opcional)"
              className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 font-mono text-[10px] text-secondary placeholder:text-muted outline-none focus:border-strong"
            />
          </div>
        </div>

        <div className="col-span-12 lg:col-span-5 space-y-2">
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-widest text-muted">{t("exportar.customPlaceholders")}</p>
            <div className="space-y-1">
              <div className="flex flex-wrap gap-1">
                {EXPENSE_KEYS.map(k => (
                  <button key={k}
                    onClick={() => insertPlaceholder(k)}
                    className="rounded border border-blue-500/20 bg-blue-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-accent/85 hover:bg-accent-hover/15"
                  >{`{${k}}`}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {LINE_KEYS.map(k => (
                  <button key={k}
                    onClick={() => insertPlaceholder(k)}
                    disabled={perExpense}
                    className="rounded border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-success/85 hover:bg-emerald-500/15 disabled:opacity-30"
                  >{`{${k}}`}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[10px] text-tertiary">
              {t("exportar.customGranularity")}
              <select
                value={perExpense ? "expense" : "movement"}
                onChange={(e) => setPerExpense(e.target.value === "expense")}
                className="flex-1 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary"
              >
                <option value="movement">por movimiento</option>
                <option value="expense">por gasto</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-[10px] text-tertiary">
              {t("exportar.limit")}
              <input
                type="number" min={1} max={500} value={limit}
                onChange={(e) => setLimit(Number(e.target.value) || 200)}
                className="w-16 rounded border border-default bg-surface-1 px-2 py-1 text-right text-[10px] tabular-nums text-primary"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-1 text-[10px] text-tertiary">
              {t("exportar.customFilename")}
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ""))}
                className="flex-1 rounded border border-default bg-surface-1 px-2 py-1 font-mono text-[10px] text-primary"
              />
            </label>
            <label className="flex items-center gap-1 text-[10px] text-tertiary">
              {t("exportar.customExtension")}
              <input
                value={extension}
                onChange={(e) => setExtension(e.target.value.replace(/[^a-zA-Z0-9]/g, ""))}
                maxLength={5}
                className="w-16 rounded border border-default bg-surface-1 px-2 py-1 font-mono text-[10px] text-primary"
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
          className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-success-muted px-2 py-1 text-[10px] text-success hover:bg-success-muted disabled:opacity-40"
        >
          <Download className="h-3 w-3" />
          {t("exportar.customDownload")}
        </button>
        {preview && (
          <span className="text-[10px] text-tertiary">
            {preview.row_count} gastos · {preview.line_count} líneas · {preview.byte_count} bytes
          </span>
        )}
      </div>

      {preview && (
        <pre className="max-h-[280px] overflow-auto rounded border border-default bg-surface-3 p-2 font-mono text-[10px] text-secondary">{preview.preview}{preview.truncated ? "\n…" : ""}</pre>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-components
// ─────────────────────────────────────────────────────────────────────────────

export default AccountsEditor;
