"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { getAuthHeaders } from "@/lib/session";
import { apiCall, apiPost, apiPut, apiDelete } from "@/lib/api/client";
import {
  Save, Loader2, CheckCircle2, AlertCircle, Sparkles,
  Building2, Plus, Pencil, Trash2, X, ImagePlus,
} from "lucide-react";

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
  { value: "MX", label: "Mexico" },
  { value: "US", label: "United States" },
  { value: "CO", label: "Colombia" },
  { value: "BR", label: "Brazil" },
  { value: "AR", label: "Argentina" },
  { value: "CL", label: "Chile" },
];

const CURRENCY_OPTIONS = [
  { value: "MXN", label: "MXN — Mexican Peso" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "COP", label: "COP — Colombian Peso" },
  { value: "BRL", label: "BRL — Brazilian Real" },
  { value: "ARS", label: "ARS — Argentine Peso" },
  { value: "CLP", label: "CLP — Chilean Peso" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/Mexico_City",   label: "America/Mexico_City" },
  { value: "America/New_York",      label: "America/New_York" },
  { value: "America/Chicago",       label: "America/Chicago" },
  { value: "America/Denver",        label: "America/Denver" },
  { value: "America/Los_Angeles",   label: "America/Los_Angeles" },
  { value: "America/Bogota",        label: "America/Bogota" },
  { value: "America/Sao_Paulo",     label: "America/Sao_Paulo" },
  { value: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { value: "America/Santiago",      label: "America/Santiago" },
];

const LANGUAGE_OPTIONS = [
  { value: "es-MX", label: "Spanish (Mexico)" },
  { value: "es-CO", label: "Spanish (Colombia)" },
  { value: "en-US", label: "English (US)" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
];

const INDUSTRY_OPTIONS = [
  { value: "technology",      label: "Technology" },
  { value: "financial",       label: "Financial Services" },
  { value: "retail",          label: "Retail" },
  { value: "manufacturing",   label: "Manufacturing" },
  { value: "consulting",      label: "Consulting" },
  { value: "construction",    label: "Construction" },
  { value: "healthcare",      label: "Healthcare" },
  { value: "education",       label: "Education" },
  { value: "logistics",       label: "Logistics" },
  { value: "media",           label: "Media & Publishing" },
  { value: "other",           label: "Other" },
];

const EMPLOYEE_RANGE_OPTIONS = [
  { value: "1-10",       label: "1–10" },
  { value: "11-50",      label: "11–50" },
  { value: "51-200",     label: "51–200" },
  { value: "201-500",    label: "201–500" },
  { value: "501-1000",   label: "501–1,000" },
  { value: "1001+",      label: "1,001+" },
];

const ALLOC_DIM_OPTIONS = [
  { value: "project",                    label: "Project" },
  { value: "client",                     label: "Client" },
  { value: "cost_center",                label: "Cost Center" },
  { value: "project_client",             label: "Project + Client" },
  { value: "project_cost_center",        label: "Project + Cost Center" },
  { value: "client_cost_center",         label: "Client + Cost Center" },
  { value: "project_client_cost_center", label: "Project + Client + Cost Center" },
];

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-white/22">
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] divide-y divide-white/[0.05]">
      {children}
    </div>
  );
}

