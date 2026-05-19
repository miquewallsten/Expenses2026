"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Plus, Loader2, AlertCircle, Users,
} from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";

interface Subcontractor {
  id: number;
  name: string;
  code: string;
  rfc: string;
  legal_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}

interface Props {
  companyId: number;
}

export default function AdminSubcontractorPanel({ companyId }: Props) {
  const t = useTranslations("admin.subcontractors");
  const [subs, setSubs] = useState<Subcontractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", rfc: "", legal_name: "", contact_email: "", contact_phone: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiCall<Subcontractor[]>(`/accounting/subcontractors/${companyId}`);
      setSubs(data);
    } catch (e: any) {
      setErr(e?.message ?? "load failed");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    if (!form.name.trim() || !form.rfc.trim()) return;
    setAdding(true);
    try {
      await apiPost(`/accounting/subcontractors/${companyId}`, form);
      setShowAdd(false);
      setForm({ name: "", rfc: "", legal_name: "", contact_email: "", contact_phone: "" });
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "add failed");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-secondary" />
        <h2 className="text-sm font-semibold text-secondary">{t("title")}</h2>
      </div>
      <p className="text-[11px] text-muted">{t("subtitle")}</p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowAdd(!showAdd)}
          className="inline-flex items-center gap-1.5 rounded border bg-accent-muted px-3 py-1 text-[10px] font-semibold text-accent"
        >
          <Plus className="h-3 w-3" /> {t("addSubcontractor")}
        </button>
      </div>

      {err && (
        <div className="flex items-center gap-1.5 rounded border border-red-500/20 bg-red-950/20 px-3 py-1.5 text-[10px] text-error/70">
          <AlertCircle className="h-3 w-3" /> {err}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-lg border border-default bg-surface-1 p-3 space-y-2">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nombre *"
            className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
          />
          <input
            value={form.rfc}
            onChange={(e) => setForm({ ...form, rfc: e.target.value.toUpperCase() })}
            placeholder="RFC *"
            className="w-full rounded border border-default bg-surface-0 px-2 py-1 font-mono text-[11px] text-primary"
          />
          <input
            value={form.legal_name}
            onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
            placeholder="Razón social"
            className="w-full rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              value={form.contact_email}
              onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
              placeholder="Email"
              className="rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
            />
            <input
              value={form.contact_phone}
              onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="Teléfono"
              className="rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary"
            />
          </div>
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding || !form.name.trim() || !form.rfc.trim()}
            className="inline-flex items-center gap-1.5 rounded border border-emerald-500/20 bg-emerald-950/20 px-3 py-1 text-[10px] font-semibold text-emerald-400 disabled:opacity-40"
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {t("save")}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-muted" />
        </div>
      ) : subs.length === 0 ? (
        <p className="text-[11px] text-muted">{t("noSubcontractors")}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-default">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] font-bold uppercase tracking-widest text-muted">
                <th className="px-3 py-2">RFC</th>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Razón Social</th>
                <th className="px-3 py-2">Email</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle">
              {subs.map((s) => (
                <tr key={s.id} className="text-secondary">
                  <td className="px-3 py-1.5 font-mono">{s.rfc}</td>
                  <td className="px-3 py-1.5">{s.name}</td>
                  <td className="px-3 py-1.5 text-muted">{s.legal_name || "-"}</td>
                  <td className="px-3 py-1.5 text-muted">{s.contact_email || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
