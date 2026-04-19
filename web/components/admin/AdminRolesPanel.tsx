"use client";

import { Plus, ShieldCheck } from "lucide-react";

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
}

export default function AdminRolesPanel({ roles }: Props) {
  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white">Roles</h2>
          <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
            {roles.length}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
        >
          <Plus className="h-3 w-3" />
          New Role
        </button>
      </div>

      {/* Content */}
      {roles.length === 0 ? (
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
          <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-white/10" />
          <p className="text-xs text-white/20 italic">No roles configured.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/[0.07]">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_1fr_2fr_100px] gap-x-4 border-b border-white/[0.05] bg-black/20 px-4 py-2">
            {["Name", "Key", "Description", "Created"].map((h) => (
              <span key={h} className="text-[9px] font-bold uppercase tracking-widest text-white/22">
                {h}
              </span>
            ))}
          </div>

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
        </div>
      )}
    </div>
  );
}
