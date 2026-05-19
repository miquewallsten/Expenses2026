"use client";

import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { useTranslations } from "next-intl";
import { useUserContext } from "@/context/UserContext";
import { apiCall } from "@/lib/api/client";
import {
  Calculator, Cog, BookOpen, BarChart3, Sparkles, Users, Lock,
  Wand2, Settings, Eye, ShieldCheck, ChevronRight,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel as PatternSectionLabel,
  StatusBadge,
  EmptyState,
  inputClasses,
} from "@/components/admin/shared/AdminPatterns";

import { AlertTriangle, RefreshCw } from "lucide-react";
import AdminAccountingSetupStudio from "@/components/admin/AdminAccountingSetupStudio";

// Lazy-loaded heavy components
const AdminChartOfAccountsStudio = lazy(() => import("@/components/admin/AdminChartOfAccountsStudio"));
const AdminAutoCategorizePanel = lazy(() => import("@/components/admin/AdminAutoCategorizePanel"));
const AccountingReviewModule = lazy(() => import("@/modules/accounting-review/AccountingReviewModule"));

type AccountingView = "setup" | "chart-of-accounts" | "categorize" | "review" | "vendors" | "closing";

interface SectionDef {
  id: AccountingView;
  labelKey: string;
  descKey: string;
  icon: any;
  group: "setup" | "operations";
  requiresSetup?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: "setup", labelKey: "tabSetup", descKey: "tabSetupDesc", icon: Cog, group: "setup" },
  { id: "chart-of-accounts", labelKey: "tabCatalog", descKey: "tabCatalogDesc", icon: BookOpen, group: "setup" },
  { id: "categorize", labelKey: "tabCategorize", descKey: "tabCategorizeDesc", icon: Sparkles, group: "setup", requiresSetup: true },
  { id: "vendors", labelKey: "tabVendors", descKey: "tabVendorsDesc", icon: Users, group: "setup", requiresSetup: true },
  { id: "review", labelKey: "tabReview", descKey: "tabReviewDesc", icon: Calculator, group: "operations" },
  { id: "closing", labelKey: "tabClosing", descKey: "tabClosingDesc", icon: Lock, group: "operations", requiresSetup: true },
];

interface Props {
  companyId?: number;
  setup?: any;
  companySetup?: any;
  expensePolicy?: any;
  onSaved?: (s: any) => void;
  draftPatch?: any;
}

