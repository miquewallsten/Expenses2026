"use client";

import { Plus, GitBranch, ArrowRight, CheckCircle2 } from "lucide-react";

interface Stage {
  id: number;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  is_terminal: boolean;
  module_key: string;
  company_id: number;
  created_at: string;
}

interface Transition {
  id: number;
  from_stage_key: string;
  to_stage_key: string;
  action_key: string;
  required_permission_key: string;
  module_key: string;
  company_id: number;
  created_at: string;
}

interface Props {
  stages: Stage[];
  transitions: Transition[];
}

export default function AdminWorkflowPanel({ stages, transitions }: Props) {
  const sortedStages = [...stages].sort((a, b) => a.stage_order - b.stage_order);

  return (
    <div className="max-w-2xl space-y-8">

      {/* ── Section A: Stages ──────────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-white/25" />
            <h2 className="text-sm font-semibold text-white">Stages</h2>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
              {stages.length}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
          >
            <Plus className="h-3 w-3" />
            Add Stage
          </button>
        </div>

        {sortedStages.length === 0 ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
            <GitBranch className="mx-auto mb-2 h-6 w-6 text-white/10" />
            <p className="text-xs italic text-white/20">No stages defined.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {sortedStages.map((stage) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 hover:bg-white/[0.03]"
              >
                {/* Order badge */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-white/[0.08] bg-black/20 font-mono text-[10px] text-white/30">
                  {stage.stage_order}
                </span>

                {/* Stage info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-white/75">{stage.stage_name}</span>
                    {stage.is_terminal && (
                      <span className="inline-flex items-center gap-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-400">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Terminal
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-amber-300/60">{stage.stage_key}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section B: Transitions ─────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-white/25" />
            <h2 className="text-sm font-semibold text-white">Transitions</h2>
            <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
              {transitions.length}
            </span>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded border border-white/[0.09] bg-white/[0.03] px-2.5 py-1 text-[10px] font-semibold text-white/40 transition-colors hover:border-white/20 hover:text-white/70"
          >
            <Plus className="h-3 w-3" />
            Add Transition
          </button>
        </div>

        {transitions.length === 0 ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-8 text-center">
            <ArrowRight className="mx-auto mb-2 h-6 w-6 text-white/10" />
            <p className="text-xs italic text-white/20">No transitions defined.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-white/[0.07]">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_auto_1fr_1fr] gap-x-3 border-b border-white/[0.05] bg-black/20 px-4 py-2">
              {["From", "", "To / Action", "Requires"].map((h, i) => (
                <span key={i} className="text-[9px] font-bold uppercase tracking-widest text-white/22">
                  {h}
                </span>
              ))}
            </div>

            {transitions.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[1fr_auto_1fr_1fr] items-center gap-x-3 border-b border-white/[0.04] px-4 py-3 last:border-0 hover:bg-white/[0.02]"
              >
                <span className="font-mono text-[11px] text-amber-300/80">{t.from_stage_key}</span>
                <ArrowRight className="h-3 w-3 shrink-0 text-white/20" />
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-amber-300/80">{t.to_stage_key}</p>
                  <p className="truncate font-mono text-[10px] text-indigo-300/60">{t.action_key}</p>
                </div>
                <span className="truncate font-mono text-[10px] text-sky-300/60">
                  {t.required_permission_key}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}
