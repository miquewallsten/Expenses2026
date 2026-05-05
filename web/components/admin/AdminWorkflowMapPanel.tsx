"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { GitBranch } from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";
import AdminWorkflowSetupStudio from "./AdminWorkflowSetupStudio";

interface Stage {
  id: number;
  company_id: number;
  module_key: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  is_terminal: boolean;
  created_at: string;
}

interface Transition {
  id: number;
  company_id: number;
  module_key: string;
  from_stage_key: string;
  to_stage_key: string;
  action_key: string;
  required_permission_key: string;
  created_at: string;
}

type RightTab = "workflow";

// ── Stage color scheme ─────────────────────────────────────────────────────

function stageColors(key: string): { fill: string; border: string; text: string } {
  if (/paid|complete/.test(key))
    return { fill: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.4)", text: "#6ee7b7" };
  if (/^approved$/.test(key))
    return { fill: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.3)", text: "#6ee7b7" };
  if (/reject/.test(key))
    return { fill: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.35)", text: "#fca5a5" };
  if (/accounting/.test(key))
    return { fill: "rgba(139,92,246,0.10)", border: "rgba(139,92,246,0.40)", text: "#c4b5fd" };
  if (/manager/.test(key))
    return { fill: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", text: "#fcd34d" };
  if (/submit/.test(key))
    return { fill: "rgba(14,165,233,0.10)", border: "rgba(14,165,233,0.35)", text: "#7dd3fc" };
  return { fill: "rgba(255,255,255,0.03)", border: "rgba(255,255,255,0.15)", text: "rgba(255,255,255,0.60)" };
}

// ── Presets ────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    key: "simple",
    label: "Simple",
    desc: "Draft → Submit → Approve → Paid",
    stages: [
      { stage_key: "draft",     stage_name: "Draft",    stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "approved",  stage_name: "Approved",  stage_order: 3, is_terminal: false },
      { stage_key: "paid",      stage_name: "Paid",      stage_order: 4, is_terminal: true  },
    ],
    transitions: [
      { from_stage_key: "draft",      to_stage_key: "submitted", action_key: "submit",    required_permission_key: "submit_expense"   },
      { from_stage_key: "submitted",  to_stage_key: "approved",  action_key: "approve",   required_permission_key: "approve_expense"  },
      { from_stage_key: "approved",   to_stage_key: "paid",      action_key: "mark_paid", required_permission_key: "mark_paid"        },
    ],
  },
  {
    key: "two_tier",
    label: "Two-tier",
    desc: "Draft → Submit → Manager → Accounting → Paid",
    stages: [
      { stage_key: "draft",                stage_name: "Draft",                stage_order: 1, is_terminal: false },
      { stage_key: "submitted",            stage_name: "Submitted",            stage_order: 2, is_terminal: false },
      { stage_key: "manager_approved",     stage_name: "Manager Approved",     stage_order: 3, is_terminal: false },
      { stage_key: "accounting_approved",  stage_name: "Accounting Approved",  stage_order: 4, is_terminal: false },
      { stage_key: "paid",                 stage_name: "Paid",                 stage_order: 5, is_terminal: true  },
    ],
    transitions: [
      { from_stage_key: "draft",               to_stage_key: "submitted",           action_key: "submit",              required_permission_key: "submit_expense"             },
      { from_stage_key: "submitted",           to_stage_key: "manager_approved",    action_key: "manager_approve",     required_permission_key: "manager_approve_expense"    },
      { from_stage_key: "manager_approved",    to_stage_key: "accounting_approved", action_key: "accounting_approve",  required_permission_key: "accounting_approve_expense" },
      { from_stage_key: "accounting_approved", to_stage_key: "paid",                action_key: "mark_paid",           required_permission_key: "mark_paid"                  },
    ],
  },
  {
    key: "auto_small",
    label: "Auto-approve small",
    desc: "Draft → Submit → Auto Approved → Paid",
    stages: [
      { stage_key: "draft",          stage_name: "Draft",          stage_order: 1, is_terminal: false },
      { stage_key: "submitted",      stage_name: "Submitted",      stage_order: 2, is_terminal: false },
      { stage_key: "auto_approved",  stage_name: "Auto Approved",  stage_order: 3, is_terminal: false },
      { stage_key: "paid",           stage_name: "Paid",           stage_order: 4, is_terminal: true  },
    ],
    transitions: [
      { from_stage_key: "draft",         to_stage_key: "submitted",    action_key: "submit",      required_permission_key: "submit_expense"   },
      { from_stage_key: "submitted",     to_stage_key: "auto_approved", action_key: "auto_approve", required_permission_key: "system"           },
      { from_stage_key: "auto_approved", to_stage_key: "paid",          action_key: "mark_paid",    required_permission_key: "mark_paid"        },
    ],
  },
];

