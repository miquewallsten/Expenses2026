"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import AdminCompanySetupStudio from "@/components/admin/AdminCompanySetupStudio";
import AdminCompanySetupCopilot from "@/components/admin/AdminCompanySetupCopilot";
import AdminOnboardingPanel from "@/components/admin/AdminOnboardingPanel";
import AdminPoliciesPanel from "@/components/admin/AdminPoliciesPanel";
import AdminWorkflowMapPanel from "@/components/admin/AdminWorkflowMapPanel";
import AdminAccountingTabsPanel from "@/components/admin/AdminAccountingTabsPanel";
import AdminAccountingCopilot from "@/components/admin/AdminAccountingCopilot";
import AdminSetupOrchestratorPanel from "@/components/admin/AdminSetupOrchestratorPanel";
import AdminRolesPanel from "@/components/admin/AdminRolesPanel";
import AdminPermissionsPanel from "@/components/admin/AdminPermissionsPanel";
import { getPortalConfigConflicts } from "@/lib/portal-config-conflicts";
import AdminModulesPanel from "@/components/admin/AdminModulesPanel";
import AdminUsersPanel from "@/components/admin/AdminUsersPanel";
import AdminAuthSettingsPanel from "@/components/admin/AdminAuthSettingsPanel";
import AdminChannelsPanel from "@/components/admin/AdminChannelsPanel";
import AdminReportCyclePanel from "@/components/admin/AdminReportCyclePanel";
import {
  Building2, FileText, GitBranch, ShieldCheck, Puzzle, Key, Lock,
  AlertTriangle, Calculator, Bot, Save, Loader2, FolderOutput, Archive, Users, Radio, CalendarClock, HardDrive, Sparkles,
} from "lucide-react";
import { getCurrentRole, getCurrentUserId, getCurrentCompanyId, getStoredSession, getAuthHeaders } from "@/lib/session";
import { buildGlobalNav, GlobalNavItem } from "@/lib/navigation";
import AdminOverviewPanel from "@/components/admin/AdminOverviewPanel";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

const WORKLIST_ITEMS = [
  "Overview",
  "Onboarding",
  "Company Setup",
  "Policies",
  "Accounting Setup",
  "Workflow",
  "Report Cycle",
  "Export Config",
  "Archive Config",
  "Storage Config",
  "Channels",
  "Users",
  "Roles",
  "Permissions",
  "Add-Ons",
  "Authentication",
] as const;
type WorklistItem = typeof WORKLIST_ITEMS[number];

const WORKLIST_GROUPS: { label: string; items: WorklistItem[] }[] = [
  { label: "Setup", items: ["Overview", "Onboarding", "Company Setup", "Policies", "Accounting Setup", "Workflow", "Report Cycle"] },
  { label: "Intake & Notifications", items: ["Channels"] },
  { label: "Data Out", items: ["Export Config", "Archive Config", "Storage Config"] },
  { label: "Administration", items: ["Users", "Roles", "Permissions", "Add-Ons", "Authentication"] },
];

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoleRead {
  id: number;
  company_id: number;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface PermissionRead {
  id: number;
  key: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface WorkflowStageRead {
  id: number;
  company_id: number;
  module_key: string;
  stage_key: string;
  stage_name: string;
  stage_order: number;
  is_terminal: boolean;
  created_at: string;
}

interface WorkflowTransitionRead {
  id: number;
  company_id: number;
  module_key: string;
  from_stage_key: string;
  to_stage_key: string;
  action_key: string;
  required_permission_key: string;
  created_at: string;
}

interface CompanyModuleRead {
  id: number;
  company_id: number;
  module_key: string;
  enabled: boolean;
  config_json: string | null;
  created_at: string;
}
// ── Orchestrator types ───────────────────────────────────────────────────────

interface OrchestratorPatches {
  company_setup:    Record<string, any>;
  expense_policy:   Record<string, any>;
  accounting_setup: Record<string, any>;
  approval_setup:   Record<string, any>;
  workflow_setup:   Record<string, any>;
}

interface OrchestratorResult {
  summary: string;
  suggested_patches: OrchestratorPatches;
}
// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count?: number }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      {count !== undefined && (
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {count}
        </span>
      )}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-xs text-white/20 italic">{text}</p>;
}

// ── Panel: Export Config ──────────────────────────────────────────────────────

const BUNDLE_PREVIEW_TOKENS: Record<string, string> = {
  company_id: "1",
  date: "2026-04-18",
  year: "2026",
  month: "04",
};

function renderBundlePreview(pattern: string): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => BUNDLE_PREVIEW_TOKENS[key] ?? `{${key}}`);
}

function AdminExportConfigPanel({
  companyId,
  config,
  onSaved,
}: {
  companyId: number;
  config: { bundle_name_pattern: string; export_format: string } | null;
  onSaved: (c: { bundle_name_pattern: string; export_format: string }) => void;
}) {
  const [bundlePattern, setBundlePattern] = useState(
    config?.bundle_name_pattern ?? "company{company_id}_{date}_export_bundle"
  );
  const [exportFormat, setExportFormat] = useState(config?.export_format ?? "json");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`${API}/admin/export-config/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_name_pattern: bundlePattern, export_format: exportFormat }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved({ bundle_name_pattern: data.bundle_name_pattern, export_format: data.export_format });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const t = useTranslations("admin");
  const tc = useTranslations("common");
  return (
    <div className="max-w-lg">
      <SectionHeader title={t("exportConfig.title")} />
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        <div className="border-b border-white/[0.05] px-4 py-3">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("exportConfig.bundleNamePattern")}</span>
            <span className="font-mono text-[9px] text-white/18">{"{ company_id }  { date }  { year }  { month }"}</span>
          </div>
          <input
            type="text"
            value={bundlePattern}
            onChange={(e) => { setBundlePattern(e.target.value); setSaved(false); }}
            className="w-full rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-white/20"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-widest text-white/20">Preview</span>
            <span className="font-mono text-[10px] text-sky-300/60">{renderBundlePreview(bundlePattern)}</span>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{t("exportConfig.exportFormat")}</span>
          </div>
          <div className="flex gap-2">
            {(["json", "csv"] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => { setExportFormat(fmt); setSaved(false); }}
                className={`rounded border px-3 py-1 font-mono text-[11px] transition-colors ${
                  exportFormat === fmt
                    ? "border-sky-500/30 bg-sky-500/[0.12] text-sky-300/80"
                    : "border-white/[0.07] bg-black/20 text-white/40 hover:text-white/60"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tc("saving")}</> : <><Save className="h-3 w-3" /> {tc("save")}</>}
        </button>
        {saved  && <span className="text-[10px] text-emerald-400/60">{tc("saved")}</span>}
        {error  && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}

// ── Panel: Archive Config ────────────────────────────────────────────────────

