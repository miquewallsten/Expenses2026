"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  CheckCircle2, AlertTriangle, Circle, Building2, FileText,
  Calculator, GitBranch, Puzzle, Sparkles, Lock, Shield,
  ChevronRight, Loader2, Zap, ScrollText,
  ToggleLeft, Eye, PenLine, Check, Settings, MessageSquare,
} from "lucide-react";
import { apiCall } from "@/lib/api/client";
import { getPortalConfigConflicts } from "@/lib/portal-config-conflicts";
import type { PortalConfigConflict } from "@/types/portal";
import { PremiumHeader, SectionPanel, Row } from "@/components/admin/shared/AdminPatterns";

type SetupSection = "Company Setup" | "Rules" | "Workflow";
type CardStatus = "ok" | "warn" | "unconfigured";

interface HealthData {
  readiness: { ok: boolean; blockers: { module: string; message: string; severity: string; wizard_step: string | null }[]; warnings: { module: string; message: string; severity: string; wizard_step: string | null }[] };
  insights: { id: number; kind: string; severity: string; title: string; body: string; suggested_prompt: string | null; created_at: string | null }[];
  insights_open_count: number;
  activity: { agent_turns_24h: number; agent_errors_24h: number; active_users: number; total_users: number };
}

interface AccountingConfig {
  accounting_setup: Record<string, any>;
  categories_count: number;
  rules_count: number;
  vendors_count: number;
  health_score: number | null;
  period_status: string | null;
  configured_by?: Record<string, string>;
  setup_mode?: string;
}

interface RulesData {
  automation: any[];
  validation: any[];
}

const SECTION_CONFLICT_CODES: Record<SetupSection, string[]> = {
  "Company Setup": [
    "MANAGER_FLOW_NO_MANAGERS", "MANAGER_WORKFLOW_NO_MANAGERS",
    "REQUIRE_MANAGER_ALL_NO_MANAGERS", "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
    "MULTI_COUNTRY_INTL_DISABLED",
  ],
  "Rules": [
    "INTL_ESCALATION_INTL_DISABLED", "INTL_ROUTING_INTL_DISABLED",
    "PROJECT_REQUIRED_NOT_IN_DIMS", "CLIENT_REQUIRED_NOT_IN_DIMS",
  ],

  "Workflow": [
    "MANAGER_FLOW_NO_MANAGERS", "REQUIRE_MANAGER_ALL_NO_MANAGERS",
    "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS", "ESCALATE_MISSING_DOCS_NO_MANAGERS",
    "MANAGER_WORKFLOW_NO_MANAGERS", "ROUTE_POLICY_FAILURES_NO_MANAGERS",
    "ROUTE_MISSING_DOCS_NO_MANAGERS", "INTL_ROUTING_INTL_DISABLED",
  ],
};

const ADDONS: { key: string; flag: string; i18nKey: string; premium: boolean }[] = [
  { key: "archive", flag: "archive_module_enabled", i18nKey: "archive", premium: false },
  { key: "time_allocation", flag: "time_allocation_module_enabled", i18nKey: "timeAllocation", premium: false },
  { key: "purchase_requests", flag: "purchase_requests_module_enabled", i18nKey: "purchaseRequests", premium: false },
  { key: "amex_reconciliation", flag: "amex_reconciliation_module_enabled", i18nKey: "amexReconciliation", premium: false },
  { key: "subcontractor", flag: "subcontractor_module_enabled", i18nKey: "subcontractor", premium: true },
];

function cardStatus(data: unknown, savedMarker: unknown, conflictCodes: PortalConfigConflict[], sectionCodes: string[]): CardStatus {
  if (!data || savedMarker == null || savedMarker === "") return "unconfigured";
  if (sectionCodes.some((c) => conflictCodes.some(cf => cf.code === c))) return "warn";
  return "ok";
}

function severityDot(severity: string) {
  const cls = severity === "critical" ? "text-error" : severity === "warning" ? "text-warning" : "text-muted";
  return <Circle className={`h-2 w-2 ${cls} fill-current`} />;
}

// ── Config Checklist Item ──────────────────────────────────────────────────