// ── Canvas layout constants ────────────────────────────────────────────────

const NODE_W = 120;
const NODE_H = 38;
const H_GAP = 56;
const CANVAS_H = 160;
const CANVAS_PAD = 20;

interface NodePos { stage: Stage; x: number; y: number }

function computeLayout(stages: Stage[], canvasWidth: number): NodePos[] {
  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  const total = sorted.length;
  if (total === 0) return [];
  const totalWidth = total * NODE_W + (total - 1) * H_GAP;
  const startX = Math.max(CANVAS_PAD, (canvasWidth - totalWidth) / 2);
  const cy = (CANVAS_H - NODE_H) / 2;
  return sorted.map((stage, i) => ({ stage, x: startX + i * (NODE_W + H_GAP), y: cy }));
}

function edgePath(from: NodePos, to: NodePos): string {
  const sx = from.x + NODE_W;
  const sy = from.y + NODE_H / 2;
  const tx = to.x;
  const ty = to.y + NODE_H / 2;
  const mx = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  approvalSetup?: any;
  workflowSetup: any;
  companySetup?: any;
  expensePolicy?: any;
  accountingSetup?: any;
  onWorkflowSaved: (s: any) => void;
  workflowDraftPatch?: Partial<any>;
  // Legacy props kept for call-site compatibility; no longer consumed.
  onApprovalSaved?: (s: any) => void;
  approvalDraftPatch?: Partial<any>;
  initialTab?: RightTab;
  onTabChange?: (tab: RightTab) => void;
}