export default function AccountingModule({ companyId: propCompanyId, setup: propSetup, companySetup: propCompanySetup, expensePolicy: propExpensePolicy, onSaved, draftPatch }: Props) {
  const t = useTranslations("admin.accountingSetup");
  const tc = useTranslations("common");
  const { role, hasRole, hasPermission } = useUserContext();

  const [view, setView] = useState<AccountingView>("setup");
  const [networkError, setNetworkError] = useState<string | null>(null);
  const [health, setHealth] = useState<any>(null);
  const [fetchedCompanyId, setFetchedCompanyId] = useState<number | null>(null);
  const [accountingSetup, setAccountingSetup] = useState<any>(propSetup);

  // Resolve companyId: prop > context > fetch
  const companyId = propCompanyId ?? fetchedCompanyId ?? 0;

  // Self-fetch if no props provided (used by module registry)
  useEffect(() => {
    if (propCompanyId) return;
    (async () => {
      try {
        const session = JSON.parse(localStorage.getItem("opsflow_session") || "{}");
        const cid = session?.companyId;
        if (cid) { setFetchedCompanyId(Number(cid)); return; }
      } catch {}
    })();
  }, [propCompanyId]);

  useEffect(() => {
    if (!companyId || propSetup) return;
    apiCall(`/admin/accounting-setup/${companyId}`).then((d: any) => setAccountingSetup(d)).catch((e: any) => { setNetworkError(e?.message || "No se pudo conectar con el servidor."); });
  }, [companyId, propSetup]);
  const [closingPeriod, setClosingPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [checklist, setChecklist] = useState<any>(null);

  const loadHealth = useCallback(async () => {
    try { setHealth(await apiCall(`/accounting/intelligence/health`) as any); } catch {}
  }, []);

  const loadChecklist = useCallback(async () => {
    try { setChecklist(await apiCall(`/accounting/intelligence/pre-close-checklist?period=${closingPeriod}`) as any); } catch {}
  }, [closingPeriod]);

  useEffect(() => { loadHealth(); }, [loadHealth]);
  useEffect(() => { if (view === "closing") loadChecklist(); }, [view, loadChecklist]);
  useEffect(() => { if (propSetup) setAccountingSetup(propSetup); }, [propSetup]);

  const healthScore = health?.health_score;
  const setupMode = accountingSetup?.setup_mode ?? "setup";
  const isSetupLocked = setupMode === "locked";
  const isAdmin = role === "admin" || hasRole("admin");
  const configuredBy = accountingSetup?.configured_by ? 
    (typeof accountingSetup.configured_by === "string" ? JSON.parse(accountingSetup.configured_by) : accountingSetup.configured_by) : {};
  const lastConfiguredBy = accountingSetup?.last_configured_by;
  const lastConfiguredAt = accountingSetup?.last_configured_at;
  const accountantFieldCount = Object.values(configuredBy).filter((v: any) => v === "accountant").length;

  const setupSections = SECTIONS.filter((s) => s.group === "setup");
  const opsSections = SECTIONS.filter((s) => s.group === "operations");

  const handleSetupSaved = (updated: any) => {
    setAccountingSetup(updated);
    onSaved?.(updated);
  };

  const toggleSetupMode = async () => {
    const newMode = isSetupLocked ? "setup" : "locked";
    try {
      await apiCall(`/admin/accounting-setup/${companyId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...accountingSetup, setup_mode: newMode }),
      });
      setAccountingSetup((prev: any) => ({ ...prev, setup_mode: newMode }));
      onSaved?.({ ...accountingSetup, setup_mode: newMode });
    } catch {}
  };

  return (
    <div className="space-y-4">
      {networkError && (
        <div className="rounded-md border border-error/20 bg-error/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-error shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-error">No se pudo conectar con el servidor</p>
              <p className="text-[9px] text-error/70 mt-0.5">Verifica tu conexión e intenta de nuevo. Si el problema persiste, contacta al administrador.</p>
            </div>
            <button type="button" onClick={() => setNetworkError(null)} className="shrink-0 rounded-md border border-error/20 bg-error/10 px-2 py-1 text-[9px] font-medium text-error hover:bg-error/20">Cerrar</button>
          </div>
        </div>
      )}
      <PremiumHeader
        icon={<Calculator className="h-4 w-4" />}
        title={t("title")}
        subtitle="SAT · Pólizas · Contabilidad"
        section="accounting-setup"
        metrics={[
          ...(healthScore != null ? [{ label: "Salud contable", value: `${healthScore}%`, tone: (healthScore >= 90 ? "success" : healthScore >= 70 ? "warning" : "error") as "success" | "warning" | "error" }] : []),
          ...(accountantFieldCount > 0 ? [{ label: "Config. contador", value: accountantFieldCount, tone: "success" as const }] : []),
        ]}
        action={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest ${
              isSetupLocked
                ? "border-warning/20 bg-warning/10 text-warning"
                : "border-success/20 bg-success/10 text-success"
            }`}>
              {isSetupLocked ? <Lock className="h-2.5 w-2.5" /> : <Cog className="h-2.5 w-2.5" />}
              {isSetupLocked ? "Configuración bloqueada" : "Configuración abierta"}
            </span>
            {isAdmin && (
              <button
                type="button"
                onClick={toggleSetupMode}
                className="inline-flex items-center gap-1.5 rounded-md border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] font-semibold text-secondary hover:text-primary hover:border-strong transition-colors"
              >
                <ShieldCheck className="h-3 w-3" />
                {isSetupLocked ? "Desbloquear" : "Bloquear"}
              </button>
            )}
          </div>
        }
      />

      {/* Setup section tabs */}
      <div>
        <PatternSectionLabel>Configuración Contable</PatternSectionLabel>
        <div className="flex flex-wrap gap-1">
          {setupSections.map((s) => {
            const Icon = s.icon;
            const isActive = view === s.id;
            const isDisabled = isSetupLocked && !isAdmin && s.group === "setup";
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => !isDisabled && setView(s.id)}
                disabled={isDisabled}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-medium transition-all ${
                  isDisabled
                    ? "border-default bg-surface-2 text-muted cursor-not-allowed opacity-50"
                    : isActive
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-default bg-surface-2 text-secondary hover:border-strong hover:text-primary"
                }`}
              >
                <Icon className="h-3 w-3" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Operations section tabs */}
      <div>
        <PatternSectionLabel>Operaciones</PatternSectionLabel>
        <div className="flex flex-wrap gap-1">
          {opsSections.map((s) => {
            const Icon = s.icon;
            const isActive = view === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setView(s.id)}
                className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[10px] font-medium transition-all ${
                  isActive
                    ? "border-accent/30 bg-accent/10 text-accent"
                    : "border-default bg-surface-2 text-secondary hover:border-strong hover:text-primary"
                }`}
              >
                <Icon className="h-3 w-3" />
                {t(s.labelKey)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div>
        {view === "setup" && (
          <SetupSection
            companyId={companyId}
            setup={accountingSetup}
            companySetup={propCompanySetup}
            expensePolicy={propExpensePolicy}
            onSaved={handleSetupSaved}
            draftPatch={draftPatch}
            isLocked={isSetupLocked}
            isAdmin={isAdmin}
          />
        )}
        {view === "chart-of-accounts" && (
          <Suspense fallback={<div className="py-8 text-center text-[10px] text-muted">Cargando...</div>}>
            <AdminChartOfAccountsStudio companyId={companyId} />
          </Suspense>
        )}
        {view === "categorize" && (
          <Suspense fallback={<div className="py-8 text-center text-[10px] text-muted">Cargando...</div>}>
            <AdminAutoCategorizePanel companyId={companyId} />
          </Suspense>
        )}
        {view === "vendors" && (
          <VendorList companyId={companyId} />
        )}
        {view === "review" && (
          <Suspense fallback={<div className="py-8 text-center text-[10px] text-muted">Cargando cola de revisión...</div>}>
            <AccountingReviewModule />
          </Suspense>
        )}
        {view === "closing" && (
          <SmartClosingPanel companyId={companyId} period={closingPeriod} setPeriod={setClosingPeriod} checklist={checklist} onRefresh={loadChecklist} />
        )}
      </div>
    </div>
  );
}

// ── Setup Section (inline, reuses AdminAccountingSetupStudio logic but with lock awareness) ──

function SetupSection({ companyId, setup, companySetup: companySetup, expensePolicy, onSaved, draftPatch, isLocked, isAdmin }: {
  companyId: number;
  setup: any;
  companySetup?: any;
  expensePolicy?: any;
  onSaved?: (s: any) => void;
  draftPatch?: any;
  isLocked: boolean;
  isAdmin: boolean;
}) {
  const t = useTranslations("admin.accountingSetup");

  if (isLocked && !isAdmin) {
    return (
      <SectionPanel>
        <div className="flex items-center gap-3 px-4 py-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-warning/10">
            <Lock className="h-4 w-4 text-warning" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-primary">{t("setupLockedTitle")}</p>
            <p className="text-[9px] text-muted mt-0.5">{t("setupLockedDesc")}</p>
          </div>
        </div>
      </SectionPanel>
    );
  }

  return (
    <AdminAccountingSetupStudio
      companyId={companyId}
      setup={setup}
      companySetup={companySetup}
      expensePolicy={expensePolicy}
      onSaved={onSaved}
      draftPatch={draftPatch}
    />
  );
}

// ── Inline sub-components ────────────────────────────────────────────────────

function VendorList({ companyId }: { companyId: number }) {
  const [vendors, setVendors] = useState<any[]>([]);
  useEffect(() => {
    (async () => {
      try { const data = await apiCall(`/accounting/intelligence/vendors`) as any; setVendors(data.vendors || []); } catch {}
    })();
  }, [companyId]);

  if (vendors.length === 0) return (
    <EmptyState
      icon={<Users className="h-5 w-5" />}
      title="Sin proveedores"
      description="Usa el Copiloto para crear proveedores con RFC y reglas de retención."
      section="accounting-setup"
    />
  );

  return (
    <SectionPanel>
      {vendors.map((v: any) => (
        <div key={v.id} className="flex items-center justify-between px-4 py-2.5 border-b border-subtle last:border-0">
          <div>
            <div className="text-[11px] font-medium text-primary">{v.name}</div>
            <div className="text-[9px] text-muted">{v.rfc || "Sin RFC"} · {v.type}</div>
          </div>
          <div className="text-right text-[9px] text-tertiary">
            {v.isr_ret > 0 && <div>ISR {v.isr_ret}%</div>}
            {v.iva_ret > 0 && <div>IVA {v.iva_ret}%</div>}
          </div>
        </div>
      ))}
    </SectionPanel>
  );
}

function SmartClosingPanel({ companyId, period, setPeriod, checklist, onRefresh }: { companyId: number; period: string; setPeriod: (p: string) => void; checklist: any; onRefresh: () => void }) {
  const [closing, setClosing] = useState(false);
  const statusColor = (s: string) => s === "pass" ? "text-success" : s === "warn" ? "text-warning" : "text-error";

  const handleClose = async () => {
    setClosing(true);
    try { await fetch(`/accounting/intelligence/close-period`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) }); onRefresh(); } catch {}
    setClosing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-[10px] text-muted">Período</label>
        <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="rounded-md border border-default bg-surface-1 px-2 py-1 text-[11px] text-primary outline-none focus:border-accent/40" />
        <button onClick={onRefresh} className="rounded-md border border-default bg-surface-2 px-2.5 py-1 text-[10px] text-secondary hover:text-primary transition-colors">Verificar</button>
      </div>
      {checklist && (
        <>
          <div className={`rounded-md border p-3 ${checklist.can_close ? "border-success/20 bg-success/5" : "border-error/20 bg-error/5"}`}>
            <div className={`text-[11px] font-semibold ${checklist.can_close ? "text-success" : "text-error"}`}>
              {checklist.can_close ? "Listo para cerrar" : `${checklist.blocking_count} bloqueos`}
            </div>
            <div className="text-[9px] text-muted mt-0.5">{checklist.total_expenses} gastos en período</div>
          </div>
          <div className="space-y-1">
            {(checklist.items || []).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-2 py-1 px-1">
                <span className={`text-[10px] font-bold ${statusColor(item.status)}`}>
                  {item.status === "pass" ? "✓" : item.status === "warn" ? "⚠" : "✗"}
                </span>
                <span className="text-[11px] text-primary flex-1">{item.label}</span>
                {item.detail && <span className="text-[9px] text-muted">{item.detail}</span>}
              </div>
            ))}
          </div>
          {checklist.can_close && (
            <button onClick={handleClose} disabled={closing}
              className="rounded-md bg-accent px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40">
              {closing ? "Cerrando..." : "Cerrar Período"}
            </button>
          )}
        </>
      )}
    </div>
  );
}
