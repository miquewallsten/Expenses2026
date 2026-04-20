"use client";

import { useState } from "react";
import { Plus, Key, Loader2 } from "lucide-react";

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
  const [showForm, setShowForm] = useState(false);
  const [key,      setKey]      = useState("");
  const [name,     setName]     = useState("");
  const [desc,     setDesc]     = useState("");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  const handleCreate = async () => {
    if (!key.trim() || !name.trim()) { setError("Key and name are required."); return; }
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
      setError(e?.message ?? "Create failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white">Permissions</h2>
          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
            {permissions.length}
          </span>
        </div>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
          >
            <Plus className="h-3 w-3" />
            New Permission
          </button>
        )}
      </div>

      {permissions.length === 0 && !showForm ? (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
          <Key className="mx-auto mb-2 h-6 w-6 text-white/10" />
          <p className="text-xs text-white/20 italic">No permissions defined yet.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07]">
          {permissions.length > 0 && (
            <div className="grid grid-cols-[1fr_1fr_2fr] gap-x-4 border-b border-white/[0.05] bg-black/20 px-4 py-2">
              {["Key", "Name", "Description"].map((h) => (
                <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-white/22">{h}</span>
              ))}
            </div>
          )}
          {permissions.map((p) => (
            <div
              key={p.id}
              className="grid grid-cols-[1fr_1fr_2fr] items-center gap-x-4 border-b border-white/[0.04] px-4 py-2.5 last:border-0 hover:bg-white/[0.02]"
            >
              <span className="font-mono text-[11px] text-sky-300/80">{p.key}</span>
              <span className="text-[11px] text-white/60">{p.name}</span>
              <span className="truncate text-[11px] text-white/35">
                {p.description ?? <span className="italic text-white/20">—</span>}
              </span>
            </div>
          ))}

          {/* Inline create form */}
          {showForm && (
            <div className="border-t border-white/[0.06] bg-white/[0.02] px-4 py-3">
              <p className="mb-2 text-[9px] font-bold uppercase tracking-widest text-white/22">New permission</p>
              <div className="grid grid-cols-[1fr_1fr_2fr] gap-2 mb-2">
                <input
                  type="text"
                  placeholder="key (snake_case)"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 font-mono text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-sky-500/40"
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/70 placeholder:text-white/20 outline-none focus:border-sky-500/40"
                />
                <input
                  type="text"
                  placeholder="Description (optional)"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  className="rounded border border-white/[0.08] bg-zinc-900 px-2 py-1.5 text-[11px] text-white/55 placeholder:text-white/20 outline-none focus:border-sky-500/40"
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
                  {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> Creating…</> : <>Create</>}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setError(null); setKey(""); setName(""); setDesc(""); }}
                  className="text-[10px] text-white/30 hover:text-white/55"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
