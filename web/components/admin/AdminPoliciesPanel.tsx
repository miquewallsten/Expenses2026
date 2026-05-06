"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Plus, Power, RefreshCw,
  Save, Settings, Sparkles, Trash2, X, AlertCircle, ChevronRight, FileText,
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
  StatusBadge as PatternStatusBadge,
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

type RightTab = "create" | "rule" | "settings";

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  companyId: number;
  expensePolicy: Record<string, any>;
  onExpensePolicySaved: (p: Record<string, any>) => void;
  draftPatch?: Partial<Record<string, any>>;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function AdminPoliciesPanel({ companyId, expensePolicy, onExpensePolicySaved, draftPatch }: Props) {
  const t  = useTranslations("admin.policies");
  const tm = useTranslations("admin.expenseModule");
  const tc = useTranslations("common");

  // ── AI rules state ─────────────────────────────────────────────────────────
  const [rules, setRules]             = useState<AIPolicyRead[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);
  const [selectedRule, setSelectedRule] = useState<AIPolicyRead | null>(null);

  // ── Create-rule state ──────────────────────────────────────────────────────
  const [prompt, setPrompt]           = useState("");
  const [generating, setGenerating]   = useState(false);
  const [preview, setPreview]         = useState<PreviewResponse | null>(null);
  const [saving, setSaving]           = useState(false);
  const [genError, setGenError]       = useState<string | null>(null);

  // ── Expense-settings state ─────────────────────────────────────────────────
  const [form, setForm]               = useState<Record<string, any>>({ ...expensePolicy });
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved]   = useState(false);
  const [settingsError, setSettingsError]   = useState<string | null>(null);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<RightTab>("create");

  // ── Load rules ─────────────────────────────────────────────────────────────
  async function loadRules() {
    setLoadingRules(true);
    try {
      const data = await apiCall<AIPolicyRead[]>(`/admin/ai-policies/${companyId}`);
      setRules(data);
    } finally {
      setLoadingRules(false);
    }
  }

  useEffect(() => { loadRules(); }, [companyId]);

  // Sync expense policy when parent changes
  useEffect(() => { setForm({ ...expensePolicy }); setSettingsDirty(false); }, [expensePolicy]);

  // Merge draftPatch
  useEffect(() => {
    if (!draftPatch || Object.keys(draftPatch).length === 0) return;
    setForm((prev) => ({ ...prev, ...draftPatch }));
    setSettingsDirty(true);
  }, [draftPatch]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function generate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setGenError(null);
    setPreview(null);
    try {
      const data = await apiPost<PreviewResponse>(`/admin/ai-policies/${companyId}/preview`, { source_text: prompt });
      setPreview(data);
    } catch (e: any) {
      setGenError(e?.message ?? "error");
    } finally {
      setGenerating(false);
    }
  }

  async function saveRule() {
    if (!preview) return;
    setSaving(true);
    try {
      await apiPost(`/admin/ai-policies/${companyId}`, { source_text: prompt });
      await loadRules();
      setPrompt("");
      setPreview(null);
    } finally {
      setSaving(false);
    }
  }

  async function applySetting(key: string, value: unknown) {
    await apiPost(`/admin/ai-policies/${companyId}/apply-setting`, { setting_key: key, value });
    setPreview(null);
    setPrompt("");
  }

  async function toggleRule(rule: AIPolicyRead) {
    const updated = await apiPatch<AIPolicyRead>(`/admin/ai-policies/${companyId}/${rule.id}`, { enabled: !rule.enabled });
    setRules((all) => all.map((x) => (x.id === updated.id ? updated : x)));
    if (selectedRule?.id === updated.id) setSelectedRule(updated);
  }

  async function reExtract(rule: AIPolicyRead) {
    const updated = await apiPost<AIPolicyRead>(`/admin/ai-policies/${companyId}/${rule.id}/re-extract`);
    setRules((all) => all.map((x) => (x.id === updated.id ? updated : x)));
    if (selectedRule?.id === updated.id) setSelectedRule(updated);
  }

  async function deleteRule(rule: AIPolicyRead) {
    if (!confirm(`Delete policy "${rule.summary}"?`)) return;
    await apiDelete(`/admin/ai-policies/${companyId}/${rule.id}`);
    setRules((all) => all.filter((x) => x.id !== rule.id));
    if (selectedRule?.id === rule.id) { setSelectedRule(null); setTab("create"); }
  }

  async function saveSettings() {
    setSettingsSaving(true); setSettingsError(null); setSettingsSaved(false);
    try {
      const updated = await apiPatch<Record<string, any>>(`/expenses/policy/${companyId}`, form);
      setSettingsDirty(false); setSettingsSaved(true);
      onExpensePolicySaved(updated);
    } catch (e: any) {
      setSettingsError(e?.message ?? tc("save"));
    } finally {
      setSettingsSaving(false);
    }
  }

  const set = (key: string, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSettingsDirty(true); setSettingsSaved(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const XML_OPTIONS = [
    { value: "never",    label: tm("xmlNever") },
    { value: "mxn_only", label: tm("xmlMxnOnly") },
    { value: "always",   label: tm("xmlAlways") },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-0">
      <div className="shrink-0 px-4 py-3">
        <PremiumHeader
          section="expense-policy"
          icon={<FileText className="h-4 w-4" />}
          title={t("title")}
          subtitle={t("studioSubtitle") || "Expense & AI Policies"}
          action={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => { setSelectedRule(null); setTab("create"); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/20 bg-accent/5 px-3 py-1.5 text-[10px] font-semibold text-accent transition-all hover:border-accent/30 hover:bg-accent/10"
              >
                <Plus className="h-3 w-3" /> {t("newRule")}
              </button>
            </div>
          }
          metrics={[
            {
              label: t("activeRules") || "Active Rules",
              value: rules.filter((r) => r.enabled).length,
              tone: "success",
            },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-0">
        {/* ── LEFT: Rule list ─────────────────────────────────────────────── */}
        <div className="flex w-[35%] min-w-0 flex-col border-r border-subtle bg-surface-0/30">
          <div className="flex-1 overflow-y-auto">
            {loadingRules ? (
              <div className="flex items-center gap-2 px-4 py-6 text-[10px] text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tc("loading")}
              </div>
            ) : rules.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1">
                  <Sparkles className="h-5 w-5 text-muted/50" />
                </div>
                <p className="text-[10px] text-muted">{t("noRules")}</p>
              </div>
            ) : (
              <ul className="divide-y divide-subtle/30">
                {rules.map((rule) => {
                  const isActive = selectedRule?.id === rule.id && tab === "rule";
                  return (
                    <li
                      key={rule.id}
                      onClick={() => { setSelectedRule(rule); setTab("rule"); }}
                      className={`group relative flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                        isActive ? "bg-accent/[0.04]" : "hover:bg-surface-1"
                      } ${!rule.enabled ? "opacity-50" : ""}`}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
                      )}
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        rule.severity === "block" ? "bg-rose-500 shadow-sm shadow-rose-500/20" : "bg-amber-500 shadow-sm shadow-amber-500/20"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-[11px] font-medium leading-tight ${isActive ? "text-primary" : "text-secondary"}`}>
                          {rule.summary}
                        </p>
                        <p className="truncate text-[9px] text-muted mt-0.5 uppercase tracking-wide font-medium">{rule.scope}</p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleRule(rule); }}
                          title={rule.enabled ? tc("disable") : tc("enable")}
                          className="rounded p-1 text-muted hover:bg-surface-2 hover:text-secondary transition-colors"
                        >
                          <Power className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteRule(rule); }}
                          title={tc("delete")}
                          className="rounded p-1 text-muted hover:bg-error/10 hover:text-error transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Settings toggle */}
          <div className="border-t border-subtle">
            <button
              type="button"
              onClick={() => { setSelectedRule(null); setTab("settings"); }}
              className={`group relative w-full px-4 py-3 text-left transition-colors hover:bg-surface-1 ${
                tab === "settings" ? "bg-accent/[0.04]" : ""
              }`}
            >
              {tab === "settings" && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r bg-accent" />
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Settings className={`h-3.5 w-3.5 ${tab === "settings" ? "text-accent" : "text-muted"}`} />
                  <p className={`text-[9px] font-bold uppercase tracking-widest ${tab === "settings" ? "text-accent" : "text-muted group-hover:text-secondary"}`}>
                    {t("expenseSettings")}
                  </p>
                </div>
                <ChevronRight className={`h-3 w-3 transition-all ${tab === "settings" ? "text-accent translate-x-0" : "text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0"}`} />
              </div>
              <p className="mt-1.5 truncate text-[10px] text-tertiary">
                {form.xml_required_mode ? `XML: ${form.xml_required_mode}` : "—"}
                <span className="mx-1.5 text-muted">·</span>
                {form.tickets_allowed ? t("ticketsOn") : t("ticketsOff")}
              </p>
            </button>
          </div>
        </div>

        {/* ── RIGHT: Detail / editor ──────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col bg-surface-0/10">
          {/* Internal Tab Bar */}
          <div className="flex items-center gap-0 border-b border-subtle bg-surface-1/50 px-2">
            {[
              ["create", t("tabCreate")],
              ["rule", t("tabRule")],
              ["settings", t("tabSettings")]
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => { if (key === "rule" && !selectedRule) return; setTab(key as RightTab); }}
                className={`relative px-4 py-3 text-[10px] font-semibold transition-all ${
                  tab === key
                    ? "text-primary"
                    : "text-muted hover:text-tertiary"
                } ${key === "rule" && !selectedRule ? "cursor-not-allowed opacity-30" : ""}`}
              >
                {label}
                {tab === key && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-accent rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {/* ── Create rule tab ────────────────────────────────────────── */}
            {tab === "create" && (
              <div className="mx-auto max-w-xl space-y-6">
                <div>
                  <PatternSectionLabel>{t("promptLabel")}</PatternSectionLabel>
                  <textarea
                    value={prompt}
                    onChange={(e) => { setPrompt(e.target.value); setPreview(null); setGenError(null); }}
                    rows={4}
                    placeholder={t("promptPlaceholder")}
                    className={`${inputClasses.textarea} w-full`}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={generating || !prompt.trim()}
                    className="inline-flex items-center gap-2 rounded-lg bg-ai px-4 py-2 text-[11px] font-semibold text-white shadow-sm shadow-ai-glow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                  >
                    {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generating ? t("generating") : t("generateBtn")}
                  </button>

                  {genError && (
                    <div className="flex items-center gap-2 text-[10px] text-error font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {genError}
                    </div>
                  )}
                </div>

                {preview && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <SectionPanel title={t("previewSummary")} className="border-ai/20 bg-ai/[0.02]">
                      <div className="space-y-4 p-4">
                        {preview.notice && (
                          <div className="flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[10px] text-warning">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            {preview.notice}
                          </div>
                        )}

                        <div>
                          <p className="text-[11px] text-primary font-medium leading-relaxed">{preview.summary}</p>
                          <div className="mt-2">
                            <PatternStatusBadge
                              status={preview.severity === "block" ? "error" : "warning"}
                              label={preview.severity}
                              size="sm"
                            />
                          </div>
                        </div>

                        {Object.keys(preview.rule_json).length > 0 && (
                          <div>
                            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-muted">Rule Logic</p>
                            <pre className={`${inputClasses.mono} w-full overflow-x-auto`}>
                              {JSON.stringify(preview.rule_json, null, 2)}
                            </pre>
                          </div>
                        )}

                        <div className="flex items-center gap-2 pt-2">
                          {!preview.notice && (
                            <button
                              type="button"
                              onClick={saveRule}
                              disabled={saving}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 disabled:opacity-40"
                            >
                              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                              {t("saveRule")}
                            </button>
                          )}
                          {preview.setting_suggestion && (
                            <button
                              type="button"
                              onClick={() => applySetting(preview.setting_suggestion!.setting_key, preview.setting_suggestion!.value)}
                              className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-[11px] font-semibold text-accent transition-all hover:bg-accent/20"
                            >
                              {t("applyAsSetting")}: {String(preview.setting_suggestion.setting_key).replace(/_/g, " ")}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setPreview(null); }}
                            className="ml-auto text-[10px] text-muted hover:text-secondary p-2 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </SectionPanel>
                  </div>
                )}
              </div>
            )}

            {/* ── Rule detail tab ────────────────────────────────────────── */}
            {tab === "rule" && selectedRule && (
              <div className="mx-auto max-w-xl space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-primary">{selectedRule.summary}</h3>
                    <p className="mt-0.5 text-[10px] text-muted font-medium uppercase tracking-wider">{selectedRule.scope}</p>
                  </div>
                  <PatternStatusBadge
                    status={selectedRule.severity === "block" ? "error" : "warning"}
                    label={selectedRule.severity}
                  />
                </div>

                <SectionPanel title={t("sourceText")}>
                  <div className="p-4">
                    <p className="text-[11px] text-secondary leading-relaxed">{selectedRule.source_text}</p>
                  </div>
                </SectionPanel>

                <SectionPanel title={t("ruleJson")}>
                  <div className="p-0">
                    <pre className={`${inputClasses.mono} border-0 rounded-none bg-transparent w-full overflow-x-auto p-4`}>
                      {JSON.stringify(selectedRule.rule_json, null, 2)}
                    </pre>
                  </div>
                </SectionPanel>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => toggleRule(selectedRule)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[11px] font-semibold transition-all ${
                      selectedRule.enabled
                        ? "border-default bg-surface-2 text-secondary hover:bg-surface-3"
                        : "border-success/30 bg-success/10 text-success hover:bg-success/20"
                    }`}
                  >
                    <Power className="h-3.5 w-3.5" />
                    {selectedRule.enabled ? t("disableRule") : t("enableRule")}
                  </button>
                  <button
                    type="button"
                    onClick={() => reExtract(selectedRule)}
                    className="inline-flex items-center gap-2 rounded-lg border border-default bg-surface-2 px-4 py-2 text-[11px] font-semibold text-secondary transition-all hover:bg-surface-3"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> {t("reExtract")}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRule(selectedRule)}
                    className="ml-auto inline-flex items-center gap-2 rounded-lg border border-error/20 px-4 py-2 text-[11px] font-semibold text-error/70 transition-all hover:border-error/30 hover:bg-error/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {tc("delete")}
                  </button>
                </div>
              </div>
            )}

            {/* ── Settings tab ───────────────────────────────────────────── */}
            {tab === "settings" && (
              <div className="mx-auto max-w-xl space-y-6">
                <div>
                  <PatternSectionLabel>{t("expenseSettings")}</PatternSectionLabel>
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
                </div>

                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={saveSettings}
                    disabled={settingsSaving || !settingsDirty}
                    className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2 text-[11px] font-semibold text-white shadow-sm shadow-accent-glow transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40"
                  >
                    {settingsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {settingsSaving ? tc("saving") : tc("save")}
                  </button>

                  {settingsSaved && (
                    <div className="flex items-center gap-1.5 text-[10px] text-success font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {tc("saved")}
                    </div>
                  )}

                  {settingsError && (
                    <div className="flex items-center gap-1.5 text-[10px] text-error font-medium">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {settingsError}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