function TextInputRow({
  label,
  description,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <input
        type="text"
        value={value ?? ""}
        placeholder={placeholder ?? "—"}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40"
      />
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 outline-none focus:border-indigo-500/40"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-white/68">{label}</p>
        {description && <p className="text-[10px] text-white/28">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors ${
          checked
            ? "border-indigo-500/40 bg-indigo-600/30"
            : "border-white/[0.1] bg-white/[0.04]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${
            checked ? "translate-x-3 bg-indigo-400" : "translate-x-0.5 bg-white/20"
          }`}
        />
      </button>
    </div>
  );
}

// ── Legal entity mini-form ────────────────────────────────────────────────────

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
    "w-full rounded border border-white/[0.08] bg-zinc-900 px-2 py-1 text-[10px] text-white/55 placeholder:text-white/20 outline-none focus:border-indigo-500/40";

  return (
    <div className="space-y-3 rounded-lg border border-white/[0.08] bg-white/[0.025] p-4">
      <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">
        {isEdit ? t("editEntity") : t("addLegalEntity")}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("entityNameLabel")}</p>
          <input className={fieldClass} value={form.entity_name ?? ""} onChange={(e) => set("entity_name", e.target.value)} placeholder="ACME S.A. de C.V." />
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("entityCodeLabel")}</p>
          <input className={fieldClass} value={form.entity_code ?? ""} onChange={(e) => set("entity_code", e.target.value)} placeholder="MX-MAIN" />
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("rfcLabel")}</p>
          <input className={fieldClass} value={form.rfc ?? ""} onChange={(e) => set("rfc", e.target.value)} placeholder="ACM901204XY3" />
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("taxIdLabel")}</p>
          <input className={fieldClass} value={form.tax_id ?? ""} onChange={(e) => set("tax_id", e.target.value)} placeholder={t("taxIdPlaceholder")} />
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("countryLabel")}</p>
          <select className={fieldClass} value={form.country_code ?? ""} onChange={(e) => set("country_code", e.target.value)}>
            <option value="">—</option>
            {COUNTRY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("currencyLabel")}</p>
          <select className={fieldClass} value={form.base_currency ?? ""} onChange={(e) => set("base_currency", e.target.value)}>
            <option value="">—</option>
            {CURRENCY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("fiscalRegimeLabel")}</p>
          <input className={fieldClass} value={form.fiscal_regime ?? ""} onChange={(e) => set("fiscal_regime", e.target.value)} placeholder="601" />
        </div>
        <div>
          <p className="mb-0.5 text-[9px] text-white/30">{t("fiscalZipLabel")}</p>
          <input className={fieldClass} value={form.fiscal_zip_code ?? ""} onChange={(e) => set("fiscal_zip_code", e.target.value)} placeholder="06600" />
        </div>
        <div className="col-span-2">
          <p className="mb-0.5 text-[9px] text-white/30">{t("legalNameLabel")}</p>
          <input className={fieldClass} value={form.legal_name ?? ""} onChange={(e) => set("legal_name", e.target.value)} placeholder={t("legalNamePlaceholder")} />
        </div>
        <div className="col-span-2">
          <p className="mb-0.5 text-[9px] text-white/30">{t("fiscalAddressLabel")}</p>
          <input className={fieldClass} value={form.fiscal_address ?? ""} onChange={(e) => set("fiscal_address", e.target.value)} placeholder={t("fiscalAddressPlaceholder")} />
        </div>
      </div>

      {/* Flags */}
      <div className="flex items-center gap-4 pt-1">
        {[
          { key: "is_reimbursement_entity",    label: t("entityFlagReimb") },
          { key: "is_invoice_receiver_entity", label: t("entityFlagInvoice") },
          { key: "is_active",                  label: t("entityFlagActive") },
        ].map(({ key, label }) => (
          <label key={key} className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={(e) => set(key, e.target.checked)}
              className="h-3 w-3 rounded border-white/20 bg-zinc-900 accent-indigo-500"
            />
            <span className="text-[10px] text-white/45">{label}</span>
          </label>
        ))}
      </div>

      {error && (
        <p className="text-[10px] text-red-400/70">{error}</p>
      )}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-600/20 px-3 py-1 text-[10px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {isEdit ? t("update") : t("create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 rounded border border-white/[0.07] px-3 py-1 text-[10px] text-white/35 transition-colors hover:text-white/50"
        >
          <X className="h-3 w-3" /> {tc("cancel")}
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
    <div className="max-w-xl space-y-5">

      {/* Header */}
      <div className="border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-white/25" />
          <h2 className="text-sm font-semibold text-white/80">{t("title")}</h2>
          {aiDrafted && (
            <span className="flex items-center gap-1 rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-300/80">
              <Sparkles className="h-2.5 w-2.5" /> {t("aiDraft")}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-white/35">
          {t("studioSubtitle")}
        </p>
      </div>

      {/* Summary banner */}
      <div className="flex items-center gap-x-1 rounded border border-white/[0.05] bg-white/[0.02] px-3 py-2">
        <p className="text-[10px] text-white/38">{buildSummary(form)}</p>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3">
        {dirty && !saved && (
          <span className="text-[10px] text-amber-400/70">{t("unsavedChanges")}</span>
        )}
        {saved && (
          <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
            <CheckCircle2 className="h-3 w-3" /> {tc("saved")}
          </span>
        )}
        {error && (
          <span className="flex items-center gap-1 text-[10px] text-red-400/70">
            <AlertCircle className="h-3 w-3" /> {error}
          </span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="ml-auto flex items-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-600/20 px-3 py-1 text-[10px] font-semibold text-indigo-300 transition-colors hover:bg-indigo-600/30 disabled:opacity-30"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          {tc("save")}
        </button>
      </div>

      {/* A — Company Identity */}
      <div>
        <SectionLabel>{t("sectionA")}</SectionLabel>
        <Panel>
          {/* Logo upload row */}
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-white/68">{t("logo")}</p>
              <p className="text-[10px] text-white/28">{t("logoDesc")}</p>
              {logoError && <p className="mt-0.5 text-[9px] text-red-400/70">{logoError}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {form.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${API}${form.logo_url}`}
                  alt={t("logo")}
                  className="h-8 w-8 rounded border border-white/[0.08] object-contain bg-white/[0.03] p-0.5"
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
                className="flex items-center gap-1.5 rounded border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10px] text-white/45 transition-colors hover:bg-white/[0.06] hover:text-white/65 disabled:opacity-40"
              >
                {logoUploading
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <ImagePlus className="h-3 w-3" />}
                {form.logo_url ? t("logoReplace") : t("logoUpload")}
              </button>
            </div>
          </div>
          <TextInputRow
            label={t("displayName")}
            description={t("displayNameDesc")}
            value={form.display_name ?? ""}
            placeholder={t("displayNamePlaceholder")}
            onChange={(v) => set("display_name", v)}
          />
          <SelectRow
            label={t("country")}
            description={t("countryDesc")}
            value={form.country_code ?? ""}
            options={COUNTRY_OPTIONS}
            onChange={(v) => set("country_code", v)}
          />
          <SelectRow
            label={t("baseCurrency")}
            description={t("baseCurrencyDesc")}
            value={form.base_currency ?? ""}
            options={CURRENCY_OPTIONS}
            onChange={(v) => set("base_currency", v)}
          />
          <SelectRow
            label={t("timezone")}
            description={t("timezoneDesc")}
            value={form.timezone ?? ""}
            options={TIMEZONE_OPTIONS}
            onChange={(v) => set("timezone", v)}
          />
          <SelectRow
            label={t("language")}
            description={t("languageDesc")}
            value={form.language_code ?? ""}
            options={LANGUAGE_OPTIONS}
            onChange={(v) => set("language_code", v)}
          />
          <SelectRow
            label={t("industry")}
            description={t("industryDesc")}
            value={form.industry ?? ""}
            options={INDUSTRY_OPTIONS_T}
            onChange={(v) => set("industry", v)}
          />
        </Panel>
      </div>

      {/* B — Organization Model */}
      <div>
        <SectionLabel>{t("sectionB")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("employeeCountRange")}
            description={t("employeeCountRangeDesc")}
            value={form.employee_count_range ?? ""}
            options={EMPLOYEE_RANGE_OPTIONS}
            onChange={(v) => set("employee_count_range", v)}
          />
          <ToggleRow
            label={t("hasManagers")}
            description={t("hasManagersDesc")}
            checked={!!form.has_managers}
            onChange={(v) => set("has_managers", v)}
          />
        </Panel>
      </div>

      {/* C — Allocation & Operations */}
      <div>
        <SectionLabel>{t("sectionC")}</SectionLabel>
        <Panel>
          <SelectRow
            label={t("allocationDimensions")}
            description={t("allocationDimensionsDesc")}
            value={form.allocation_dimensions ?? "project_client_cost_center"}
            options={ALLOC_DIM_OPTIONS_T}
            onChange={(v) => set("allocation_dimensions", v)}
          />
          <ToggleRow
            label={t("splitAllocations")}
            description={t("splitAllocationsDesc")}
            checked={!!form.allow_split_allocations}
            onChange={(v) => set("allow_split_allocations", v)}
          />
        </Panel>
      </div>

      {/* D — Module Activation */}
      <div>
        <SectionLabel>{t("sectionD")}</SectionLabel>
        <Panel>
          {[
            { key: "expenses_module_enabled",          label: t("moduleExpenses"),          desc: t("moduleExpensesDesc") },
            { key: "time_allocation_module_enabled",   label: t("moduleTimeAllocation"),    desc: t("moduleTimeAllocationDesc") },
            { key: "approvals_module_enabled",         label: t("moduleApprovals"),         desc: t("moduleApprovalsDesc") },
            { key: "accounting_module_enabled",        label: t("moduleAccounting"),        desc: t("moduleAccountingDesc") },
            { key: "archive_module_enabled",           label: t("moduleArchive"),           desc: t("moduleArchiveDesc") },
          ].map(({ key, label, desc }) => (
            <ToggleRow
              key={key}
              label={label}
              description={desc}
              checked={!!form[key]}
              onChange={(v) => set(key, v)}
            />
          ))}
        </Panel>
      </div>

      {/* E — Legal Entities */}
      <div>
        <SectionLabel>{t("legalEntities")}</SectionLabel>

        {entities.length > 0 && (
          <div className="mb-2 overflow-hidden rounded-lg border border-white/[0.07]">
            <div className="grid grid-cols-[1fr_auto_auto_auto_60px] gap-x-3 border-b border-white/[0.05] bg-black/20 px-4 py-2">
              {[t("entityColName"), t("entityColRfc"), t("entityColReimb"), t("entityColInvoice"), ""].map((h, i) => (
                <span key={i} className="text-[9px] font-bold uppercase tracking-widest text-white/22">{h}</span>
              ))}
            </div>
            {entities.map((e) => (
              <div
                key={e.id}
                className="grid grid-cols-[1fr_auto_auto_auto_60px] items-center gap-x-3 border-b border-white/[0.04] px-4 py-2.5 last:border-0 hover:bg-white/[0.02]"
              >
                <div>
                  <p className="text-[11px] font-medium text-white/65">{e.entity_name}</p>
                  {e.entity_code && <p className="font-mono text-[9px] text-white/25">{e.entity_code}</p>}
                </div>
                <span className="font-mono text-[10px] text-white/40">{e.rfc || "—"}</span>
                <span className={`text-[10px] ${e.is_reimbursement_entity ? "text-emerald-400/70" : "text-white/18"}`}>
                  {e.is_reimbursement_entity ? "✓" : "—"}
                </span>
                <span className={`text-[10px] ${e.is_invoice_receiver_entity ? "text-emerald-400/70" : "text-white/18"}`}>
                  {e.is_invoice_receiver_entity ? "✓" : "—"}
                </span>
                <div className="flex items-center gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => { setEditingEntity(e); setAddingEntity(false); }}
                    className="text-white/25 hover:text-white/55 transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntity(e.id)}
                    disabled={deletingId === e.id}
                    className="text-white/20 hover:text-red-400/60 transition-colors disabled:opacity-40"
                  >
                    {deletingId === e.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <Trash2 className="h-3 w-3" />
                    }
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
            className="mt-1 flex items-center gap-1.5 rounded border border-white/[0.07] px-3 py-1.5 text-[10px] text-white/35 transition-colors hover:border-white/[0.12] hover:text-white/55"
          >
            <Plus className="h-3 w-3" /> {t("addLegalEntity")}
          </button>
        )}
      </div>

    </div>
  );
}