export default function AdminWorkflowMapPanel({
  companyId,
  approvalSetup,
  workflowSetup,
  companySetup,
  expensePolicy,
  accountingSetup,
  onWorkflowSaved,
  workflowDraftPatch,
}: Props) {
  const tw = useTranslations("admin.workflowMap");
  const [stages, setStages]               = useState<Stage[]>([]);
  const [transitions, setTransitions]     = useState<Transition[]>([]);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [selectedTx, setSelectedTx]       = useState<Transition | null>(null);
  const [canvasWidth, setCanvasWidth]     = useState(700);
  const [applyingPreset, setApplyingPreset] = useState(false);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { loadGraph(); }, [companyId]);

  useEffect(() => {
    if (!canvasWrapRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setCanvasWidth(w);
    });
    obs.observe(canvasWrapRef.current);
    return () => obs.disconnect();
  }, []);

  async function loadGraph() {
    const [stagesData, transitionsData] = await Promise.all([
      apiCall<Stage[]>(`/workflows/stages?company_id=${companyId}&module_key=expenses`),
      apiCall<Transition[]>(`/workflows/transitions?company_id=${companyId}&module_key=expenses`),
    ]);
    setStages(stagesData);
    setTransitions(transitionsData);
  }

  async function applyPreset(preset: (typeof PRESETS)[0]) {
    setApplyingPreset(true);
    try {
      for (const s of preset.stages) {
        await apiPost("/workflows/stages", { ...s, company_id: companyId, module_key: "expenses" });
      }
      for (const t of preset.transitions) {
        await apiPost("/workflows/transitions", { ...t, company_id: companyId, module_key: "expenses" });
      }
      await loadGraph();
    } finally {
      setApplyingPreset(false);
    }
  }

  const nodePositions = computeLayout(stages, canvasWidth);
  const nodePosMap    = new Map(nodePositions.map((np) => [np.stage.stage_key, np]));
  const isEmpty       = stages.length === 0;

  return (
    <div className="flex flex-col gap-4">

      {/* ── SVG Canvas ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-lg border border-default bg-surface-0">

        {/* Canvas header */}
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3.5 w-3.5 text-muted" />
            <span className="text-[11px] font-semibold text-secondary">{tw("canvasTitle")}</span>
            {!isEmpty && (
              <span className="rounded border border-default bg-surface-2 px-1.5 py-0.5 font-mono text-[9px] text-muted">
                {stages.length} {tw("stagesUnit")} · {transitions.length} {tw("transitionsUnit")}
              </span>
            )}
          </div>
          {!isEmpty && (
            <button
              onClick={loadGraph}
              className="text-[9px] font-semibold text-muted hover:text-tertiary transition-colors"
            >
              {tw("refresh")}
            </button>
          )}
        </div>

        {isEmpty ? (
          /* ── Preset picker ── */
          <div className="px-6 py-8">
            <p className="mb-4 text-center text-[11px] text-muted">{tw("noStages")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => applyPreset(preset)}
                  disabled={applyingPreset}
                  className="flex flex-col items-start rounded border border-default bg-surface-1 px-4 py-3 text-left transition-colors hover:bg-accent-muted/30 hover:bg-accent-hover/[0.07] disabled:opacity-50"
                >
                  <span className="text-[11px] font-semibold text-secondary">{preset.label}</span>
                  <span className="mt-0.5 text-[10px] text-muted">{preset.desc}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── SVG graph ── */
          <div ref={canvasWrapRef} className="w-full overflow-x-auto">
            <svg width="100%" height={CANVAS_H + 8} style={{ display: "block" }}>
              <defs>
                <marker id="wf-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="rgba(255,255,255,0.22)" />
                </marker>
                <marker id="wf-arrow-sel" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L7,3 z" fill="rgba(99,102,241,0.8)" />
                </marker>
              </defs>

              {/* Edges */}
              {transitions.map((t) => {
                const fromNP = nodePosMap.get(t.from_stage_key);
                const toNP   = nodePosMap.get(t.to_stage_key);
                if (!fromNP || !toNP) return null;
                const isSel = selectedTx?.id === t.id;
                const midX  = (fromNP.x + NODE_W + toNP.x) / 2;
                const midY  = fromNP.y + NODE_H / 2;
                return (
                  <g key={t.id} onClick={() => { setSelectedTx(t); setSelectedStage(null); }} style={{ cursor: "pointer" }}>
                    {/* Hit area */}
                    <path d={edgePath(fromNP, toNP)} fill="none" stroke="transparent" strokeWidth={10} />
                    <path
                      d={edgePath(fromNP, toNP)} fill="none"
                      stroke={isSel ? "rgba(99,102,241,0.8)" : "rgba(255,255,255,0.20)"}
                      strokeWidth={isSel ? 2 : 1.5}
                      markerEnd={isSel ? "url(#wf-arrow-sel)" : "url(#wf-arrow)"}
                    />
                    <text x={midX} y={midY - 7} textAnchor="middle"
                      style={{ fontSize: "9px", fill: "rgba(255,255,255,0.22)", fontFamily: "monospace" }}>
                      {t.action_key}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {nodePositions.map(({ stage, x, y }) => {
                const { fill, border, text } = stageColors(stage.stage_key);
                const isSel = selectedStage?.id === stage.id;
                const label = stage.stage_name.length > 14 ? stage.stage_name.slice(0, 13) + "…" : stage.stage_name;
                return (
                  <g key={stage.id}
                    onClick={() => { setSelectedStage(stage); setSelectedTx(null); }}
                    style={{ cursor: "pointer" }}>
                    <rect x={x} y={y} width={NODE_W} height={NODE_H} rx={5}
                      fill={fill}
                      stroke={isSel ? "rgba(99,102,241,0.75)" : border}
                      strokeWidth={isSel ? 2 : 1} />
                    <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: "10px", fontWeight: 600, fill: text, fontFamily: "system-ui,sans-serif" }}>
                      {label}
                    </text>
                    {stage.is_terminal && (
                      <circle cx={x + NODE_W - 8} cy={y + 8} r={3.5} fill="rgba(16,185,129,0.65)" />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* ── Inspector strip ── */}
        {(selectedStage || selectedTx) && (
          <div className="border-t border-subtle bg-black/20 px-4 py-3">
            {selectedStage && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{tw("inspStage")}</p>
                  <p className="mt-1 text-[12px] font-semibold text-secondary">{selectedStage.stage_name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-warning/60">{selectedStage.stage_key}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {tw("orderLabel")}: {selectedStage.stage_order} ·{" "}
                    {selectedStage.is_terminal ? tw("terminal") : tw("notTerminal")}
                  </p>
                </div>
                <button onClick={() => setSelectedStage(null)} className="shrink-0 text-[11px] text-muted hover:text-secondary">✕</button>
              </div>
            )}
            {selectedTx && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{tw("inspTransition")}</p>
                  <p className="mt-1 font-mono text-[11px] text-warning/70">
                    {selectedTx.from_stage_key} → {selectedTx.to_stage_key}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {tw("actionLabel")}: <span className="font-mono text-accent/70">{selectedTx.action_key}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {tw("permLabel")}: <span className="font-mono text-accent/60">{selectedTx.required_permission_key}</span>
                  </p>
                </div>
                <button onClick={() => setSelectedTx(null)} className="shrink-0 text-[11px] text-muted hover:text-secondary">✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Workflow setup form ───────────────────────────────────────────── */}
      <div>
        <AdminWorkflowSetupStudio
          companyId={companyId}
          setup={workflowSetup ?? {}}
          companySetup={companySetup}
          expensePolicy={expensePolicy}
          accountingSetup={accountingSetup}
          approvalSetup={approvalSetup}
          onSaved={onWorkflowSaved}
          draftPatch={workflowDraftPatch}
        />
      </div>
    </div>
  );
}
