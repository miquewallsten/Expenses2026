"use client";

import { useState } from "react";
import { Plus, Key, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface Permission {
  id: number;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface Props {
  permissions: Permission[];
  onPermissionsChanged?: (permissions: Permission[]) => void;
}

export default function AdminPermissionsPanel({ permissions, onPermissionsChanged }: Props) {
  const tp = useTranslations("admin.permissions");
  const tc = useTranslations("common");
  const [showForm, setShowForm] = useState(false);
  const [key,      setKey]      = useState("");
  const [name,     setName]     = useState("");
  const [desc,     setDesc]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleCreate = async () => {
    if (!key.trim() || !name.trim()) { setError(tp("errorRequired")); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/roles/permissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim(), name: name.trim(), description: desc.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail ?? `${res.status}`);
      }
      const created = await res.json();
      onPermissionsChanged?.([...permissions, created]);
      setKey(""); setName(""); setDesc("");
      setShowForm(false);
    } catch (e: any) {
      setError(e?.message ?? tp("errorCreate"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-primary">{tp("title")}</h2>
          <span className="rounded border border-default bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">
            {permissions.length}
          </span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-default bg-surface-1 px-2.5 py-1 text-[10px] font-semibold text-tertiary transition-colors hover:border-strong hover:text-secondary"
          >
            <Plus className="h-3 w-3" />
            {tp("newPermission")}
          </button>
        )}
      </div>

      {permissions.length === 0 && !showForm ? (
        <div className="rounded-lg border border-default bg-surface-1 px-4 py-8 text-center">
          <Key className="mx-auto mb-2 h-6 w-6 text-muted" />
          <p className="text-xs text-muted italic">{tp("empty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-default">
          {permissions.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-x-4 border-b border-subtle bg-black/20 px-4 py-2">
              {[tp("colKey"), tp("colName"), tp("colDescription")].map((h) => (
                <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-muted">{h}</span>
              ))}
            </div>
          )}
          {permissions.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_1fr_2fr] items-center gap-x-4 border-b border-subtle px-4 py-2.5 last:border-0 hover:bg-surface-1"
            >
              <span className="font-mono text-[11px] text-accent/80">{p.key}</span>
              <span className="text-[11px] text-secondary">{p.name}</span>
              <span className="truncate text-[11px] text-muted">
                {p.description ?? <span className="italic text-muted">—</span>}
              </span>
            </div>
          ))}

          {/* Inline create form */}
          {showForm && (
            <div className="border-t border-subtle bg-surface-1 px-4 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-muted">{tp("formTitle")}</p>
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-2 mb-2">
                <input
                  type="text"
                  placeholder={tp("keyPlaceholder")}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 font-mono text-[10px] text-tertiary placeholder:text-muted outline-none focus:border-sky-500/40"
                />
                <input
                  type="text"
                  placeholder={tp("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-secondary placeholder:text-muted outline-none focus:border-sky-500/40"
                />
                <input
                  type="text"
                  placeholder={tp("descPlaceholder")}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[11px] text-tertiary placeholder:text-muted outline-none focus:border-sky-500/40"
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
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tp("creating")}</> : <>{tp("create")}</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); setKey(""); setName(""); setDesc(""); }}
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
