"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getAuthHeaders } from "@/lib/session";
import { apiCall, apiPost, apiPut, apiDelete } from "@/lib/api/client";
import {
  Save, Loader2, CheckCircle2, AlertCircle, Sparkles,
  Building2, Plus, Pencil, Trash2, X, ImagePlus,
  Globe, Clock, Briefcase, Users,
  Layers, CheckCircle, FileText, Archive,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  RowStack,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

const COMPANY_SETUP_CODES = new Set([
  "MANAGER_FLOW_NO_MANAGERS",
  "MANAGER_WORKFLOW_NO_MANAGERS",
  "REQUIRE_MANAGER_ALL_NO_MANAGERS",
  "EXPENSE_POLICY_MANAGER_APPROVAL_NO_MANAGERS",
  "MULTI_COUNTRY_INTL_DISABLED",
]);

interface Props {
  companyId: number;
  setup: any;
  legalEntities: any[];
  onSaved?: (setup: any) => void;
  onLegalEntitiesChanged?: (entities: any[]) => void;
  draftPatch?: Partial<any>;
  portalConfig?: any;
}

// ── Option sets ───────────────────────────────────────────────────────────────

const COUNTRY_OPTIONS = [
  { value: "MX", labelKey: "countryMX" },
  { value: "US", labelKey: "countryUS" },
  { value: "CO", labelKey: "countryCO" },
  { value: "BR", labelKey: "countryBR" },
  { value: "AR", labelKey: "countryAR" },
  { value: "CL", labelKey: "countryCL" },
];

const CURRENCY_OPTIONS = [
  { value: "MXN", labelKey: "currencyMXN" },
  { value: "USD", labelKey: "currencyUSD" },
  { value: "COP", labelKey: "currencyCOP" },
  { value: "BRL", labelKey: "currencyBRL" },
  { value: "ARS", labelKey: "currencyARS" },
  { value: "CLP", labelKey: "currencyCLP" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Mexico_City",   labelKey: "tzMexicoCity" },
  { value: "America/New_York",      labelKey: "tzNewYork" },
  { value: "America/Chicago",       labelKey: "tzChicago" },
  { value: "America/Denver",        labelKey: "tzDenver" },
  { value: "America/Los_Angeles",   labelKey: "tzLosAngeles" },
  { value: "America/Bogota",        labelKey: "tzBogota" },
  { value: "America/Sao_Paulo",     labelKey: "tzSaoPaulo" },
  { value: "America/Argentina/Buenos_Aires", labelKey: "tzBuenosAires" },
  { value: "America/Santiago",      labelKey: "tzSantiago" },
];

const LANGUAGE_OPTIONS = [
  { value: "es-MX", labelKey: "langEsMX" },
  { value: "es-CO", labelKey: "langEsCO" },
  { value: "en-US", labelKey: "langEnUS" },
  { value: "pt-BR", labelKey: "langPtBR" },
];

const INDUSTRY_OPTIONS = [
  { value: "technology",      labelKey: "industryTechnology" },
  { value: "financial",       labelKey: "industryFinancial" },
  { value: "retail",          labelKey: "industryRetail" },
  { value: "manufacturing",   labelKey: "industryManufacturing" },
  { value: "consulting",      labelKey: "industryConsulting" },
  { value: "construction",    labelKey: "industryConstruction" },
  { value: "healthcare",      labelKey: "industryHealthcare" },
  { value: "education",       labelKey: "industryEducation" },
  { value: "logistics",       labelKey: "industryLogistics" },
  { value: "media",           labelKey: "industryMedia" },
  { value: "other",           labelKey: "industryOther" },
];

const EMPLOYEE_RANGE_OPTIONS = [
  { value: "1-10",       labelKey: "employees1_10" },
  { value: "11-50",      labelKey: "employees11_50" },
  { value: "51-200",     labelKey: "employees51_200" },
  { value: "201-500",    labelKey: "employees201_500" },
  { value: "501-1000",   labelKey: "employees501_1000" },
  { value: "1001+",      labelKey: "employees1001+" },
];

const ALLOC_DIM_OPTIONS = [
  { value: "project",                    labelKey: "allocProject" },
  { value: "client",                     labelKey: "allocClient" },
  { value: "cost_center",                labelKey: "allocCostCenter" },
  { value: "project_client",             labelKey: "allocProjectClient" },
  { value: "project_cost_center",        labelKey: "allocProjectCostCenter" },
  { value: "client_cost_center",         labelKey: "allocClientCostCenter" },
  { value: "project_client_cost_center", labelKey: "allocProjectClientCostCenter" },
];

// ── Main ──────────────────────────────────────────────────────────────────────

const EMPTY_ENTITY = {
  company_id: 0,
  entity_name: "",
  entity_code: "",
  country_code: "",
  base_currency: "",
  legal_name: "",
  tax_id: "",
  rfc: "",
  fiscal_regime: "",
  fiscal_zip_code: "",
  fiscal_address: "",
  is_reimbursement_entity: false,
  is_invoice_receiver_entity: false,
  is_active: true,
};

function LegalEntityForm({
  companyId,
  initial,
  onSaved,
  onCancel,
}: {
  companyId: number;
  initial?: any;
  onSaved: (entity: any) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("admin.companySetup");
  const tc = useTranslations("common");

  const COUNTRY_OPTIONS_T = COUNTRY_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const CURRENCY_OPTIONS_T = CURRENCY_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const isEdit = !!initial?.id;
  const [form, setForm] = useState<Record<string, any>>(
    isEdit ? { ...initial } : { ...EMPTY_ENTITY, company_id: companyId }
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!form.entity_name?.trim()) {
      setError(t("entityNameRequired"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let data: any;
      if (isEdit) {
        const { company_id: _, ...rest } = form;
        data = await apiPut(`/admin/company-setup/legal-entities/${initial.id}`, rest);
      } else {
        data = await apiPost(`/admin/company-setup/${companyId}/legal-entities`, form);
      }
      onSaved(data);
    } catch (e: any) {
      setError(e?.message ?? tc("save"));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-primary placeholder:text-muted outline-none transition-all focus:border-accent/40 focus:bg-surface-3 hover:border-strong";

  return (
    <div className="space-y-3 rounded-md border border-default bg-surface-1 p-3">
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-accent/20">
          <Building2 className="h-3 w-3 text-accent" />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-secondary">
          {isEdit ? t("editEntity") : t("addLegalEntity")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("entityNameLabel")}</p>
          <input className={fieldClass} value={form.entity_name ?? ""} onChange={(e) => set("entity_name", e.target.value)} placeholder="ACME S.A. de C.V." />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("entityCodeLabel")}</p>
          <input className={fieldClass} value={form.entity_code ?? ""} onChange={(e) => set("entity_code", e.target.value)} placeholder="MX-MAIN" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("rfcLabel")}</p>
          <input className={fieldClass} value={form.rfc ?? ""} onChange={(e) => set("rfc", e.target.value)} placeholder="ACM901204XY3" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("taxIdLabel")}</p>
          <input className={fieldClass} value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} placeholder={t("taxIdPlaceholder")} />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("countryLabel")}</p>
          <select className={fieldClass} value={form.country_code ?? ""} onChange={(e) => set("country_code", e.target.value)}>
            <option value=""> - </option>
            {COUNTRY_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("currencyLabel")}</p>
          <select className={fieldClass} value={form.base_currency ?? ""} onChange={(e) => set("base_currency", e.target.value)}>
            <option value=""> - </option>
            {CURRENCY_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("fiscalRegimeLabel")}</p>
          <input className={fieldClass} value={form.fiscal_regime ?? ""} onChange={(e) => set("fiscal_regime", e.target.value)} placeholder="601" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("fiscalZipLabel")}</p>
          <input className={fieldClass} value={form.fiscal_zip_code ?? ""} onChange={(e) => set("fiscal_zip_code", e.target.value)} placeholder="06600" />
        </div>
        <div className="col-span-2">
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("legalNameLabel")}</p>
          <input className={fieldClass} value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} placeholder={t("legalNamePlaceholder")} />
        </div>
        <div className="col-span-2">
          <p className="mb-1 text-[10px] font-medium text-secondary">{t("fiscalAddressLabel")}</p>
          <input className={fieldClass} value={form.fiscal_address ?? ""} onChange={(e) => set("fiscal_address", e.target.value)} placeholder={t("fiscalAddressPlaceholder")} />
        </div>
      </div>

      {/* Flags */}
      <div className="flex flex-wrap items-center gap-4 pt-1">
        {[
          { key: "is_reimbursement_entity",    label: t("entityFlagReimb") },
          { key: "is_invoice_receiver_entity", label: t("entityFlagInvoice") },
          { key: "is_active",                  label: t("entityFlagActive") },
        ].map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2/50">
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => set(key, e.target.checked)}
              className="h-4 w-4 rounded border-default bg-surface-2 accent-accent"
            />
            <span className="text-[10px] text-secondary">{label}</span>
          </label>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-error/20 bg-error/5 px-3 py-2">
          <AlertCircle className="h-3.5 w-3.5 text-error" />
          <p className="text-[10px] text-error font-medium">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isEdit ? t("update") : t("create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
        >
          <X className="h-3.5 w-3.5" /> {tc("cancel")}
        </button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminCompanySetupStudio({
  companyId,
  setup,
  legalEntities,
  onSaved,
  onLegalEntitiesChanged,
  draftPatch,
  portalConfig,
}: Props) {
  const t = useTranslations("admin.companySetup");
  const tc = useTranslations("common");

  const COUNTRY_OPTIONS_T = COUNTRY_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const CURRENCY_OPTIONS_T = CURRENCY_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const TIMEZONE_OPTIONS_T = TIMEZONE_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const LANGUAGE_OPTIONS_T = LANGUAGE_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const EMPLOYEE_RANGE_OPTIONS_T = EMPLOYEE_RANGE_OPTIONS.map(opt => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const INDUSTRY_OPTIONS_T = [
    { value: "technology",    label: t("industryTechnology") },
    { value: "financial",     label: t("industryFinancial") },
    { value: "retail",        label: t("industryRetail") },
    { value: "manufacturing", label: t("industryManufacturing") },
    { value: "consulting",    label: t("industryConsulting") },
    { value: "construction",  label: t("industryConstruction") },
    { value: "healthcare",    label: t("industryHealthcare") },
    { value: "education",     label: t("industryEducation") },
    { value: "logistics",     label: t("industryLogistics") },
    { value: "media",         label: t("industryMedia") },
    { value: "other",         label: t("industryOther") },
  ];

  const ALLOC_DIM_OPTIONS_T = [
    { value: "project",                    label: t("allocProject") },
    { value: "client",                     label: t("allocClient") },
    { value: "cost_center",                label: t("allocCostCenter") },
    { value: "project_client",             label: t("allocProjectClient") },
    { value: "project_cost_center",        label: t("allocProjectCostCenter") },
    { value: "client_cost_center",         label: t("allocClientCostCenter") },
    { value: "project_client_cost_center", label: t("allocProjectClientCostCenter") },
  ];

  // ── Derived summary (inside component so we can use t()) ──────────────────
  function buildSummary(form: Record<string, any>): string {
    const parts: string[] = [];
    if (form.industry) parts.push(form.industry);
    if (form.employee_count_range) parts.push(form.employee_count_range);
    if (form.country_code) parts.push(form.country_code);
    if (form.base_currency) parts.push(form.base_currency);
    const enabledCount = [
      "expenses_module_enabled", "time_allocation_module_enabled",
      "subcontractor_module_enabled",
      "approvals_module_enabled", "accounting_module_enabled",
      "archive_module_enabled",
    ].filter((k) => form[k]).length;
    parts.push(t("summaryModulesActive", { count: enabledCount }));
    return parts.join(" · ") || t("summaryNoSetup");
  }

  // ── Inline warnings ──────────────────────────────────────────────────────
  function buildWarnings(form: Record<string, any>, entities: any[]): string[] {
    const w: string[] = [];

    if (!form.has_managers && form.approvals_module_enabled)
      w.push(t("warningApprovalNoManagers"));

    if (form.accounting_module_enabled && !form.expenses_module_enabled)
      w.push(t("warningAccountingNoExpenses"));

    return w;
  }

  const [form, setForm]           = useState<Record<string, any>>({ ...setup });
  const [dirty, setDirty]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const prevDraftRef              = useRef<Partial<any> | undefined>(undefined);

  const [entities, setEntities]   = useState<any[]>(legalEntities);
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [addingEntity, setAddingEntity]   = useState(false);
  const [deletingId, setDeletingId]       = useState<number | null>(null);

  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError]         = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    setLogoError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API}/admin/company-setup/${companyId}/logo`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.detail ?? `${res.status}`);
      }
      const data = await res.json();
      setForm((prev) => ({ ...prev, logo_url: data.logo_url }));
      onSaved?.({ ...form, logo_url: data.logo_url });
    } catch (e: any) {
      setLogoError(e?.message ?? tc("uploading"));
    } finally {
      setLogoUploading(false);
    }
  };

  // Sync when parent refreshes setup
  useEffect(() => {
    setForm({ ...setup });
    setDirty(false);
    setSaved(false);
    setAiDrafted(false);
  }, [setup]);

  // Sync when parent refreshes entities
  useEffect(() => {
    setEntities(legalEntities);
  }, [legalEntities]);

  // Merge draftPatch without auto-saving
  useEffect(() => {
    if (!draftPatch || draftPatch === prevDraftRef.current) return;
    prevDraftRef.current = draftPatch;
    setForm((prev) => ({ ...prev, ...draftPatch }));
    setDirty(true);
    setSaved(false);
    setAiDrafted(true);
  }, [draftPatch]);

  const set = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await apiPut(`/admin/company-setup/${companyId}`, form);
      setDirty(false);
      setSaved(true);
      setAiDrafted(false);
      onSaved?.(updated);
    } catch (e: any) {
      setError(e?.message ?? tc("save"));
    } finally {
      setSaving(false);
    }
  };

  const handleEntitySaved = (entity: any) => {
    const next = editingEntity
      ? entities.map((e) => (e.id === entity.id ? entity : e))
      : [...entities, entity];
    setEntities(next);
    onLegalEntitiesChanged?.(next);
    setEditingEntity(null);
    setAddingEntity(false);
  };

  const handleDeleteEntity = async (id: number) => {
    setDeletingId(id);
    try {
      await apiDelete(`/admin/company-setup/legal-entities/${id}`);
      const next = entities.filter((e) => e.id !== id);
      setEntities(next);
      onLegalEntitiesChanged?.(next);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  };

  const warnings = buildWarnings(form, entities);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PremiumHeader
        section="company-setup"
        icon={<Building2 className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("studioSubtitle")}
        badge={
          aiDrafted ? (
            <span className="flex items-center gap-1.5 rounded-full border border-ai/30 bg-ai-muted px-2 py-0.5 text-[9px] font-semibold text-ai">
              <Sparkles className="h-3 w-3" /> {t("aiDraft")}
            </span>
          ) : null
        }
        action={
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            {tc("save")}
          </button>
        }
        metrics={[
          {
            label: t("unsavedChanges"),
            value: dirty ? "!" : "0",
            tone: dirty ? "warning" : "neutral",
          },
        ]}
      />

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded border border-error/20 bg-error/5 px-3 py-2 text-error/85">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* A - Company Identity */}
      <div>
        <PatternSectionLabel>{t("sectionA")}</PatternSectionLabel>
        <SectionPanel>
          {/* Logo upload row */}
          <Row label={t("logo")} description={t("logoDesc")}>
            <div className="flex items-center gap-3">
              {form.logo_url && (
                <img
                  src={`${API}${form.logo_url}`}
                  alt={t("logo")}
                  className="h-10 w-10 rounded-lg border border-default object-contain bg-surface-0 p-0.5"
                />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={logoUploading}
                className="flex items-center gap-2 rounded-lg border border-default bg-surface-2 px-3 py-1.5 text-[10px] font-medium text-secondary transition-all hover:border-accent hover:bg-accent-muted hover:text-accent disabled:opacity-40"
              >
                {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                {form.logo_url ? t("logoReplace") : t("logoUpload")}
              </button>
            </div>
          </Row>

          <Row label={t("displayName")} description={t("displayNameDesc")}>
            <input
              type="text"
              value={form.display_name ?? ""}
              placeholder={t("displayNamePlaceholder")}
              onChange={(e) => set("display_name", e.target.value)}
              className={`${inputClasses.base} w-52`}
            />
          </Row>

          <Row label={t("country")} description={t("countryDesc")}>
            <select
              value={form.country_code ?? ""}
              onChange={(e) => set("country_code", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {COUNTRY_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>

          <Row label={t("baseCurrency")} description={t("baseCurrencyDesc")}>
            <select
              value={form.base_currency ?? ""}
              onChange={(e) => set("base_currency", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {CURRENCY_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>

          <Row label={t("timezone")} description={t("timezoneDesc")}>
            <select
              value={form.timezone ?? ""}
              onChange={(e) => set("timezone", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {TIMEZONE_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>

          <Row label={t("language")} description={t("languageDesc")}>
            <select
              value={form.language_code ?? ""}
              onChange={(e) => set("language_code", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {LANGUAGE_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>

          <Row label={t("industry")} description={t("industryDesc")}>
            <select
              value={form.industry ?? ""}
              onChange={(e) => set("industry", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {INDUSTRY_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
        </SectionPanel>
      </div>

      {/* B - Organization Model */}
      <div>
        <PatternSectionLabel>{t("sectionB")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("employeeCountRange")} description={t("employeeCountRangeDesc")}>
            <select
              value={form.employee_count_range ?? ""}
              onChange={(e) => set("employee_count_range", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              <option value=""> - </option>
              {EMPLOYEE_RANGE_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label={t("hasManagers")} description={t("hasManagersDesc")}>
            <Toggle value={!!form.has_managers} onChange={(v) => set("has_managers", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* C - Allocation & Operations */}
      <div>
        <PatternSectionLabel>{t("sectionC")}</PatternSectionLabel>
        <SectionPanel>
          <Row label={t("allocationDimensions")} description={t("allocationDimensionsDesc")}>
            <select
              value={form.allocation_dimensions ?? "project_client_cost_center"}
              onChange={(e) => set("allocation_dimensions", e.target.value)}
              className={`${inputClasses.select} w-52`}
            >
              {ALLOC_DIM_OPTIONS_T.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Row>
          <Row label={t("splitAllocations")} description={t("splitAllocationsDesc")}>
            <Toggle value={!!form.allow_split_allocations} onChange={(v) => set("allow_split_allocations", v)} />
          </Row>
        </SectionPanel>
      </div>

      {/* D - Module Activation */}
      <div>
        <PatternSectionLabel>{t("sectionD")}</PatternSectionLabel>
        <SectionPanel>
          {[
            { key: "expenses_module_enabled", label: t("moduleExpenses"), desc: t("moduleExpensesDesc") },
            { key: "time_allocation_module_enabled", label: t("moduleTimeAllocation"), desc: t("moduleTimeAllocationDesc") },
            { key: "approvals_module_enabled", label: t("moduleApprovals"), desc: t("moduleApprovalsDesc") },
            { key: "accounting_module_enabled", label: t("moduleAccounting"), desc: t("moduleAccountingDesc") },
            { key: "archive_module_enabled", label: t("moduleArchive"), desc: t("moduleArchiveDesc") },
          ].map(({ key, label, desc }) => (
            <Row key={key} label={label} description={desc}>
              <Toggle value={!!form[key]} onChange={(v) => set(key, v)} />
            </Row>
          ))}
        </SectionPanel>
      </div>

      {/* E - Legal Entities */}
      <div>
        <PatternSectionLabel>{t("sectionE")}</PatternSectionLabel>

        {entities.length > 0 && (
          <div className="mb-3 overflow-hidden rounded-lg border border-default bg-surface-1">
            <div className="grid grid-cols-[1fr_auto_auto_auto_70px] gap-x-4 border-b border-subtle bg-surface-2/50 px-4 py-2">
              {[t("entityColName"), t("entityColRfc"), t("entityColReimb"), t("entityColInvoice"), ""].map((h, i) => (
                <span key={i} className="text-[9px] font-bold uppercase tracking-widest text-muted">{h}</span>
              ))}
            </div>
            {entities.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1fr_auto_auto_auto_70px] items-center gap-x-4 border-b border-subtle px-4 py-2.5 last:border-0 transition-colors hover:bg-surface-2/30"
              >
                <div>
                  <p className="text-[11px] font-medium text-primary">{e.entity_name}</p>
                  {e.entity_code && <p className="font-mono text-[9px] text-muted">{e.entity_code}</p>}
                </div>
                <span className="font-mono text-[10px] text-secondary">{e.rfc || " - "}</span>
                <span className={`text-[10px] ${e.is_reimbursement_entity ? "text-success font-medium" : "text-muted"}`}>
                  {e.is_reimbursement_entity ? "✓" : " - "}
                </span>
                <span className={`text-[10px] ${e.is_invoice_receiver_entity ? "text-success font-medium" : "text-muted"}`}>
                  {e.is_invoice_receiver_entity ? "✓" : " - "}
                </span>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setEditingEntity(e); setAddingEntity(false); }}
                    className="rounded p-1 text-muted transition-colors hover:bg-surface-3 hover:text-secondary"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntity(e.id)}
                    disabled={deletingId === e.id}
                    className="rounded p-1 text-muted transition-colors hover:bg-error/10 hover:text-error disabled:opacity-40"
                  >
                    {deletingId === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingEntity && (
          <LegalEntityForm
            companyId={companyId}
            initial={editingEntity}
            onSaved={handleEntitySaved}
            onCancel={() => setEditingEntity(null)}
          />
        )}

        {addingEntity && !editingEntity && (
          <LegalEntityForm
            companyId={companyId}
            onSaved={handleEntitySaved}
            onCancel={() => setAddingEntity(false)}
          />
        )}

        {!addingEntity && !editingEntity && (
          <button
            type="button"
            onClick={() => setAddingEntity(true)}
            className="flex items-center gap-2 rounded-lg border border-default bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-secondary transition-all hover:border-accent hover:bg-accent-muted hover:text-accent"
          >
            <Plus className="h-3.5 w-3.5" /> {t("addLegalEntity")}
          </button>
        )}
      </div>
    </div>
  );
}
