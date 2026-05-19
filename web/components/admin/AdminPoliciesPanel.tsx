"use client";

import { useEffect, useState, useCallback } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Plus, Power, RefreshCw,
  Save, Sparkles, Trash2, X, AlertCircle, FileText,
  Shield, Zap, ChevronDown, ChevronRight, Send,
} from "lucide-react";
import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel as PatternSectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { apiCall, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { useTranslations } from "next-intl";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AIPolicyRead {
  id: number;
  company_id: number;
  source_text: string;
  rule_json: Record<string, unknown>;
  summary: string;
  scope: string;
  severity: "block" | "warn";
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface PreviewResponse {
  rule_json: Record<string, unknown>;
  summary: string;
  severity: string;
  setting_suggestion: { setting_key: string; value: unknown; label?: string } | null;
  settings_snapshot: Record<string, unknown> | null;
  notice: string | null;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  expensePolicy: Record<string, any>;
  onExpensePolicySaved: (p: Record<string, any>) => void;
  draftPatch?: Partial<Record<string, any>>;
}

// ── XML option map ───────────────────────────────────────────────────────────

const XML_OPTIONS = [
  { value: "always",       label: "Siempre (CFDI requerido)" },
  { value: "mexico_only",  label: "Solo México" },
  { value: "optional",     label: "Opcional" },
  { value: "never",        label: "Nunca" },
];

// ── Rule Row ──────────────────────────────────────────────────────────────────

function RuleRow({ rule, selected, onSelect, onToggle, onDelete }: {
  rule: AIPolicyRead;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("admin.policies");
  const isBlock = rule.severity === "block";

  return (
    <div className={`group/rule rounded-md border transition-all ${
      selected ? "border-accent/30 bg-accent/5" : "border-default hover:border-strong"
    }`}>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <div className={`mt-0.5 ${isBlock ? "text-error" : "text-warning"}`}>
          {isBlock ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-medium truncate ${rule.enabled ? "text-primary" : "text-muted line-through"}`}>
            {rule.summary || rule.source_text.slice(0, 80)}
          </p>
          <p className="text-[8px] text-muted mt-0.5 truncate">{rule.source_text}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
            isBlock ? "bg-error/10 text-error border border-error/20" : "bg-warning/10 text-warning border border-warning/20"
          }`}>
            {isBlock ? "bloqueo" : "aviso"}
          </span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className={`flex h-4 w-7 items-center rounded-full border transition-colors ${
              rule.enabled ? "border-accent/40 bg-accent/20" : "border-default bg-surface-2"
            }`}
            title={rule.enabled ? t("disableRule") : t("enableRule")}
          >
            <span className={`h-3 w-3 rounded-full bg-white transition-transform ${
              rule.enabled ? "translate-x-3" : "translate-x-0.5"
            }`} />
          </button>
        </div>
        <div className="text-muted/40 group-hover/rule:text-muted transition-colors">
          {selected ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </div>
      </button>

      {selected && (
        <div className="border-t border-subtle/30 px-3 py-2.5 space-y-2">
          <div className="rounded-md bg-surface-1 border border-subtle/30 px-3 py-2">
            <p className="text-[8px] font-bold uppercase tracking-widest text-muted mb-1">{t("ruleJson")}</p>
            <pre className="text-[9px] text-secondary font-mono whitespace-pre-wrap leading-relaxed">
              {JSON.stringify(rule.rule_json, null, 2)}
            </pre>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex items-center gap-1.5 rounded-md border border-error/20 px-2.5 py-1 text-[9px] font-semibold text-error/70 transition-all hover:border-error/30 hover:bg-error/5"
            >
              <Trash2 className="h-3 w-3" /> {t("disableRule")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Rule ───────────────────────────────────────────────────────────────

function CreateRuleInput({ companyId, onCreated }: { companyId: number; onCreated: () => void }) {
  const t = useTranslations("admin.policies");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setPreview(null);
    try {
      const data = await apiPost<PreviewResponse>(`/admin/ai-policies/${companyId}/preview`, { source_text: prompt.trim() });
      setPreview(data);
    } catch (e: any) {
      setError(e?.message || "Error generando regla");
    } finally {
      setGenerating(false);
    }
  }, [prompt, generating, companyId]);

  const handleSave = useCallback(async () => {
    if (!preview || saving) return;
    setSaving(true);
    try {
      await apiPost(`/admin/ai-policies/${companyId}`, { source_text: prompt.trim() });
      setPrompt("");
      setPreview(null);
      setExpanded(false);
      onCreated();
    } catch (e: any) {
      setError(e?.message || "Error guardando regla");
    } finally {
      setSaving(false);
    }
  }, [preview, saving, companyId, prompt, onCreated]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed border-subtle/40 px-3 py-2 text-[9px] text-muted transition-all hover:border-accent/30 hover:text-accent hover:bg-accent/5"
      >
        <Plus className="h-3 w-3" />
        {t("newRule")}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-accent/20 bg-accent/5 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-accent" />
          <span className="text-[9px] font-bold uppercase tracking-widest text-accent">{t("promptLabel")}</span>
        </div>
        <button type="button" onClick={() => { setExpanded(false); setPreview(null); setError(null); }} className="text-muted hover:text-secondary">
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleGenerate(); } }}
          placeholder={t("promptPlaceholder")}
          className={`flex-1 ${inputClasses.base} text-[10px]`}
          autoFocus
        />
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !prompt.trim()}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white transition-all hover:bg-accent-hover disabled:opacity-40"
        >
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-1.5 text-[9px] text-error font-medium">
          <AlertCircle className="h-3 w-3" /> {error}
        </div>
      )}

      {preview && (
        <div className="rounded-md border border-default bg-surface-1 p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-bold uppercase tracking-widest text-muted">{t("previewSummary")}</span>
            <span className={`text-[7px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
              preview.severity === "block" ? "bg-error/10 text-error border border-error/20" : "bg-warning/10 text-warning border border-warning/20"
            }`}>
              {preview.severity === "block" ? "bloqueo" : "aviso"}
            </span>
          </div>
          <p className="text-[10px] font-medium text-primary">{preview.summary}</p>
          <pre className="text-[8px] text-muted font-mono whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
            {JSON.stringify(preview.rule_json, null, 2)}
          </pre>
          {preview.notice && (
            <p className="text-[8px] text-warning italic">{preview.notice}</p>
          )}
          {preview.setting_suggestion && (
            <div className="flex items-center gap-1.5 text-[8px] text-accent">
              <Zap className="h-2.5 w-2.5" />
              <span>{preview.setting_suggestion.label || preview.setting_suggestion.setting_key}: {String(preview.setting_suggestion.value)}</span>
            </div>
          )}
          <div className="pt-1.5">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[9px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
              {saving ? "Guardando..." : t("saveRule")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPoliciesPanel({ companyId, expensePolicy, onExpensePolicySaved, draftPatch }: Props) {
  const t  = useTranslations("admin.policies");
  const tm = useTranslations("admin.expenseModule");
  const tc = useTranslations("common");

  const [rules, setRules]               = useState<AIPolicyRead[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);

  const [form, setForm]                 = useState<Record<string, any>>({ ...expensePolicy });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved]   = useState(false);
  const [settingsError, setSettingsError]   = useState<string | null>(null);

  // ── Load rules ───────────────────────────────────────────────────────────────
  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const data = await apiCall<AIPolicyRead[]>(`/admin/ai-policies/${companyId}`);
      setRules(data);
    } finally {
      setLoadingRules(false);
    }
  }, [companyId]);

  useEffect(() => { loadRules(); }, [loadRules]);

  // Sync expense policy
  useEffect(() => { setForm({ ...expensePolicy }); setSettingsDirty(false); }, [expensePolicy]);

  useEffect(() => {
    if (!draftPatch || Object.keys(draftPatch).length === 0) return;
    setForm((prev) => ({ ...prev, ...draftPatch }));
    setSettingsDirty(true);
  }, [draftPatch]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const set = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSettingsDirty(true);
    setSettingsSaved(false);
    setSettingsError(null);
  };

  const toggleRule = async (rule: AIPolicyRead) => {
    try {
      await apiPatch(`/admin/ai-policies/${companyId}/${rule.id}`, { enabled: !rule.enabled });
      loadRules();
    } catch {}
  };

  const deleteRule = async (rule: AIPolicyRead) => {
    try {
      await apiDelete(`/admin/ai-policies/${companyId}/${rule.id}`);
      if (selectedRuleId === rule.id) setSelectedRuleId(null);
      loadRules();
    } catch {}
  };

  const saveSettings = async () => {
    setSettingsSaving(true);
    setSettingsError(null);
    try {
      const res = await apiCall<Record<string, any>>(`/expense-policy/${companyId}`, { method: "PUT", json: form });
      onExpensePolicySaved(res);
      setSettingsDirty(false);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (e: any) {
      setSettingsError(e?.message || "Error guardando configuración");
    } finally {
      setSettingsSaving(false);
    }
  };

  const activeCount = rules.filter((r) => r.enabled).length;
  const blockCount = rules.filter((r) => r.severity === "block" && r.enabled).length;
  const warnCount = rules.filter((r) => r.severity === "warn" && r.enabled).length;

  // ── XML mode display ────────────────────────────────────────────────────────
  const xmlLabel = XML_OPTIONS.find((o) => o.value === (form.xml_required_mode ?? "always"))?.label ?? form.xml_required_mode;
  const ticketsLabel = form.tickets_allowed ? t("ticketsOn") : t("ticketsOff");

  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <PremiumHeader
        icon={<FileText className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("studioSubtitle")}
        section="expense-policy"
        metrics={[
          { label: t("activeRules"), value: activeCount, tone: activeCount > 0 ? "success" : "neutral" },
          { label: "Bloqueos", value: blockCount, tone: blockCount > 0 ? "error" : "neutral" },
          { label: "Avisos", value: warnCount, tone: warnCount > 0 ? "warning" : "neutral" },
        ]}
      />

      {/* ── Section 1: Policy Rules ─────────────────────────────────────────── */}
      <div className="rounded-md border border-default">
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-2">
            <Shield className="h-3 w-3 text-warning" />
            <span className="text-[10px] font-semibold text-primary">{t("rulesLabel")}</span>
          </div>
          {rules.length > 0 && (
            <span className="text-[8px] text-muted font-medium">{activeCount}/{rules.length} {t("activeRules").toLowerCase()}</span>
          )}
        </div>

        <div className="p-2 space-y-1.5">
          {loadingRules && (
            <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
          )}

          {!loadingRules && rules.length === 0 && (
            <div className="py-6 text-center">
              <div className="flex h-8 w-8 mx-auto items-center justify-center rounded-full bg-warning/10 mb-2">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
              </div>
              <p className="text-[10px] font-medium text-secondary">{t("noRules")}</p>
              <p className="text-[8px] text-muted mt-0.5">{t("promptPlaceholder")}</p>
            </div>
          )}

          {!loadingRules && rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              selected={selectedRuleId === rule.id}
              onSelect={() => setSelectedRuleId(selectedRuleId === rule.id ? null : rule.id)}
              onToggle={() => toggleRule(rule)}
              onDelete={() => deleteRule(rule)}
            />
          ))}

          <CreateRuleInput companyId={companyId} onCreated={loadRules} />
        </div>
      </div>

      {/* ── Section 2: Expense Configuration ──────────────────────────────────── */}
      <div className="rounded-md border border-default">
        <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
          <div className="flex items-center gap-2">
            <FileText className="h-3 w-3 text-amber-400" />
            <span className="text-[10px] font-semibold text-primary">{t("expenseSettings")}</span>
          </div>
          <div className="flex items-center gap-2 text-[8px] text-muted">
            <span>XML: {xmlLabel}</span>
            <span className="text-subtle">·</span>
            <span>{ticketsLabel}</span>
          </div>
        </div>

        <div className="p-2">
          <SectionPanel>
            <Row label={tm("xmlCfdiRequired")}>
              <select
                value={form.xml_required_mode ?? "mxn_only"}
                onChange={(e) => set("xml_required_mode", e.target.value)}
                className={`${inputClasses.select} w-44`}
              >
                {XML_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Row>
            <Row label={tm("pdfPairRequired")} description={tm("pdfPairDesc")}>
              <Toggle value={!!form.pdf_pair_required_for_cfdi} onChange={(v) => set("pdf_pair_required_for_cfdi", v)} />
            </Row>
            <Row label={tm("internationalAllowed")} description={tm("internationalDesc")}>
              <Toggle value={!!form.international_expenses_allowed} onChange={(v) => set("international_expenses_allowed", v)} />
            </Row>
            <Row label={tm("ticketsAllowed")} description={tm("ticketsDesc")}>
              <Toggle value={!!form.tickets_allowed} onChange={(v) => set("tickets_allowed", v)} />
            </Row>
            <Row label={tm("justificationRequired")} description={tm("justificationDesc")}>
              <Toggle value={!!form.require_justification} onChange={(v) => set("require_justification", v)} />
            </Row>
            <Row label={tm("proofRequired")} description={tm("proofDesc")}>
              <Toggle value={!!form.require_proof} onChange={(v) => set("require_proof", v)} />
            </Row>
            <Row label={tm("docFreeExpenses")} description={tm("docFreeExpensesDesc")}>
              <Toggle value={!!form.allow_document_free_expenses} onChange={(v) => set("allow_document_free_expenses", v)} />
            </Row>
          </SectionPanel>

          <div className="flex items-center gap-4 mt-3 px-1">
            <button
              type="button"
              onClick={saveSettings}
              disabled={settingsSaving || !settingsDirty}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-[10px] font-semibold text-white shadow-sm transition-all hover:bg-accent-hover disabled:opacity-40"
            >
              {settingsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {settingsSaving ? tc("saving") : tc("save")}
            </button>
            {settingsSaved && (
              <div className="flex items-center gap-1 text-[9px] text-success font-medium">
                <CheckCircle2 className="h-3 w-3" /> {tc("saved")}
              </div>
            )}
            {settingsError && (
              <div className="flex items-center gap-1 text-[9px] text-error font-medium">
                <AlertCircle className="h-3 w-3" /> {settingsError}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