const ARCHIVE_PREVIEW_TOKENS: Record<string, string> = {
  company: "acme",
  date: "2026-04-17",
  expense_id: "42",
  year: "2026",
  month: "04",
  day: "17",
  filename: "receipt",
};

function renderArchivePreview(pattern: string): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key) => ARCHIVE_PREVIEW_TOKENS[key] ?? `{${key}}`);
}

function AdminArchiveConfigPanel({
  companyId,
  config,
  onSaved,
}: {
  companyId: number;
  config: { file_pattern: string; folder_pattern: string } | null;
  onSaved: (c: { file_pattern: string; folder_pattern: string }) => void;
}) {
  const [filePattern,   setFilePattern]   = useState(config?.file_pattern   ?? "{company}_{date}_{expense_id}");
  const [folderPattern, setFolderPattern] = useState(config?.folder_pattern ?? "{year}/{month}");
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);
  const [saved,  setSaved]  = useState(false);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const res = await fetch(`${API}/admin/archive-config/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_pattern: filePattern, folder_pattern: folderPattern }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved({ file_pattern: data.file_pattern, folder_pattern: data.folder_pattern });
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const ta = useTranslations("admin");
  const tc = useTranslations("common");
  const fields: { label: string; value: string; set: (v: string) => void; tokens: string }[] = [
    {
      label: ta("archiveConfig.filePattern"),
      value: filePattern,
      set: setFilePattern,
      tokens: "{company}  {date}  {expense_id}  {filename}",
    },
    {
      label: ta("archiveConfig.folderPattern"),
      value: folderPattern,
      set: setFolderPattern,
      tokens: "{year}  {month}  {company}",
    },
  ];

  return (
    <div className="max-w-lg">
      <SectionHeader title={ta("archiveConfig.title")} />
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        {fields.map(({ label, value, set, tokens }) => (
          <div key={label} className="border-b border-white/[0.05] px-4 py-3 last:border-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-white/30">{label}</span>
              <span className="font-mono text-[9px] text-white/18">{tokens}</span>
            </div>
            <input
              type="text"
              value={value}
              onChange={(e) => { set(e.target.value); setSaved(false); }}
              className="w-full rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[11px] text-white/70 outline-none focus:border-white/20"
            />
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-widest text-white/20">Preview</span>
              <span className="font-mono text-[10px] text-sky-300/60">{renderArchivePreview(value)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tc("saving")}</> : <><Save className="h-3 w-3" /> {tc("save")}</>}
        </button>
        {saved  && <span className="text-[10px] text-emerald-400/60">{tc("saved")}</span>}
        {error  && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}

// ── Panel: Storage Config ────────────────────────────────────────────────────

type StorageBackend = "local" | "nas" | "s3" | "azure";

type StorageConfigState = {
  backend: string;
  local_path: string | null;
  endpoint_url: string | null;
  bucket: string | null;
  prefix: string | null;
  region: string | null;
  azure_account: string | null;
  azure_container: string | null;
};

function AdminStorageConfigPanel({
  companyId,
  config,
  onSaved,
}: {
  companyId: number;
  config: StorageConfigState | null;
  onSaved: (c: StorageConfigState) => void;
}) {
  const ta = useTranslations("admin");
  const tc = useTranslations("common");

  const [backend,        setBackend]        = useState<StorageBackend>((config?.backend as StorageBackend) ?? "local");
  const [localPath,      setLocalPath]      = useState(config?.local_path      ?? "./storage");
  const [endpointUrl,    setEndpointUrl]    = useState(config?.endpoint_url    ?? "");
  const [bucket,         setBucket]         = useState(config?.bucket          ?? "");
  const [prefix,         setPrefix]         = useState(config?.prefix          ?? "");
  const [region,         setRegion]         = useState(config?.region          ?? "us-east-1");
  const [azureAccount,   setAzureAccount]   = useState(config?.azure_account   ?? "");
  const [azureContainer, setAzureContainer] = useState(config?.azure_container ?? "");
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false);
    try {
      const body: Record<string, string | null> = { backend };
      if (backend === "local" || backend === "nas") {
        body.local_path = localPath || "./storage";
      }
      if (backend === "s3") {
        body.endpoint_url = endpointUrl || null;
        body.bucket       = bucket;
        body.prefix       = prefix || null;
        body.region       = region || "us-east-1";
      }
      if (backend === "azure") {
        body.azure_account   = azureAccount;
        body.azure_container = azureContainer;
        body.endpoint_url    = endpointUrl || null;
      }
      const res = await fetch(`${API}/admin/storage-config/${companyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      onSaved(data);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1";
  const inputCls = "w-full rounded border border-white/[0.07] bg-black/20 px-2.5 py-1.5 text-[11px] text-white/70 outline-none focus:border-white/20";

  return (
    <div className="max-w-lg space-y-5">
      <SectionHeader title={ta("storageConfig.title")} />

      {/* Backend selector */}
      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        <div className="border-b border-white/[0.05] px-4 py-3">
          <span className={labelCls}>{ta("storageConfig.backend")}</span>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {(["local", "nas", "s3", "azure"] as StorageBackend[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => { setBackend(b); setSaved(false); }}
                className={`rounded border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                  backend === b
                    ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200"
                    : "border-white/[0.07] bg-white/[0.03] text-white/35 hover:border-white/15 hover:text-white/55"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Local / NAS fields */}
        {(backend === "local" || backend === "nas") && (
          <div className="px-4 py-3">
            <label className={labelCls}>{ta("storageConfig.localPath")}</label>
            <input type="text" value={localPath} onChange={(e) => { setLocalPath(e.target.value); setSaved(false); }} className={inputCls} placeholder="./storage" />
            <p className="mt-1.5 text-[10px] text-white/25">{ta("storageConfig.localPathHint")}</p>
          </div>
        )}

        {/* S3 fields */}
        {backend === "s3" && (
          <>
            <div className="border-b border-white/[0.05] px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.bucket")}</label>
              <input type="text" value={bucket} onChange={(e) => { setBucket(e.target.value); setSaved(false); }} className={inputCls} placeholder="my-bucket" />
            </div>
            <div className="border-b border-white/[0.05] px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.endpointUrl")}</label>
              <input type="text" value={endpointUrl} onChange={(e) => { setEndpointUrl(e.target.value); setSaved(false); }} className={inputCls} placeholder="https://s3.amazonaws.com (leave blank for AWS)" />
            </div>
            <div className="border-b border-white/[0.05] px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.region")}</label>
              <input type="text" value={region} onChange={(e) => { setRegion(e.target.value); setSaved(false); }} className={inputCls} placeholder="us-east-1" />
            </div>
            <div className="px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.prefix")}</label>
              <input type="text" value={prefix} onChange={(e) => { setPrefix(e.target.value); setSaved(false); }} className={inputCls} placeholder="archives/ (optional)" />
            </div>
          </>
        )}

        {/* Azure fields */}
        {backend === "azure" && (
          <>
            <div className="border-b border-white/[0.05] px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.azureAccount")}</label>
              <input type="text" value={azureAccount} onChange={(e) => { setAzureAccount(e.target.value); setSaved(false); }} className={inputCls} placeholder="mystorageaccount" />
            </div>
            <div className="border-b border-white/[0.05] px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.azureContainer")}</label>
              <input type="text" value={azureContainer} onChange={(e) => { setAzureContainer(e.target.value); setSaved(false); }} className={inputCls} placeholder="documents" />
            </div>
            <div className="px-4 py-3">
              <label className={labelCls}>{ta("storageConfig.endpointUrl")}</label>
              <input type="text" value={endpointUrl} onChange={(e) => { setEndpointUrl(e.target.value); setSaved(false); }} className={inputCls} placeholder="https://<account>.blob.core.windows.net (leave blank for default)" />
            </div>
          </>
        )}
      </div>

      {/* Secrets notice */}
      {(backend === "s3" || backend === "azure") && (
        <div className="rounded border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5">
          <p className="text-[10px] leading-relaxed text-amber-300/60">
            {ta("storageConfig.secretsNotice")}
          </p>
          <div className="mt-2 space-y-0.5 font-mono text-[9px] text-amber-300/40">
            {backend === "s3" && (
              <>
                <div>ARCHIVE_OBJECT_ACCESS_KEY=…</div>
                <div>ARCHIVE_OBJECT_SECRET_KEY=…</div>
              </>
            )}
            {backend === "azure" && (
              <div>AZURE_STORAGE_CONNECTION_STRING=… (or AZURE_STORAGE_KEY=…)</div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-white/[0.05] px-3 py-1.5 text-[10px] font-semibold text-white/60 transition-colors hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? <><Loader2 className="h-3 w-3 animate-spin" /> {tc("saving")}</> : <><Save className="h-3 w-3" /> {tc("save")}</>}
        </button>
        {saved && <span className="text-[10px] text-emerald-400/60">{tc("saved")}</span>}
        {error && <span className="text-[10px] text-red-400/60">{error}</span>}
      </div>
    </div>
  );
}

// ── Menu key mapping (English key → i18n key) ────────────────────────────────
const ITEM_MENU_KEY: Record<WorklistItem, string> = {
  "Overview": "overview",
  "Onboarding": "onboarding",
  "Company Setup": "companySetup",
  "Policies": "policies",
  "Accounting Setup": "accountingSetup",
  "Workflow": "workflow",
  "Report Cycle": "reportCycle",
  "Export Config": "exportConfig",
  "Archive Config": "archiveConfig",
  "Storage Config": "storageConfig",
  "Channels": "channels",
  "Users": "users",
  "Roles": "roles",
  "Permissions": "permissions",
  "Add-Ons": "addOns",
  "Authentication": "authentication",
};

const GROUP_KEY: Record<string, string> = {
  "Setup": "setup",
  "Intake & Notifications": "intakeNotifications",
  "Data Out": "dataOut",
  "Administration": "administration",
};

// ── WorkList ──────────────────────────────────────────────────────────────────

const WORKLIST_ICONS: Record<WorklistItem, React.ReactNode> = {
  "Overview": <Bot className="h-3.5 w-3.5" />,
  "Onboarding":       <Sparkles className="h-3.5 w-3.5" />,
  "Company Setup":    <Building2 className="h-3.5 w-3.5" />,
  "Policies":         <FileText className="h-3.5 w-3.5" />,
  "Accounting Setup": <Calculator className="h-3.5 w-3.5" />,
  "Workflow":         <GitBranch className="h-3.5 w-3.5" />,
  "Report Cycle":     <CalendarClock className="h-3.5 w-3.5" />,
  "Export Config":    <FolderOutput className="h-3.5 w-3.5" />,
  "Archive Config":   <Archive className="h-3.5 w-3.5" />,
  "Storage Config":   <HardDrive className="h-3.5 w-3.5" />,
  "Channels":         <Radio className="h-3.5 w-3.5" />,
  Users:              <Users className="h-3.5 w-3.5" />,
  Roles:              <ShieldCheck className="h-3.5 w-3.5" />,
  Permissions:        <Key className="h-3.5 w-3.5" />,
  "Add-Ons":          <Puzzle className="h-3.5 w-3.5" />,
  Authentication:     <Lock className="h-3.5 w-3.5" />,
};

function WorkList({
  active,
  onSelect,
  roles,
  permissions,
  enabledModulesCount,
  users,
  hasCompanySetup,
  hasExpensePolicy,
  hasAccountingSetup,
  hasApprovalSetup,
  hasWorkflowSetup,
  hasExportConfig,
  hasArchiveConfig,
  hasStorageConfig,
  onboardingChecklist,
  conflictsCount,
  draftSections,
}: {
  active: WorklistItem;
  onSelect: (s: WorklistItem) => void;
  roles: RoleRead[];
  permissions: PermissionRead[];
  enabledModulesCount: number;
  users: { id: number }[];
  hasCompanySetup: boolean;
  hasExpensePolicy: boolean;
  hasAccountingSetup: boolean;
  hasApprovalSetup: boolean;
  hasWorkflowSetup: boolean;
  hasExportConfig: boolean;
  hasArchiveConfig: boolean;
  hasStorageConfig: boolean;
  onboardingChecklist: { passed: number; total: number; go_live_ready: boolean } | null;
  conflictsCount: number;
  draftSections: Set<string>;
}) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");
  const unconfiguredSetupCount = [
    hasCompanySetup, hasExpensePolicy, hasAccountingSetup, hasApprovalSetup, hasWorkflowSetup,
  ].filter((v) => !v).length;

  const counts: Record<WorklistItem, number | string> = {
    "Overview": conflictsCount > 0 ? conflictsCount : unconfiguredSetupCount > 0 ? unconfiguredSetupCount : "✓",
    "Onboarding":       onboardingChecklist
      ? (onboardingChecklist.go_live_ready ? "✓" : `${onboardingChecklist.passed}/${onboardingChecklist.total}`)
      : "—",
    "Company Setup":    hasCompanySetup    ? "✓" : "—",
    "Policies":         hasExpensePolicy   ? "✓" : "—",
    "Accounting Setup": hasAccountingSetup ? "✓" : "—",
    "Workflow":         (hasApprovalSetup && hasWorkflowSetup) ? "✓" : "—",
    "Report Cycle":     "→",
    "Export Config":    hasExportConfig    ? "✓" : "—",
    "Archive Config":   hasArchiveConfig   ? "✓" : "—",
    "Storage Config":   hasStorageConfig   ? "✓" : "—",
    "Channels":         "→",
    Users:              users.length,
    Roles:              roles.length,
    Permissions:        permissions.length,
    "Add-Ons":          enabledModulesCount,
    Authentication:     "✓",
  };

  return (
    <div className="py-1">
      {WORKLIST_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="px-4 pb-0.5 pt-3 first:pt-2">
            <span className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-white/18">
              {t(`groups.${GROUP_KEY[group.label] ?? group.label.toLowerCase()}`)}
            </span>
          </div>
          {group.items.map((item) => {
            const isActive = active === item;
            const count = counts[item];
            const hasDraft = draftSections.has(item);
            const isConflict = item === "Overview" && conflictsCount > 0;
            return (
              <button
                key={item}
                onClick={() => onSelect(item)}
                className={`flex w-full items-center gap-2 px-3.5 py-[7px] text-left transition-colors ${
                  isActive
                    ? "bg-white/[0.07] text-white/90"
                    : "text-white/42 hover:bg-white/[0.035] hover:text-white/65"
                }`}
              >
                {/* Active indicator strip */}
                <span
                  className={`h-3.5 w-0.5 shrink-0 rounded-full transition-colors ${
                    isActive ? "bg-indigo-400/60" : "bg-transparent"
                  }`}
                />
                <span className={isActive ? "text-white/60" : "text-white/22"}>
                  {WORKLIST_ICONS[item]}
                </span>
                <span className="flex-1 truncate text-[11px] font-medium tracking-[-0.01em]">{t(`menu.${ITEM_MENU_KEY[item]}`)}</span>
                {hasDraft && (
                  <span className="rounded border border-violet-500/20 bg-violet-500/[0.08] px-1 py-0.5 text-[7.5px] font-semibold uppercase tracking-wide text-violet-300/50">
                    {tc("draft")}
                  </span>
                )}
                <span
                  className={`font-mono text-[9.5px] tabular-nums ${
                    isConflict ? "text-amber-400/65" : "text-white/22"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── AI Hints sidebar ────────────────────────────────────────────────────────

function AdminAIHints({
  section,
  rolesCount,
  permissionsCount,
  stagesCount,
  transitionsCount,
  enabledModulesCount,
  expensePolicy,
  accountingSetup,
  approvalSetup,
  workflowSetup,
}: {
  section: WorklistItem;
  rolesCount: number;
  permissionsCount: number;
  stagesCount: number;
  transitionsCount: number;
  enabledModulesCount: number;
  expensePolicy?: any;
  accountingSetup?: any;
  approvalSetup?: any;
  workflowSetup?: any;
}) {
  const hints: Record<WorklistItem, string[]> = {
    "Overview": [
      "Use the AI panel on the right to analyse your full configuration and get recommended fixes.",
    ],
    "Onboarding": [
      "Guided 5-step go-live checklist: Company, Legal Entities, Chart of Accounts, Approval Policy, Users.",
      "Progress is auto-saved — jump to any step at any time. The footer links to Agent config.",
    ],
    "Company Setup": [
      "Company identity is read from the platform database.",
      "Extended configuration (expense rules, module activation) is managed under Expense Policy and Add-Ons.",
    ],
    "Policies": expensePolicy ? [
      `XML mode: ${expensePolicy.xml_required_mode}. Tickets ${expensePolicy.tickets_allowed ? "allowed" : "not allowed"}.`,
      expensePolicy.manager_approval_required
        ? "Manager approval is required before accounting review."
        : "Manager approval is disabled. Expenses go directly to accounting.",
      !expensePolicy.require_justification && !expensePolicy.require_proof
        ? "Neither justification nor proof is required. Consider enabling at least one for audit trails."
        : "Justification or proof requirements are active. Employees must attach supporting documents.",
    ] : [
      "No expense policy loaded yet. Save the form to initialise defaults.",
    ],
    "Accounting Setup": accountingSetup ? [
      `Accounting review mode: ${accountingSetup.accounting_review_mode ?? "—"}.`,
      accountingSetup.poliza_required
        ? "Poliza XML is required. Ensure all expenses have CFDI documents before export."
        : "Poliza is not required. Accounting export will proceed without XML validation.",
      accountingSetup.project_required || accountingSetup.cost_center_required
        ? "Project or cost center is required on expenses — employees must allocate correctly."
        : "No allocation dimensions are required. Consider enabling for audit trails.",
    ] : [
      "Accounting setup not loaded.",
    ],
    "Workflow": [
      ...(approvalSetup ? [
        `Approval mode: ${(approvalSetup.approval_mode ?? "none").replace(/_/g, " ")}.`,
        approvalSetup.escalate_policy_failures_to_accounting
          ? "Policy failures escalate to accounting automatically."
          : "Policy failures do not escalate — review manually or enable escalation.",
      ] : ["Approval setup not loaded."]),
      ...(workflowSetup ? [
        `Workflow mode: ${(workflowSetup.default_expense_workflow_mode ?? "standard").replace(/_/g, " ")}.`,
        workflowSetup.block_submit_on_failed_validation
          ? "Submission is blocked on failed validation."
          : "Failed validation does not block submission — review routing rules.",
      ] : ["Workflow setup not loaded."]),
    ],
    "Report Cycle": [
      "Configure when expense reports are automatically created for each user.",
      "Validated expenses sit in a holding state until the cycle fires — then they are bundled per user and submitted for approval.",
      "Use 'Run now' to trigger a cycle immediately. Use the title template tokens: {user}, {month}, {year}.",
    ],
    Roles: [
      rolesCount === 0
        ? "No roles created. Define at least an Employee and Manager role to enable approval workflows."
        : `${rolesCount} role${rolesCount !== 1 ? "s" : ""} configured.`,
      "Assign permissions to roles to enforce least-privilege access across expense and approval workflows.",
    ],
    Permissions: [
      permissionsCount === 0
        ? "No permissions defined. Create permission keys like submit_expense and approve_expense first."
        : `${permissionsCount} permission${permissionsCount !== 1 ? "s" : ""} defined.`,
      "Use snake_case keys that mirror the action name for easy readability in audit logs.",
    ],
    Users: [
      "Create users here so they can log in via magic link.",
      "Each user must have an email address and a role — employee, manager, accounting, or admin.",
      "Changing a role takes effect immediately. The user's existing session will reflect the new role on next login.",
    ],
    "Export Config": [
      "Controls how export bundle names are generated per company.",
      "Use {company_id}, {date}, {year}, {month} as tokens in the bundle name pattern.",
      "export_format determines serialisation — json (default) or csv.",
    ],
    "Archive Config": [
      "Controls how archived file names and storage paths are structured per company.",
      "Use {company}, {date}, {expense_id}, {year}, {month}, {filename} as tokens.",
      "Changes apply to all new uploads — existing archived files are not renamed.",
    ],
    "Storage Config": [
      "Controls where archived files are physically stored — local disk, NAS, S3, or Azure Blob.",
      "Switching backends only affects new uploads. Existing files stay where they were originally written.",
      "Test the connection after saving to confirm credentials and bucket/container access.",
    ],
    "Channels": [
      "WhatsApp and email channels share the same AI agent — expenses, approvals, and queries work identically via both.",
      "WhatsApp identity is anchored to the employee's email address via a one-time OTP challenge.",
      "The webhook verify token and URL are generated automatically on first save — copy them into the Meta App Dashboard.",
    ],
    "Add-Ons": [
      `${enabledModulesCount} module${enabledModulesCount !== 1 ? "s" : ""} currently active for this company.`,
      "Enable Expenses before Accounting — poliza export depends on expense records.",
      "Inactive modules are hidden from employees. No data is deleted when a module is disabled.",
    ],
    Authentication: [
      "Configure SSO, magic-link, and session expiry settings for your company.",
      "Changes to authentication settings take effect immediately for all new sessions.",
    ],
  };

  const t = useTranslations("admin");
  const items = hints[section] ?? [];

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">{t("copilotLabel")}</p>
        <p className="text-[11px] text-white/40 leading-relaxed">
          {t("reviewing", { section })}.
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-white/[0.07]">
        <div className="grid grid-cols-2 divide-x divide-white/[0.05] border-b border-white/[0.05]">
          <div className="px-3 py-2.5 text-center">
            <p className="font-mono text-base font-bold text-white">{rolesCount}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/25">{t("stats.roles")}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="font-mono text-base font-bold text-white">{permissionsCount}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/25">{t("stats.permissions")}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-white/[0.05]">
          <div className="px-3 py-2.5 text-center">
            <p className="font-mono text-base font-bold text-white">{stagesCount}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/25">{t("stats.stages")}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="font-mono text-base font-bold text-white">{transitionsCount}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/25">{t("stats.transactions")}</p>
          </div>
          <div className="px-3 py-2.5 text-center">
            <p className="font-mono text-base font-bold text-white">{enabledModulesCount}</p>
            <p className="text-[9px] uppercase tracking-widest text-white/25">{t("stats.modules")}</p>
          </div>
        </div>
      </div>

      {items.map((hint, i) => (
        <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400/50" />
          <p className="text-[11px] text-white/40 leading-relaxed">{hint}</p>
        </div>
      ))}
    </div>
  );
}

// ── Orchestrator patch summary ─────────────────────────────────────────────────────────

const PATCH_SECTION_DEFS: { key: keyof OrchestratorPatches; menuKey: string }[] = [
  { key: "company_setup",    menuKey: "companySetup" },
  { key: "expense_policy",   menuKey: "expensePolicy" },
  { key: "accounting_setup", menuKey: "accountingSetup" },
  { key: "approval_setup",   menuKey: "approvalSetup" },
  { key: "workflow_setup",   menuKey: "workflowSetup" },
];

function patchVal(v: any): string {
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (v === null || v === undefined) return "—";
  return String(v).replace(/_/g, " ");
}

function OrchestratorPatchSummary({
  result,
  onApply,
}: {
  result: OrchestratorResult;
  onApply: (patches: OrchestratorPatches) => void;
}) {
  const t = useTranslations("admin");
  const [applied, setApplied] = useState(false);

  const totalPatches = PATCH_SECTION_DEFS.reduce(
    (n, s) => n + Object.keys(result.suggested_patches[s.key] ?? {}).length,
    0,
  );

  if (totalPatches === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-white">{t("aiSuggestedPatches")}</h2>
        <span className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-white/30">
          {t("changes", { n: totalPatches })}
        </span>
      </div>

      {result.summary && (
        <p className="text-[11px] text-white/35 leading-relaxed">{result.summary}</p>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        {PATCH_SECTION_DEFS.map(({ key, menuKey }) => {
          const entries = Object.entries(result.suggested_patches[key] ?? {});
          if (entries.length === 0) return null;
          return (
            <div key={key} className="overflow-hidden rounded-lg border border-white/[0.07]">
              <div className="flex items-center justify-between border-b border-white/[0.05] bg-black/20 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">{t(`menu.${menuKey}`)}</p>
                <span className="rounded border border-white/[0.07] bg-white/[0.03] px-1 py-0 font-mono text-[9px] text-white/30">
                  {entries.length}
                </span>
              </div>
              {entries.map(([field, value]) => (
                <div
                  key={field}
                  className="flex items-center justify-between border-b border-white/[0.04] px-3 py-2 last:border-0"
                >
                  <span className="text-[10px] text-white/35">{field.replace(/_/g, " ")}</span>
                  <span className="text-[10px] font-medium text-violet-300/70">{patchVal(value)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => { onApply(result.suggested_patches); setApplied(true); }}
        disabled={applied}
        className="inline-flex items-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {applied ? t("draftsApplied") : t("applyDrafts")}
      </button>
    </div>
  );
}
// ── Page ──────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();
  useEffect(() => {
    const session = getStoredSession();
    const userId  = session?.userId ?? getCurrentUserId();
    const role    = session?.role   ?? getCurrentRole();
    if (!userId) { router.replace("/login"); return; }
    if (role !== "admin") { router.replace("/mywork"); }
  }, [router]);
  const tAdmin = useTranslations("admin");
  const tcAdmin = useTranslations("common");
  const [activeSection, setActiveSection] = useState<WorklistItem>("Overview");
  const adminCompanyId = Number(getCurrentCompanyId() ?? 1);

  // ── Lists not covered by portal config ──────────────────────────────────────
  const [roles, setRoles]               = useState<RoleRead[]>([]);
  const [permissions, setPermissions]   = useState<PermissionRead[]>([]);
  const [stages, setStages]             = useState<WorkflowStageRead[]>([]);
  const [transitions, setTransitions]   = useState<WorkflowTransitionRead[]>([]);
  const [companyModules, setCompanyModules] = useState<CompanyModuleRead[]>([]);
  const [legalEntities, setLegalEntities]   = useState<any[]>([]);
  const [users, setUsers]               = useState<any[]>([]);
  const [onboardingChecklist, setOnboardingChecklist] = useState<{ passed: number; total: number; go_live_ready: boolean } | null>(null);

  // ── Mutable edit states — seeded from portalConfig, updated on form save ────
  const [expensePolicy, setExpensePolicy]   = useState<any>(null);
  const [companySetup, setCompanySetup]     = useState<any>(null);
  const [accountingSetup, setAccountingSetup] = useState<any>(null);
  const [approvalSetup, setApprovalSetup]   = useState<any>(null);
  const [workflowSetup, setWorkflowSetup]   = useState<any>(null);
  const [exportConfig, setExportConfig]     = useState<{ bundle_name_pattern: string; export_format: string } | null>(null);
  const [archiveConfig, setArchiveConfig]   = useState<{ file_pattern: string; folder_pattern: string } | null>(null);
  const [storageConfig, setStorageConfig]   = useState<{ backend: string; local_path: string | null; endpoint_url: string | null; bucket: string | null; prefix: string | null; region: string | null; azure_account: string | null; azure_container: string | null } | null>(null);

  // ── Draft patches for copilot apply-draft buttons ───────────────────────────
  const [companySetupDraftPatch, setCompanySetupDraftPatch]         = useState<Partial<any> | undefined>(undefined);
  const [expensePolicyDraftPatch, setExpensePolicyDraftPatch]       = useState<Partial<any> | undefined>(undefined);
  const [approvalSetupDraftPatch, setApprovalSetupDraftPatch]       = useState<Partial<any> | undefined>(undefined);
  const [workflowSetupDraftPatch, setWorkflowSetupDraftPatch]       = useState<Partial<any> | undefined>(undefined);
  const [accountingSetupDraftPatch, setAccountingSetupDraftPatch]   = useState<Partial<any> | undefined>(undefined);
  const [exportConfigDraftPatch, setExportConfigDraftPatch]         = useState<Partial<any> | undefined>(undefined);
  const [archiveConfigDraftPatch, setArchiveConfigDraftPatch]       = useState<Partial<any> | undefined>(undefined);

  // ── Nav + portal config ──────────────────────────────────────────────────────
  const [globalNavItems, setGlobalNavItems] = useState<GlobalNavItem[]>([]);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [portalConfig, setPortalConfig]     = useState<any>(null);  const [orchestratorResult, setOrchestratorResult] = useState<OrchestratorResult | null>(null);
  const [savingAllDrafts, setSavingAllDrafts] = useState(false);
  const [saveAllError, setSaveAllError]       = useState<string | null>(null);
  // ── Permission fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    const userId = getCurrentUserId();
    if (!userId) return;
    fetch(`${API}/roles/user-permissions/${userId}`, { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : { permission_keys: [] })
      .catch(() => ({ permission_keys: [] }))
      .then((d) => setPermissionKeys(d.permission_keys ?? []));
  }, []);

  // ── Portal config — primary source for setup data + banner ──────────────────
  useEffect(() => {
    const companyId = getCurrentCompanyId() ?? "1";
    fetch(`${API}/admin/portal-config/${companyId}`, { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((cfg: any) => {
        if (!cfg) return;
        setPortalConfig(cfg);
        // Seed mutable edit states so forms are populated immediately.
        if (cfg.expense_policy)   setExpensePolicy(cfg.expense_policy);
        if (cfg.company_setup)    setCompanySetup(cfg.company_setup);
        if (cfg.accounting_setup) setAccountingSetup(cfg.accounting_setup);
        if (cfg.approval_setup)   setApprovalSetup(cfg.approval_setup);
        if (cfg.workflow_setup)   setWorkflowSetup(cfg.workflow_setup);
        if (cfg.export_config)    setExportConfig(cfg.export_config);
        if (cfg.archive_config)   setArchiveConfig(cfg.archive_config);
      });
    fetch(`${API}/admin/storage-config/${adminCompanyId}`, { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((d: any) => { if (d) setStorageConfig(d); });
  }, []);

  // ── Reactive nav from portalConfig + permissionKeys ─────────────────────────
  useEffect(() => {
    const role = getCurrentRole();
    setGlobalNavItems(
      buildGlobalNav({
        role,
        enabledModuleKeys: portalConfig?.derived?.enabled_modules ?? [],
        permissionKeys,
        currentPortal: "admin",
      })
    );
  }, [portalConfig, permissionKeys]);

  // ── Dedicated export-config fetch ────────────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/admin/export-config/${adminCompanyId}`, { headers: getAuthHeaders() })
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((d: any) => {
        if (d) setExportConfig({ bundle_name_pattern: d.bundle_name_pattern, export_format: d.export_format });
      });
  }, []);

  // ── Supplemental data not in portal config ───────────────────────────────────
  // Roles list, permission definitions, workflow graph, company modules, legal entities.
  useEffect(() => {
    const stored = getStoredSession();
    const h: Record<string, string> = stored
      ? { Authorization: `Bearer ${stored.token}` }
      : { "X-User-Id": String(getCurrentUserId() ?? 1) };
    Promise.all([
      fetch(`${API}/roles/`,                                                          { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/roles/permissions`,                                               { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/workflows/stages?company_id=${adminCompanyId}&module_key=expenses`,       { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/workflows/transitions?company_id=${adminCompanyId}&module_key=expenses`,  { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/modules/company/${adminCompanyId}`,                                       { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/admin/company-setup/${adminCompanyId}/legal-entities`,                    { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/users/?company_id=${adminCompanyId}`,                                     { headers: h }).then((r) => r.ok ? r.json() : []),
      fetch(`${API}/admin/company-setup/${adminCompanyId}/checklist`,                         { headers: h }).then((r) => r.ok ? r.json() : null),
    ]).then(([r, p, s, t, m, entities, u, checklist]) => {
      setRoles(r);
      setPermissions(p);
      setStages(s);
      setTransitions(t);
      setCompanyModules(m);
      if (Array.isArray(entities)) setLegalEntities(entities);
      if (Array.isArray(u)) setUsers(u);
      if (checklist && typeof checklist.passed === "number") setOnboardingChecklist(checklist);
    }).catch(() => {});
  }, []);

  const MODULE_FLAGS = [
    "time_allocation_module_enabled", "reimbursements_module_enabled", "archive_module_enabled",
    "subcontractor_module_enabled", "ai_copilot_enabled", "purchase_requests_module_enabled",
  ];
  const enabledModulesCount = MODULE_FLAGS.filter((f) => !!companySetup?.[f]).length;
  const conflictsCount = getPortalConfigConflicts(portalConfig ?? {}).length;

  // ── Orchestrator: merge AI patches into per-domain draft states ──────────────
  const handleOrchestratorApplyPatch = (patches: {
    company_setup:    Record<string, any>;
    expense_policy:   Record<string, any>;
    accounting_setup: Record<string, any>;
    approval_setup:   Record<string, any>;
    workflow_setup:   Record<string, any>;
  }) => {
    if (patches.company_setup    && Object.keys(patches.company_setup).length    > 0)
      setCompanySetupDraftPatch   ((p) => ({ ...(p ?? {}), ...patches.company_setup    }));
    if (patches.expense_policy   && Object.keys(patches.expense_policy).length   > 0)
      setExpensePolicyDraftPatch  ((p) => ({ ...(p ?? {}), ...patches.expense_policy   }));
    if (patches.accounting_setup && Object.keys(patches.accounting_setup).length > 0)
      setAccountingSetupDraftPatch((p) => ({ ...(p ?? {}), ...patches.accounting_setup }));
    if (patches.approval_setup   && Object.keys(patches.approval_setup).length   > 0)
      setApprovalSetupDraftPatch  ((p) => ({ ...(p ?? {}), ...patches.approval_setup   }));
    if (patches.workflow_setup   && Object.keys(patches.workflow_setup).length   > 0)
      setWorkflowSetupDraftPatch  ((p) => ({ ...(p ?? {}), ...patches.workflow_setup   }));
  };

  // ── Orchestrator analysis result handler ────────────────────────────────────
  const handleAnalysisResult = (result: OrchestratorResult) => {
    setOrchestratorResult(result);
    if (result.summary) {
      setCompanySetupDraftPatch((p) => ({
        ...(p ?? {}),
        ai_setup_last_summary: result.summary,
      }));
    }
  };

  // ── Save all drafted sections ────────────────────────────────────────────────
  const handleSaveAllDrafts = async () => {
    setSavingAllDrafts(true);
    setSaveAllError(null);
    const stored = getStoredSession();
    const authHeader: Record<string, string> = stored
      ? { Authorization: `Bearer ${stored.token}` }
      : { "X-User-Id": String(getCurrentUserId() ?? 1) };
    const headers = { "Content-Type": "application/json", ...authHeader };
    try {
      if (companySetupDraftPatch && Object.keys(companySetupDraftPatch).length > 0) {
        const body = { ...(companySetup ?? {}), ...companySetupDraftPatch };
        const res = await fetch(`${API}/admin/company-setup/${adminCompanyId}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Company Setup: ${res.status}`);
        setCompanySetup(await res.json());
        setCompanySetupDraftPatch(undefined);
      }
      if (expensePolicyDraftPatch && Object.keys(expensePolicyDraftPatch).length > 0) {
        const body = { ...(expensePolicy ?? {}), ...expensePolicyDraftPatch };
        const res = await fetch(`${API}/expenses/policy/${adminCompanyId}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Expense Policy: ${res.status}`);
        setExpensePolicy(await res.json());
        setExpensePolicyDraftPatch(undefined);
      }
      if (accountingSetupDraftPatch && Object.keys(accountingSetupDraftPatch).length > 0) {
        const body = { ...(accountingSetup ?? {}), ...accountingSetupDraftPatch };
        const res = await fetch(`${API}/admin/accounting-setup/${adminCompanyId}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Accounting Setup: ${res.status}`);
        setAccountingSetup(await res.json());
        setAccountingSetupDraftPatch(undefined);
      }
      if (approvalSetupDraftPatch && Object.keys(approvalSetupDraftPatch).length > 0) {
        const body = { ...(approvalSetup ?? {}), ...approvalSetupDraftPatch };
        const res = await fetch(`${API}/admin/approval-setup/${adminCompanyId}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Approval Setup: ${res.status}`);
        setApprovalSetup(await res.json());
        setApprovalSetupDraftPatch(undefined);
      }
      if (workflowSetupDraftPatch && Object.keys(workflowSetupDraftPatch).length > 0) {
        const body = { ...(workflowSetup ?? {}), ...workflowSetupDraftPatch };
        const res = await fetch(`${API}/admin/workflow-setup/${adminCompanyId}`, { method: "PUT", headers, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`Workflow Setup: ${res.status}`);
        setWorkflowSetup(await res.json());
        setWorkflowSetupDraftPatch(undefined);
      }
    } catch (e: any) {
      setSaveAllError(e?.message ?? "Save failed");
    } finally {
      setSavingAllDrafts(false);
    }
  };

  // ── Pending-draft set — drives worklist dot indicators ───────────────────────
  const draftSections = new Set<string>([
    ...(companySetupDraftPatch    && Object.keys(companySetupDraftPatch).length    > 0 ? ["Company Setup"]    : []),
    ...(expensePolicyDraftPatch   && Object.keys(expensePolicyDraftPatch).length   > 0 ? ["Policies"]         : []),
    ...(accountingSetupDraftPatch && Object.keys(accountingSetupDraftPatch).length > 0 ? ["Accounting Setup"] : []),
    ...((approvalSetupDraftPatch   && Object.keys(approvalSetupDraftPatch).length   > 0) ||
        (workflowSetupDraftPatch   && Object.keys(workflowSetupDraftPatch).length   > 0) ? ["Workflow"] : []),
    ...(exportConfigDraftPatch   && Object.keys(exportConfigDraftPatch).length   > 0 ? ["Export Config"]   : []),
    ...(archiveConfigDraftPatch   && Object.keys(archiveConfigDraftPatch).length   > 0 ? ["Archive Config"]   : []),
  ]);

  const detailNode = (() => {
    switch (activeSection) {
      case "Overview": {
        const hasPatch = orchestratorResult && PATCH_SECTION_DEFS.some(
          (s) => Object.keys(orchestratorResult.suggested_patches[s.key] ?? {}).length > 0,
        );
        return (
          <div className="space-y-5">
            {hasPatch && (
              <>
                <OrchestratorPatchSummary
                  key={orchestratorResult!.summary}
                  result={orchestratorResult!}
                  onApply={handleOrchestratorApplyPatch}
                />
                <div className="border-t border-white/[0.05]" />
              </>
            )}
            <AdminOverviewPanel
              portalConfig={portalConfig}
              companySetup={companySetup}
              expensePolicy={expensePolicy}
              accountingSetup={accountingSetup}
              approvalSetup={approvalSetup}
              workflowSetup={workflowSetup}
              onNavigate={setActiveSection}
            />
          </div>
        );
      }

      case "Onboarding":
        return <AdminOnboardingPanel companyId={adminCompanyId} />;

      case "Company Setup":
        return (
          <AdminCompanySetupStudio
            companyId={adminCompanyId}
            setup={companySetup ?? {}}
            legalEntities={legalEntities}
            onSaved={setCompanySetup}
            onLegalEntitiesChanged={setLegalEntities}
            draftPatch={companySetupDraftPatch}
            portalConfig={portalConfig}
          />
        );

      case "Policies":
        return (
          <AdminPoliciesPanel
            companyId={adminCompanyId}
            expensePolicy={expensePolicy ?? {}}
            onExpensePolicySaved={setExpensePolicy}
            draftPatch={expensePolicyDraftPatch}
          />
        );

      case "Accounting Setup":
        return (
          <AdminAccountingTabsPanel
            companyId={adminCompanyId}
            accountingSetup={accountingSetup ?? {}}
            companySetup={companySetup}
            expensePolicy={expensePolicy}
            onSaved={setAccountingSetup}
            draftPatch={accountingSetupDraftPatch}
          />
        );

      case "Workflow":
        return (
          <AdminWorkflowMapPanel
            companyId={adminCompanyId}
            approvalSetup={approvalSetup ?? {}}
            workflowSetup={workflowSetup ?? {}}
            companySetup={companySetup}
            expensePolicy={expensePolicy}
            accountingSetup={accountingSetup}
            onApprovalSaved={setApprovalSetup}
            onWorkflowSaved={setWorkflowSetup}
            approvalDraftPatch={approvalSetupDraftPatch}
            workflowDraftPatch={workflowSetupDraftPatch}
          />
        );

      case "Export Config":
        return (
          <AdminExportConfigPanel
            companyId={adminCompanyId}
            config={exportConfig}
            onSaved={setExportConfig}
          />
        );

      case "Archive Config":
        return (
          <AdminArchiveConfigPanel
            companyId={adminCompanyId}
            config={archiveConfig}
            onSaved={setArchiveConfig}
          />
        );

      case "Storage Config":
        return (
          <AdminStorageConfigPanel
            companyId={adminCompanyId}
            config={storageConfig}
            onSaved={setStorageConfig}
          />
        );

      case "Channels":
        return <AdminChannelsPanel companyId={adminCompanyId} />;

      case "Users":
        return (
          <AdminUsersPanel
            companyId={adminCompanyId}
            users={users}
            onUsersChanged={setUsers}
          />
        );

      case "Roles":
        return <AdminRolesPanel roles={roles} companyId={adminCompanyId} onRolesChanged={setRoles} />;

      case "Permissions":
        return <AdminPermissionsPanel permissions={permissions} onPermissionsChanged={setPermissions} />;

      case "Add-Ons":
        return <AdminModulesPanel companySetup={companySetup} onSetupChanged={setCompanySetup} />;

      case "Report Cycle":
        return <AdminReportCyclePanel companyId={adminCompanyId} />;

      case "Authentication":
        return <AdminAuthSettingsPanel companyId={adminCompanyId} />;
    }
  })();

  const aiPanelNode = (() => {
    if (activeSection === "Overview") {
      return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 p-3">
          <AdminSetupOrchestratorPanel
            companyId={adminCompanyId}
            portalConfig={portalConfig}
            onApplyPatch={handleOrchestratorApplyPatch}
            onAnalysisResult={handleAnalysisResult}
            onNavigate={(section) => setActiveSection(section as WorklistItem)}
          />
        </aside>
      );
    }

    if (activeSection === "Company Setup") {
      return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 p-3">
          <AdminCompanySetupCopilot
            companyId={adminCompanyId}
            setup={companySetup ?? {}}
            legalEntities={legalEntities}
            portalConfig={portalConfig}
            onApplySetupDraft={(patch) => setCompanySetupDraftPatch({ ...patch })}
          />
        </aside>
      );
    }

    if (activeSection === "Accounting Setup") {
      return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 p-3">
          <AdminAccountingCopilot
            companyId={adminCompanyId}
            companySetup={companySetup ?? {}}
            expensePolicy={expensePolicy ?? {}}
            accountingSetup={accountingSetup ?? {}}
            approvalSetup={approvalSetup ?? {}}
            workflowSetup={workflowSetup ?? {}}
            portalConfig={portalConfig}
            onApplyDraft={(patch) => setAccountingSetupDraftPatch({ ...patch })}
          />
        </aside>
      );
    }

    if (activeSection === "Archive Config") {
      return (
        <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 p-3">
          <div className="space-y-3">
            <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
              <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-white/22">{tAdmin("archiveNaming")}</p>
              <p className="text-[11px] text-white/40 leading-relaxed">
                {tAdmin("archiveNamingDesc")}
              </p>
            </div>
            <div className="overflow-hidden rounded-lg border border-white/[0.07]">
              <div className="border-b border-white/[0.05] bg-black/20 px-3 py-1.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-white/25">{tAdmin("availableTokens")}</p>
              </div>
              {([
                ["{company}",    "Company slug derived from display name"],
                ["{date}",       "Archive date — YYYY-MM-DD"],
                ["{expense_id}", "Linked expense id or empty string"],
                ["{year}",       "4-digit year"],
                ["{month}",      "2-digit month"],
                ["{day}",        "2-digit day"],
                ["{filename}",   "Original file stem (no extension)"],
              ] as [string, string][]).map(([token, desc]) => (
                <div key={token} className="flex items-start gap-3 border-b border-white/[0.04] px-3 py-2 last:border-0">
                  <span className="shrink-0 font-mono text-[10px] text-sky-300/70">{token}</span>
                  <span className="text-[10px] text-white/35 leading-snug">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      );
    }

    return (
      <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-white/[0.07] bg-zinc-950 p-3">
        <AdminAIHints
          section={activeSection}
          rolesCount={roles.length}
          permissionsCount={permissions.length}
          stagesCount={stages.length}
          transitionsCount={transitions.length}
          enabledModulesCount={enabledModulesCount}
          expensePolicy={expensePolicy}
          accountingSetup={accountingSetup}
          approvalSetup={approvalSetup}
          workflowSetup={workflowSetup}
        />
      </aside>
    );
  })();

  return (
    <AppShell
      title={tAdmin("title")}
      globalNavItems={[]}
      workListTitle={tAdmin("title")}
      workList={
        <WorkList
          active={activeSection}
          onSelect={setActiveSection}
          roles={roles}
          permissions={permissions}
          enabledModulesCount={enabledModulesCount}
          users={users}
          hasCompanySetup={!!companySetup}
          hasExpensePolicy={!!expensePolicy}
          hasAccountingSetup={!!accountingSetup}
          hasApprovalSetup={!!approvalSetup}
          hasWorkflowSetup={!!workflowSetup}
          hasExportConfig={!!exportConfig}
          hasArchiveConfig={!!archiveConfig}
          hasStorageConfig={!!storageConfig}
          onboardingChecklist={onboardingChecklist}
          conflictsCount={conflictsCount}
          draftSections={draftSections}
        />
      }
      detail={
        <>
          {/* Section breadcrumb — shown on non-Overview pages */}
          {activeSection !== "Overview" && (
            <div className="mb-4 flex items-center gap-1.5 border-b border-white/[0.05] pb-3">
              <span className="text-[9px] text-white/18">{tAdmin("title")}</span>
              <span className="text-[9px] text-white/12">›</span>
              <span className="text-[9px] font-semibold text-white/40">{tAdmin(`menu.${ITEM_MENU_KEY[activeSection]}`)}</span>
            </div>
          )}
          {draftSections.size > 0 && (
            <div className="mb-4 flex items-center justify-between rounded border border-violet-500/15 bg-violet-900/[0.07] px-3 py-2">
              <span className="text-[10px] text-violet-300/45">
                {tAdmin("draftSectionsPending", { count: draftSections.size })}
              </span>
              <div className="flex items-center gap-2">
                {saveAllError && (
                  <span className="text-[10px] text-red-400/60">{saveAllError}</span>
                )}
                <button
                  type="button"
                  onClick={handleSaveAllDrafts}
                  disabled={savingAllDrafts}
                  className="inline-flex items-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-2.5 py-1 text-[10px] font-semibold text-violet-300/70 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAllDrafts
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> {tcAdmin("saving")}</>
                    : <><Save className="h-3 w-3" /> {tAdmin("saveAllDrafts")}</>
                  }
                </button>
              </div>
            </div>
          )}
          {detailNode}
        </>
      }
      aiPanel={aiPanelNode}
      mergedNav
      logoUrl={companySetup?.logo_url ?? null}
    />
  );
}