function ConfigItem({ status, label, detail, onClick }: {
  status: CardStatus; label: string; detail?: string; onClick: () => void;
}) {
  const statusIcon = status === "ok"
    ? <Check className="h-3.5 w-3.5 text-success" />
    : status === "warn"
      ? <AlertTriangle className="h-3.5 w-3.5 text-warning" />
      : <Circle className="h-3.5 w-3.5 text-muted" />;
  const statusText = status === "ok" ? "Configurado" : status === "warn" ? "Requiere atención" : "Sin configurar";
  const statusColor = status === "ok" ? "text-success" : status === "warn" ? "text-warning" : "text-muted";

  return (
    <button type="button" onClick={onClick} className="group flex items-center gap-3 w-full rounded-md border border-default px-3 py-2.5 text-left transition-all hover:border-strong hover:bg-surface-1/50">
      <div className="shrink-0">{statusIcon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold text-primary">{label}</p>
        {detail && <p className="text-[9px] text-muted line-clamp-1">{detail}</p>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-medium ${statusColor}`}>{statusText}</span>
        <ChevronRight className="h-3 w-3 text-muted group-hover:text-secondary transition-colors" />
      </div>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  portalConfig: Record<string, unknown> | null;
  companySetup: Record<string, unknown>;
  expensePolicy: Record<string, unknown>;
  accountingSetup: Record<string, unknown>;
  approvalSetup: Record<string, unknown>;
  workflowSetup: Record<string, unknown>;
  companyId: number | null;
  onNavigate: (section: string) => void;
}

export default function AdminConfigOverview({
  portalConfig, companySetup, expensePolicy, accountingSetup, approvalSetup, workflowSetup, companyId, onNavigate,
}: Props) {
  const t = useTranslations("admin.overview");

  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [rules, setRules] = useState<RulesData | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [acctConfig, setAcctConfig] = useState<AccountingConfig | null>(null);

  const fetchHealth = useCallback(() => {
    if (!companyId) return;
    setHealthLoading(true);
    apiCall<HealthData>(`/admin/dashboard/${companyId}/health`)
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setHealthLoading(false));
  }, [companyId]);

  const fetchRules = useCallback(() => {
    setRulesLoading(true);
    apiCall<RulesData>(`/accounting/intelligence/rules`)
      .then(setRules)
      .catch(() => setRules(null))
      .finally(() => setRulesLoading(false));
  }, []);

  const fetchAcctConfig = useCallback(() => {
    if (!companyId) return;
    apiCall<{ accounting_setup: Record<string, any> }>(`/admin/accounting-setup/${companyId}`)
      .then((res) => {
        const ac = res.accounting_setup ?? {};
        setAcctConfig({
          accounting_setup: ac,
          categories_count: ac.categories_count ?? 0,
          rules_count: ac.rules_count ?? 0,
          vendors_count: ac.vendors_count ?? 0,
          health_score: ac.health_score ?? null,
          period_status: ac.period_status ?? null,
          configured_by: ac.configured_by ?? {},
          setup_mode: ac.setup_mode ?? "setup",
        });
      })
      .catch(() => setAcctConfig(null));
  }, [companyId]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);
  useEffect(() => { fetchRules(); }, [fetchRules]);
  useEffect(() => { fetchAcctConfig(); }, [fetchAcctConfig]);

  const cs = companySetup ?? {};
  const ep = expensePolicy ?? {};
  const as = accountingSetup ?? {};
  const ws = workflowSetup ?? {};
  const conflicts = getPortalConfigConflicts(portalConfig);
  const readinessBlockers = health?.readiness?.blockers ?? [];

  const sections = useMemo(() => {
    const csStatus = cardStatus(cs, cs?.id ?? cs?.name, conflicts, SECTION_CONFLICT_CODES["Company Setup"]);
    const epStatus = cardStatus(ep, ep?.id ?? ep?.limit_daily, conflicts, SECTION_CONFLICT_CODES["Rules"]);
    const wsStatus = cardStatus(ws, ws?.id, conflicts, SECTION_CONFLICT_CODES["Workflow"]);

    const csDetail = csStatus === "ok"
      ? `${cs?.name ?? "Empresa"} · ${cs?.country ?? "MX"}`
      : csStatus === "warn" ? "Conflictos detectados" : "Sin configurar";
    const epDetail = epStatus === "ok"
      ? `Límite diario: ${ep?.limit_daily ? `MXN ${ep.limit_daily}` : "Sin límite"}`
      : epStatus === "warn" ? "Requiere revisión" : "Sin política definida";
    const wsDetail = wsStatus === "ok"
      ? `${ws?.approval_mode ?? "Manual"}${ws?.escalate_intl ? " + Internacional" : ""}`
      : wsStatus === "warn" ? "Flujo incompleto" : "Sin flujo definido";

    return [
      { key: "Company Setup" as SetupSection, label: t("sectionCompanySetup"), status: csStatus, detail: csDetail },
      { key: "Rules" as SetupSection, label: t("sectionExpensePolicy"), status: epStatus, detail: epDetail },
      { key: "Workflow" as SetupSection, label: t("sectionWorkflow"), status: wsStatus, detail: wsDetail },
    ];
  }, [cs, ep, as, ws, conflicts, t]);

  const hasBlockers = readinessBlockers.length > 0;
  const allConfigured = sections.every(s => s.status === "ok");
  const installedCount = ADDONS.filter((a) => !a.premium && !!(cs as any)[a.flag]).length;

  return (
    <div className="space-y-5">

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1 — CONFIGURATION SNAPSHOT
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionPanel>
        <PremiumHeader
          icon={<Settings className="h-5 w-5" />}
          title={t("commandCenter")}
          subtitle={allConfigured ? t("systemReady") : t("systemNotReady")}
          section="overview"
          action={
            hasBlockers ? (
              <button
                type="button"
                onClick={() => {
                  const target = readinessBlockers[0]?.wizard_step || "Onboarding";
                  onNavigate(target as any);
                }}
                className="flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning/5 px-3 py-1.5 text-[10px] font-semibold text-warning transition-all hover:border-warning/30 hover:bg-warning/10"
              >
                {t("fixSetup")} →
              </button>
            ) : undefined
          }
        />

        <div className="px-4 pb-4 pt-3 space-y-3">
          {/* System health status bar */}
          <div className="flex items-center gap-2 rounded-md border border-default bg-surface-1 px-3 py-2">
            {healthLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" />
            ) : health?.readiness?.ok ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-warning" />
            )}
            <span className="text-[10px] font-medium text-secondary">
              {healthLoading ? "Verificando…" : health?.readiness?.ok ? "Sistema operativo" : "Sistema requiere atención"}
            </span>
            {health && health.insights_open_count > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-accent/20 bg-accent/5 px-2 py-0.5 text-[8px] font-semibold text-accent">
                <Sparkles className="h-2.5 w-2.5" />
                {health.insights_open_count} insights
              </span>
            )}
          </div>

          {/* Configuration checklist */}
          <div className="space-y-1.5">
            {sections.map((s) => (
              <ConfigItem key={s.key} status={s.status} label={s.label} detail={s.detail} onClick={() => onNavigate(s.key)} />
            ))}
          </div>

          {/* Blockers */}
          {hasBlockers && (
            <div className="rounded-md border border-warning/15 bg-warning/[0.03]">
              <div className="flex items-center gap-2 border-b border-subtle/50 px-3 py-1.5">
                <AlertTriangle className="h-3 w-3 text-warning" />
                <span className="text-[10px] font-semibold text-warning/80">{t("blockersTitle")}</span>
                <span className="ml-auto text-[9px] font-mono text-warning/60">{readinessBlockers.length}</span>
              </div>
              {readinessBlockers.slice(0, 5).map((b, i) => (
                <div key={i} className={`flex items-center justify-between px-3 py-1.5 ${i < Math.min(readinessBlockers.length, 5) - 1 ? "border-b border-subtle/20" : ""}`}>
                  <span className="text-[9px] text-secondary">{b.message}</span>
                  <span className="text-[8px] font-mono text-muted">{b.module}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2 — AGENT INSIGHTS (config-relevant only)
          ═══════════════════════════════════════════════════════════════════════ */}
      {health && health.insights.length > 0 && (
        <SectionPanel>
          <PremiumHeader
            icon={<Zap className="h-5 w-5" />}
            title={t("insightsTitle")}
            subtitle={`${health.insights_open_count} insights de configuración`}
            section="overview"
          />
          <div className="px-4 pb-4 pt-2">
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {health.insights.slice(0, 6).map((ins) => (
                <div key={ins.id} className="flex items-start gap-2.5 rounded-md border border-default px-3 py-2 hover:bg-surface-1/50 transition-colors">
                  <div className="mt-0.5">{severityDot(ins.severity)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-primary truncate">{ins.title}</p>
                    <p className="text-[9px] text-muted line-clamp-2">{ins.body}</p>
                  </div>
                  {ins.suggested_prompt && (
                    <button type="button" className="shrink-0 rounded border border-accent/20 bg-accent/5 px-2 py-0.5 text-[8px] font-semibold text-accent transition-colors hover:bg-accent/10" title={ins.suggested_prompt}>
                      <MessageSquare className="inline h-2.5 w-2.5 mr-0.5" />
                      {t("askCopilot")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </SectionPanel>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3 — POLICIES & RULES
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionPanel>
        <PremiumHeader
          icon={<ScrollText className="h-5 w-5" />}
          title={t("policiesAndRules")}
          subtitle={rules ? `${rules.validation.length + rules.automation.length} reglas activas` : undefined}
          section="overview"
          action={
            <button type="button" onClick={() => onNavigate("Rules")} className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/10 hover:border-accent/30">
              <PenLine className="h-3 w-3" />
              Configurar
            </button>
          }
        />
        <div className="px-4 pb-4 pt-2">
          {rulesLoading && (
            <div className="flex items-center justify-center py-4"><Loader2 className="h-3 w-3 animate-spin text-muted" /></div>
          )}
          {!rulesLoading && rules && rules.validation.length === 0 && rules.automation.length === 0 && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ScrollText className="h-8 w-8 text-muted/30 mb-2" />
              <p className="text-[11px] font-medium text-secondary">{t("noRulesYet")}</p>
              <p className="text-[9px] text-muted mt-1">{t("noRulesHint")}</p>
              <button type="button" onClick={() => onNavigate("Rules")} className="mt-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/10">
                Crear primera regla →
              </button>
            </div>
          )}
          {rules && rules.validation.length > 0 && (
            <div className="space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{t("validationPolicies")}</p>
              {rules.validation.slice(0, 4).map((p: any, i: number) => (
                <div key={`v-${i}`} className="flex items-center gap-2 rounded-md border border-default px-3 py-1.5">
                  <div className="shrink-0">
                    {p.severity === "block" ? <Shield className="h-3 w-3 text-error" /> : <AlertTriangle className="h-3 w-3 text-warning" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-secondary truncate">{p.name}</p>
                    {p.source_text && <p className="text-[8px] text-muted line-clamp-1">{p.source_text}</p>}
                  </div>
                  <span className={`shrink-0 text-[8px] font-bold uppercase ${p.is_active || p.is_active === undefined ? "text-success" : "text-muted/40"}`}>
                    {p.is_active || p.is_active === undefined ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          )}
          {rules && rules.automation.length > 0 && (
            <div className="space-y-1 mt-3">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{t("automationRules")}</p>
              {rules.automation.slice(0, 4).map((r: any, i: number) => (
                <div key={`a-${i}`} className="flex items-center gap-2 rounded-md border border-default px-3 py-1.5">
                  <ToggleLeft className="shrink-0 h-3 w-3 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-secondary truncate">{r.name}</p>
                    <p className="text-[8px] text-muted">{r.trigger}</p>
                  </div>
                  <span className={`shrink-0 text-[8px] font-bold uppercase ${r.is_active ? "text-success" : "text-muted/40"}`}>
                    {r.is_active ? "ON" : "OFF"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </SectionPanel>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4 — ACCOUNTING VISIBILITY
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionPanel>
        <PremiumHeader
          icon={<Calculator className="h-5 w-5" />}
          title={t("accountingConfigsTitle")}
          subtitle={t("accountingConfigsSubtitle")}
          section="accounting-setup"
          action={
            <button type="button" onClick={() => onNavigate("accounting-setup")} className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/10 hover:border-accent/30">
              <Eye className="h-3 w-3" />
              Ver detalle
            </button>
          }
        />
        <div className="px-4 pb-4 pt-3 space-y-3">
          {acctConfig ? (() => {
            const ac = acctConfig.accounting_setup ?? {};
            const isLocked = (acctConfig.setup_mode ?? "setup") === "locked";
            return (
              <>
                {/* Setup mode indicator */}
                <div className="flex items-center gap-2 rounded-md border border-default bg-surface-1 px-3 py-2">
                  {isLocked ? <Lock className="h-3.5 w-3.5 text-warning" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  <span className="text-[10px] font-medium text-secondary">{isLocked ? "Configuración bloqueada" : "Configuración abierta"}</span>
                  <span className="ml-auto text-[9px] text-muted">{isLocked ? "Solo el admin puede desbloar" : "El contador puede modificar"}</span>
                </div>

                {/* Key fields */}
                <div className="rounded-md border border-default">
                  <Row label="Modo de revisión"><span className="text-[11px] text-primary">{ac.accounting_review_mode ?? "—"}</span></Row>
                  <Row label="Póliza requerida"><span className="text-[11px]">{ac.poliza_required ? "✓" : "—"}</span></Row>
                  <Row label="Código contable"><span className="text-[11px]">{ac.account_code_required ? "✓" : "—"}</span></Row>
                  <Row label="Centro de costos"><span className="text-[11px]">{ac.cost_center_required ? "✓" : "—"}</span></Row>
                  <Row label="Proyecto requerido"><span className="text-[11px]">{ac.project_required ? "✓" : "—"}</span></Row>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-default bg-surface-1 px-3 py-2 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted">Categorías</p>
                    <p className="text-base font-semibold text-primary mt-0.5">{acctConfig.categories_count || "—"}</p>
                  </div>
                  <div className="rounded-md border border-default bg-surface-1 px-3 py-2 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted">Reglas contables</p>
                    <p className="text-base font-semibold text-primary mt-0.5">{acctConfig.rules_count || "—"}</p>
                  </div>
                  <div className="rounded-md border border-default bg-surface-1 px-3 py-2 text-center">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-muted">Período</p>
                    <p className="text-base font-semibold text-primary mt-0.5">{acctConfig.period_status === "closed" ? "🔒 Cerrado" : acctConfig.period_status === "open" ? "Abierto" : "—"}</p>
                  </div>
                </div>

                {/* Admin notice */}
                <div className="rounded-md border border-default bg-surface-2/30 px-3 py-2">
                  <p className="text-[9px] text-muted">
                    <Lock className="inline h-3 w-3 mr-1" />
                    Los cambios en la configuración contable son realizados por el área de contabilidad.
                    Como administrador, tienes visibilidad completa pero las modificaciones las realiza el contador a través de su copiloto.
                  </p>
                </div>
              </>
            );
          })() : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Calculator className="h-8 w-8 text-muted/30 mb-2" />
              <p className="text-[11px] text-muted">Sin configuración contable</p>
              <button type="button" onClick={() => onNavigate("accounting-setup")} className="mt-3 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent hover:bg-accent/10">
                Configurar contabilidad →
              </button>
            </div>
          )}
        </div>
      </SectionPanel>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 5 — ADD-ONS
          ═══════════════════════════════════════════════════════════════════════ */}
      <SectionPanel>
        <PremiumHeader
          icon={<Puzzle className="h-5 w-5" />}
          title={t("addOnsTile.title")}
          subtitle={`${installedCount}/${ADDONS.length} módulos`}
          section="modules"
          action={
            <button type="button" onClick={() => onNavigate("Add-Ons")} className="flex items-center gap-1.5 rounded-md border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:bg-accent/10 hover:border-accent/30">
              Gestionar →
            </button>
          }
        />
        <div className="px-4 pb-4 pt-2">
          <div className="space-y-1.5">
            {ADDONS.map((a) => {
              const installed = !!(cs as any)[a.flag];
              return (
                <div key={a.key} className="flex items-center justify-between gap-3 rounded-md border border-default px-3 py-2 hover:bg-surface-1/50 transition-colors">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-secondary">{a.i18nKey}</span>
                      {a.premium && <span className="inline-flex items-center gap-1 rounded-full border border-warning/20 bg-warning/5 px-1.5 py-px text-[8px] font-bold uppercase tracking-widest text-warning/60"><Sparkles className="h-2 w-2" /> Premium</span>}
                    </div>
                  </div>
                  {installed ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-success/20 bg-success/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-success/80"><CheckCircle2 className="h-2.5 w-2.5" /> Activo</span>
                  ) : a.premium ? (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-full border border-warning/15 bg-warning/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-warning/60"><Lock className="h-2.5 w-2.5" /> Premium</span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-subtle bg-surface-1 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-muted">Disponible</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}
