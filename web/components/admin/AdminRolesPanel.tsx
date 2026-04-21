"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Role {
  id: number;
  company_id: number;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Props {
  roles: Role[];
  companyId?: number;
  onRolesChanged?: (roles: Role[]) => void;
}

export default function AdminRolesPanel({ roles, companyId = 1, onRolesChanged }: Props) {
  const tr = useTranslations("admin.roles");
  const tc = useTranslations("common");
  const [showForm, setShowForm] = useState(false);
  const [name,     setName]     = useState("");
  const [key,      setKey]      = useState("");
  const [desc,     setDesc]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !key.trim()) { setError(tr("errorRequired")); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/roles/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, key: key.trim(), name: name.trim(), description: desc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `${res.status}`);
      }
      const created = await res.json();
      onRolesChanged?.([...roles, created]);
      setName(""); setKey(""); setDesc("");
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message ?? tr("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white">{tr("title")}</h2>
          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
            {roles.length}
          </span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
          >
            <Plus className="h-3 w-3" />
            {tr("newRole")}
          </button>
        )}
      </div>

      {/* Content */}
      {roles.length === 0 && !showForm ? (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
          <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-white/10" />
          <p className="text-xs text-white/20 italic">{tr("empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07]">
          {/* Table header */}
          {roles.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_2fr_100px] gap-x-4 border-b border-white/[0.05] bg-black/20 px-4 py-2">
              {[tr("colName"), tr("colKey"), tr("colDescription"), tr("colCreated")].map((h) => (
                <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-white/22">
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Rows */}
          {roles.map((role) => (
            <div
              key={role.id}
              className="grid grid-cols-[1fr_1fr_2fr_100px] items-center gap-x-4 border-b border-white/[0.04] px-4 py-2.5 last:border-0 hover:bg-white/[0.02]"
            >
              <span className="truncate text-[11px] font-medium text-white/70">{role.name}</span>
              <span className="truncate font-mono text-[11px] text-indigo-300/80">{role.key}</span>
              <span className="truncate text-[11px] text-white/40">
                {role.description ?? <span className="italic text-white/20">—</span>}
              </span>
              <span className="font-mono text-[10px] text-white/25">
                {new Date(role.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </span>
            </div>
          ))}

          {/* Inline create form */}
          {showForm && (
            <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">{tr("formTitle")}</p>
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-2 mb-2">
                <input
                  type="text"
                  placeholder={tr("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
                />
                <input
                  type="text"
                  placeholder={tr("keyPlaceholder")}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
                />
                <input
                  type="text"
                  placeholder={tr("descPlaceholder")}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
                />
              </div>
              {error && <p className="mb-2 text-[10px] text-red-400/60">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tr("creating")}</> : <>{tr("create")}</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); setName(""); setKey(""); setDesc(""); }}
                  className="text-[10px] text-white/30 hover:text-white/55"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
