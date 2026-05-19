"use client";

import { useState } from "react";
import { Plus, ShieldCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { apiCall, apiPost } from "@/lib/api/client";


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
      const created = await apiPost("/roles/", { company_id: companyId, key: key.trim(), name: name.trim(), description: desc.trim() || null });
      onRolesChanged?.([...roles, created as any]);
      setName(""); setKey(""); setDesc("");
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message ?? tr("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
      {/* Premium header */}
      <div className="rounded-lg border border-default bg-surface-1 px-4 py-3">
        <div className="" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
              <ShieldCheck className="h-4 w-4 text-violet-400" />
            </div>
            <div className="flex flex-col">
              <h2 className="text-sm font-semibold text-primary">{tr("title")}</h2>
              <span className="text-[9px] text-muted">Access Control</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-violet-500/20 bg-violet-500/5 px-2.5 py-0.5 font-mono text-[10px] text-violet-400/70">
              {roles.length} roles
            </span>
            {!showForm && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] font-semibold text-tertiary transition-colors hover:border-strong hover:text-secondary"
              >
                <Plus className="h-3 w-3" />
                {tr("newRole")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      {roles.length === 0 && !showForm ? (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-8 text-center">
          <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-muted" />
          <p className="text-xs text-muted italic">{tr("empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-default">
          {/* Table header */}
          {roles.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_2fr_100px] gap-x-4 border-b border-subtle section-subtle px-4 py-2">
              {[tr("colName"), tr("colKey"), tr("colDescription"), tr("colCreated")].map((h) => (
                <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-muted">
                  {h}
                </span>
              ))}
            </div>
          )}

          {/* Rows */}
          {roles.map((role) => (
            <div
              key={role.id}
              className="grid grid-cols-[1fr_1fr_2fr_100px] items-center gap-x-4 border-b border-subtle px-4 py-2.5 last:border-0 hover:bg-surface-1"
            >
              <span className="truncate text-[11px] font-medium text-secondary">{role.name}</span>
              <span className="truncate font-mono text-[11px] text-accent">{role.key}</span>
              <span className="truncate text-[11px] text-tertiary">
                {role.description ?? <span className="italic text-muted"> - </span>}
              </span>
              <span className="font-mono text-[10px] text-muted">
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
            <div className="border-t border-subtle bg-surface-1 px-4 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted">{tr("formTitle")}</p>
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-2 mb-2">
                <input
                  type="text"
                  placeholder={tr("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:bg-accent-muted"
                />
                <input
                  type="text"
                  placeholder={tr("keyPlaceholder")}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 font-mono text-[10px] text-tertiary placeholder:text-muted outline-none focus:bg-accent-muted"
                />
                <input
                  type="text"
                  placeholder={tr("descPlaceholder")}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-tertiary placeholder:text-muted outline-none focus:bg-accent-muted"
                />
              </div>
              {error && <p className="mb-2 text-[10px] text-error/60">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded border border-subtle bg-surface-2 px-3 py-1 text-[10px] font-semibold text-secondary transition-colors hover:bg-surface-2 disabled:opacity-50"
                >
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tr("creating")}</> : <>{tr("create")}</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); setName(""); setKey(""); setDesc(""); }}
                  className="text-[10px] text-muted hover:text-tertiary"
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
