"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { GitBranch, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { apiCall, apiPost } from "@/lib/api/client";
import AdminWorkflowSetupStudio from "./AdminWorkflowSetupStudio";
import {
  PremiumHeader,
  SectionPanel,
  SectionLabel as PatternSectionLabel,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";

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

// ── Stage color scheme ─────────────────────────────────────────────────────

function stageColors(key: string): { fill: string; border: string; text: string } {
  if (/paid|complete/.test(key))
    return { fill: "var(--color-emerald-500)", border: "var(--color-emerald-500)", text: "var(--color-emerald-300)" };
  if (/^approved$/.test(key))
    return { fill: "var(--color-emerald-500)", border: "var(--color-emerald-500)", text: "var(--color-emerald-300)" };
  if (/reject/.test(key))
    return { fill: "var(--color-rose-500)", border: "var(--color-rose-500)", text: "var(--color-rose-300)" };
  if (/accounting/.test(key))
    return { fill: "var(--color-violet-500)", border: "var(--color-violet-500)", text: "var(--color-violet-300)" };
  if (/manager/.test(key))
    return { fill: "var(--color-amber-500)", border: "var(--color-amber-500)", text: "var(--color-amber-300)" };
  if (/submit/.test(key))
    return { fill: "var(--color-blue-400)", border: "var(--color-blue-400)", text: "var(--color-blue-300)" };
  return { fill: "var(--color-surface-2)", border: "var(--color-default)", text: "var(--color-secondary)" };
}

// ── Presets ────────────────────────────────────────────────────────────────

const PRESETS = [
  {
    key: "simple",
    label: "Simple",
    desc: "Draft → Submit → Approve → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "approved", stage_name: "Approved", stage_order: 3, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 4, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "approved", action_key: "approve", required_permission_key: "approve_expense" },
      { from_stage_key: "approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
  {
    key: "two_tier",
    label: "Two-tier",
    desc: "Draft → Submit → Manager → Accounting → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "manager_approved", stage_name: "Manager Approved", stage_order: 3, is_terminal: false },
      { stage_key: "accounting_approved", stage_name: "Accounting Approved", stage_order: 4, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 5, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "manager_approved", action_key: "manager_approve", required_permission_key: "manager_approve_expense" },
      { from_stage_key: "manager_approved", to_stage_key: "accounting_approved", action_key: "accounting_approve", required_permission_key: "accounting_approve_expense" },
      { from_stage_key: "accounting_approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
  {
    key: "auto_small",
    label: "Auto-approve small",
    desc: "Draft → Submit → Auto Approved → Paid",
    stages: [
      { stage_key: "draft", stage_name: "Draft", stage_order: 1, is_terminal: false },
      { stage_key: "submitted", stage_name: "Submitted", stage_order: 2, is_terminal: false },
      { stage_key: "auto_approved", stage_name: "Auto Approved", stage_order: 3, is_terminal: false },
      { stage_key: "paid", stage_name: "Paid", stage_order: 4, is_terminal: true },
    ],
    transitions: [
      { from_stage_key: "draft", to_stage_key: "submitted", action_key: "submit", required_permission_key: "submit_expense" },
      { from_stage_key: "submitted", to_stage_key: "auto_approved", action_key: "auto_approve", required_permission_key: "auto_approve_expense" },
      { from_stage_key: "auto_approved", to_stage_key: "paid", action_key: "mark_paid", required_permission_key: "mark_paid" },
    ],
  },
];

const NODE_W = 130;
const NODE_H = 32;
const H_GAP = 70;
const V_GAP = 50;

interface Props {
  companyId: number;
  workflowSetup?: any;
  companySetup?: any;
  expensePolicy?: any;
  accountingSetup?: any;
  approvalSetup?: any;
  onSaved?: (setup: any) => void;
  draftPatch?: Partial<any>;
}

export default function AdminWorkflowMapPanel({
  companyId,
  workflowSetup,
  companySetup,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  onSaved,
  draftPatch,
}: Props) {
  const t = useTranslations("admin.workflowMap");
  const tw = useTranslations("admin.workflowSetup");

  const [stages, setStages] = useState<Stage[]>([]);
  const [transitions, setTransitions] = useState<Transition[]>([]);
  const [selectedStage, setSelectedStage] = useState<Stage | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transition | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [workflowDraftPatch, setWorkflowDraftPatch] = useState<Partial<any> | undefined>(draftPatch);

  function loadStages() {
    setLoading(true);
    apiCall(`/company/${companyId}/workflow/stages?module_key=expenses`)
      .then((d: any) => { setStages(d.stages ?? d); setLoading(false); })
      .catch(() => setLoading(false));
  }

  function loadTransitions() {
    apiCall(`/company/${companyId}/workflow/transitions?module_key=expenses`)
      .then((d: any) => setTransitions(d.transitions ?? d))
      .catch(() => {});
  }

  useEffect(() => { loadStages(); loadTransitions(); }, [companyId]);

  async function applyPreset(preset: typeof PRESETS[number]) {
    setApplying(preset.key);
    try {
      await apiPost(`/company/${companyId}/workflow/stages/bulk`, {
        module_key: "expenses",
        stages: preset.stages,
      });
      await apiPost(`/company/${companyId}/workflow/transitions/bulk`, {
        module_key: "expenses",
        transitions: preset.transitions,
      });
      loadStages();
      loadTransitions();
    } catch {
    } finally {
      setApplying(null);
    }
  }

  function onWorkflowSaved(setup: any) {
    onSaved?.(setup);
  }

  // ── Layout computation ──────────────────────────────────────────────────
  const nodePositions = stages
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((stage, i) => ({
      stage,
      x: 24 + (i % 5) * (NODE_W + H_GAP),
      y: 24 + Math.floor(i / 5) * (NODE_H + V_GAP),
    }));

  function edgePath(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): string {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }

  const canvasW = Math.max(600, nodePositions.length > 0
    ? nodePositions[nodePositions.length - 1].x + NODE_W + 24
    : 600);
  const canvasH = Math.max(120, nodePositions.length > 0
    ? nodePositions[nodePositions.length - 1].y + NODE_H + 24
    : 120);

  return (
    <div className="space-y-4">
      <PremiumHeader
        icon={<GitBranch className="h-4 w-4" />}
        title={t("canvasTitle")}
        section="approval-workflow"
        metrics={[
          { label: t("stagesUnit"), value: stages.length },
          { label: t("transitionsUnit"), value: transitions.length },
        ]}
        action={
          <button
            type="button"
            onClick={() => { loadStages(); loadTransitions(); }}
            className="flex items-center gap-1.5 rounded-md border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-medium text-secondary transition-all hover:border-strong hover:bg-surface-3"
          >
            <RefreshCw className="h-3 w-3" />
            {t("refresh")}
          </button>
        }
      />

      {/* Presets strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <PatternSectionLabel>Presets</PatternSectionLabel>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            disabled={applying !== null}
            onClick={() => applyPreset(p)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1 text-[9px] font-medium transition-all ${
              applying === p.key
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-default bg-surface-2 text-secondary hover:border-strong hover:bg-surface-3"
            } disabled:opacity-40`}
          >
            {applying === p.key && <Loader2 className="h-3 w-3 animate-spin" />}
            <span>{p.label}</span>
            <span className="text-muted">{p.desc}</span>
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div className="rounded-md border border-default bg-surface-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : stages.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-[10px] text-muted">{t("noStages")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <svg
              width={canvasW}
              height={canvasH}
              viewBox={`0 0 ${canvasW} ${canvasH}`}
              className="block"
            >
              <defs>
                <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-tertiary)" />
                </marker>
                <marker id="wf-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-accent)" />
                </marker>
              </defs>

              {transitions.map((tx) => {
                const fromNP = nodePositions.find((n) => n.stage.stage_key === tx.from_stage_key);
                const toNP = nodePositions.find((n) => n.stage.stage_key === tx.to_stage_key);
                if (!fromNP || !toNP) return null;
                const isSel = selectedTx?.id === tx.id;
                const midX = (fromNP.x + NODE_W + toNP.x) / 2;
                const midY = (fromNP.y + NODE_H / 2 + toNP.y + NODE_H / 2) / 2;
                return (
                  <g key={tx.id} onClick={() => { setSelectedTx(tx); setSelectedStage(null); }} style={{ cursor: "pointer" }}>
                    <path d={edgePath(fromNP, toNP)} fill="none" stroke="transparent" strokeWidth={10} />
                    <path
                      d={edgePath(fromNP, toNP)} fill="none"
                      stroke={isSel ? "var(--color-accent)" : "var(--color-tertiary)"}
                      strokeWidth={isSel ? 2 : 1.5}
                      markerEnd={isSel ? "url(#wf-arrow-sel)" : "url(#wf-arrow)"}
                    />
                    <text x={midX} y={midY - 7} textAnchor="middle"
                      style={{ fontSize: "9px", fill: "var(--color-tertiary)", fontFamily: "monospace" }}>
                      {tx.action_key}
                    </text>
                  </g>
                );
              })}

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
                      stroke={isSel ? "var(--color-accent)" : border}
                      strokeWidth={isSel ? 2 : 1} />
                    <text x={x + NODE_W / 2} y={y + NODE_H / 2 + 1}
                      textAnchor="middle" dominantBaseline="middle"
                      style={{ fontSize: "10px", fontWeight: 600, fill: text, fontFamily: "system-ui,sans-serif" }}>
                      {label}
                    </text>
                    {stage.is_terminal && (
                      <circle cx={x + NODE_W - 8} cy={y + 8} r={3.5} fill="var(--color-emerald-500)" />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {/* Inspector strip */}
        {(selectedStage || selectedTx) && (
          <div className="border-t border-subtle bg-surface-2/50 px-4 py-3">
            {selectedStage && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("inspStage")}</p>
                  <p className="mt-1 text-[12px] font-semibold text-secondary">{selectedStage.stage_name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-warning/60">{selectedStage.stage_key}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {t("orderLabel")}: {selectedStage.stage_order} ·{" "}
                    {selectedStage.is_terminal ? t("terminal") : t("notTerminal")}
                  </p>
                </div>
                <button onClick={() => setSelectedStage(null)} className="shrink-0 text-[11px] text-muted hover:text-secondary">✕</button>
              </div>
            )}
            {selectedTx && (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("inspTransition")}</p>
                  <p className="mt-1 font-mono text-[11px] text-warning/70">
                    {selectedTx.from_stage_key} → {selectedTx.to_stage_key}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {t("actionLabel")}: <span className="font-mono text-accent/70">{selectedTx.action_key}</span>
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {t("permLabel")}: <span className="font-mono text-accent/60">{selectedTx.required_permission_key}</span>
                  </p>
                </div>
                <button onClick={() => setSelectedTx(null)} className="shrink-0 text-[11px] text-muted hover:text-secondary">✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Workflow setup form */}
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
