"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiCall } from "@/lib/api/client";
import {
  Calculator, BarChart3, Sparkles, Users, Wand2, Lock,
  Settings, BookOpen, Layers, Cog,
} from "lucide-react";
import AdminAccountingSetupStudio from "./AdminAccountingSetupStudio";
import AdminChartOfAccountsStudio from "./AdminChartOfAccountsStudio";
import AdminAccountingDashboard from "./AdminAccountingDashboard";
import AdminAutoCategorizePanel from "./AdminAutoCategorizePanel";
import AdminSetupWizard from "./AdminSetupWizard";
import {
  PremiumHeader,
  SectionPanel,
  SectionLabel as PatternSectionLabel,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";

type AccountingTab = "setup" | "chart-of-accounts" | "dashboard" | "categorize" | "vendors" | "wizard" | "closing";

interface SectionDef {
  id: AccountingTab;
  labelKey: string;
  descKey: string;
  icon: any;
  group: "config" | "operations";
}

const SECTIONS: SectionDef[] = [
  { id: "setup", labelKey: "tabSetup", descKey: "tabSetupDesc", icon: Cog, group: "config" },
  { id: "chart-of-accounts", labelKey: "tabCatalog", descKey: "tabCatalogDesc", icon: BookOpen, group: "config" },
  { id: "dashboard", labelKey: "tabDashboard", descKey: "tabDashboardDesc", icon: BarChart3, group: "operations" },
  { id: "categorize", labelKey: "tabCategorize", descKey: "tabCategorizeDesc", icon: Sparkles, group: "operations" },
  { id: "vendors", labelKey: "tabVendors", descKey: "tabVendorsDesc", icon: Users, group: "operations" },
  { id: "closing", labelKey: "tabClosing", descKey: "tabClosingDesc", icon: Lock, group: "operations" },
];

interface Props {
  companyId: number;
  setup: any;
  companySetup?: any;
  expensePolicy?: any;
  onSaved?: (s: any) => void;
  draftPatch?: any;
}

export default function AdminAccountingHub({ companyId, setup, companySetup, expensePolicy, onSaved, draftPatch }: Props) {
  const t = useTranslations("admin.accountingSetup");
  const [tab, setTab] = useState<AccountingTab>("setup");
  const [health, setHealth] = useState<any>(null);
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
  useEffect(() => { if (tab === "closing") loadChecklist(); }, [tab, loadChecklist]);

  const healthScore = health?.health_score;
  const healthLabel = healthScore != null
    ? (healthScore >= 90 ? "Saludable" : healthScore >= 70 ? "Atención" : healthScore >= 50 ? "Incompleto" : "Sin configurar")
    : null;

  const configSections = SECTIONS.filter((s) => s.group === "config");
  const opsSections = SECTIONS.filter((s) => s.group === "operations");

  return (
    <div className="space-y-4">
      <PremiumHeader
        icon={<Calculator className="h-4 w-4" />}
        title={t("title")}
        subtitle="SAT · Pólizas · Contabilidad"
        section="accounting-setup"
        metrics={healthScore != null ? [
          { label: "Salud contable", value: `${healthScore}%`, tone: healthScore >= 90 ? "success" : healthScore >= 70 ? "warning" : "error" as const },
        ] : undefined}
        action={
          <button
            type="button"
            onClick={() => setTab("wizard")}
            className="inline-flex items-center gap-1.5 rounded-md border border-default bg-surface-1 px-2.5 py-1.5 text-[10px] font-semibold text-secondary hover:text-primary hover:border-strong transition-colors"
          >
            <Wand2 className="h-3 w-3" />
            Asistente
          </button>
        }
      />

      {/* Config section tabs */}
      <div>
        <PatternSectionLabel>Configuración SAT</PatternSectionLabel>
        <div className="flex flex-wrap gap-1">
          {configSections.map((s) => {
            const Icon = s.icon;
            const isActive = tab === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTab(s.id)}
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

      {/* Operations section tabs */}
      <div>
        <PatternSectionLabel>Operaciones</PatternSectionLabel>
        <div className="flex flex-wrap gap-1">
          {opsSections.map((s) => {
            const Icon = s.icon;
            const isActive = tab === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setTab(s.id)}
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
        {tab === "setup" && (
          <AdminAccountingSetupStudio companyId={companyId} setup={setup} companySetup={companySetup} expensePolicy={expensePolicy} onSaved={onSaved} draftPatch={draftPatch} />
        )}
        {tab === "chart-of-accounts" && (
          <AdminChartOfAccountsStudio companyId={companyId} />
        )}
        {tab === "dashboard" && (
          <AdminAccountingDashboard companyId={companyId} />
        )}
        {tab === "categorize" && (
          <AdminAutoCategorizePanel companyId={companyId} />
        )}
        {tab === "vendors" && (
          <VendorList companyId={companyId} />
        )}
        {tab === "wizard" && (
          <AdminSetupWizard companyId={companyId} />
        )}
        {tab === "closing" && (
          <SmartClosingPanel companyId={companyId} period={closingPeriod} setPeriod={setClosingPeriod} checklist={checklist} onRefresh={loadChecklist} />
        )}
      </div>
    </div>
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
    <div className="py-8 text-center text-[11px] text-muted">
      Sin proveedores registrados. Usa el Copiloto para crear proveedores con RFC y reglas de retención.
    </div>
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
