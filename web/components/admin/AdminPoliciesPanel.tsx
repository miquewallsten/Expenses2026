"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle, CheckCircle2, Loader2, Plus, Power, RefreshCw,
  Save, Sparkles, Trash2, X, AlertCircle,
} from "lucide-react";
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

// ── Inline sub-components ─────────────────────────────────────────────────────

function ToggleRow({
  label, desc, checked, onChange,
}: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        <p className="text-[10px] text-muted">{desc}</p>
      </div>
      <button type="button" onClick={() => onChange(!checked)}
        className={`relative inline-flex h-4 w-7 shrink-0 rounded-full border transition-colors ${checked ? "bg-accent-muted bg-accent-muted" : "border-strong bg-surface-2"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full transition-transform ${checked ? "translate-x-3 bg-accent" : "translate-x-0.5 bg-surface-2"}`} />
      </button>
    </div>
  );
}

function SelectRow({
  label, value, options, onChange,
}: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3.5 py-2">
      <p className="text-[11px] font-medium text-secondary">{label}</p>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-tertiary outline-none focus:bg-accent-muted">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
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
    <div className="flex h-full min-h-0 gap-0">

      {/* ── LEFT: Rule list ─────────────────────────────────────────────── */}
      <div className="flex w-[40%] min-w-0 flex-col border-r border-default">
        <div className="flex items-center justify-between border-b border-default px-3.5 py-2.5">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted">{t("rulesLabel")} · {rules.filter(r => r.enabled).length}/{rules.length}</span>
          <button type="button" onClick={() => { setSelectedRule(null); setTab("create"); }}
            className="inline-flex items-center gap-1 rounded border border-default bg-surface-1 px-2 py-0.5 text-[9.5px] text-tertiary hover:bg-surface-3 hover:text-secondary">
            <Plus className="h-2.5 w-2.5" /> {t("newRule")}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingRules ? (
            <div className="flex items-center gap-1.5 px-3.5 py-4 text-[10px] text-muted">
              <Loader2 className="h-3 w-3 animate-spin" /> {tc("loading")}
            </div>
          ) : rules.length === 0 ? (
            <div className="px-3.5 py-4 text-[10px] text-muted">{t("noRules")}</div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {rules.map((rule) => (
                <li key={rule.id}
                  onClick={() => { setSelectedRule(rule); setTab("rule"); }}
                  className={`group flex cursor-pointer items-start gap-2 px-3.5 py-2.5 transition-colors ${selectedRule?.id === rule.id ? "bg-surface-2" : "hover:bg-surface-1"} ${!rule.enabled ? "opacity-45" : ""}`}>
                  <span className={`mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${rule.severity === "block" ? "bg-rose-400" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-secondary">{rule.summary}</p>
                    <p className="truncate text-[10px] text-muted">{rule.scope}</p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                    <button type="button" onClick={(e) => { e.stopPropagation(); toggleRule(rule); }}
                      className="rounded p-1 text-muted hover:bg-surface-3 hover:text-secondary">
                      <Power className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); reExtract(rule); }}
                      className="rounded p-1 text-muted hover:bg-surface-3 hover:text-secondary">
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={(e) => { e.stopPropagation(); deleteRule(rule); }}
                      className="rounded p-1 text-muted hover:bg-red-500/10 hover:text-error">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Settings compact summary */}
        <div className="border-t border-default">
          <button type="button" onClick={() => { setSelectedRule(null); setTab("settings"); }}
            className={`w-full px-3.5 py-2.5 text-left transition-colors hover:bg-surface-1 ${tab === "settings" ? "bg-surface-2" : ""}`}>
            <p className="text-[9.5px] font-bold uppercase tracking-widest text-muted">{t("expenseSettings")}</p>
            <p className="mt-0.5 text-[10px] text-tertiary">
              {form.xml_required_mode ? `XML: ${form.xml_required_mode}` : "—"}
              {" · "}
              {form.tickets_allowed ? t("ticketsOn") : t("ticketsOff")}
            </p>
          </button>
        </div>
      </div>

      {/* ── RIGHT: Detail / editor ──────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-default">
          {([["create", t("tabCreate")], ["rule", t("tabRule")], ["settings", t("tabSettings")]] as [RightTab, string][]).map(([key, label]) => (
            <button key={key} type="button"
              onClick={() => { if (key === "rule" && !selectedRule) return; setTab(key); }}
              className={`border-b-2 px-4 py-2.5 text-[10px] font-semibold transition-colors ${
                tab === key
                  ? "bg-accent-muted/60 text-primary"
                  : "border-transparent text-muted hover:text-tertiary"
              } ${key === "rule" && !selectedRule ? "cursor-not-allowed opacity-30" : ""}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4">

          {/* ── Create rule tab ────────────────────────────────────────── */}
          {tab === "create" && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-muted">{t("promptLabel")}</p>
                <textarea
                  value={prompt}
                  onChange={(e) => { setPrompt(e.target.value); setPreview(null); setGenError(null); }}
                  rows={4}
                  placeholder={t("promptPlaceholder")}
                  className="w-full resize-none rounded border border-default bg-black/30 px-3 py-2 text-[11px] text-secondary placeholder:text-muted focus:border-strong focus:outline-none"
                />
              </div>

              <button type="button" onClick={generate}
                disabled={generating || !prompt.trim()}
                className="inline-flex items-center gap-1.5 rounded border border-violet-500/25 bg-violet-600/15 px-3 py-1.5 text-[10px] font-semibold text-violet-300/80 transition-colors hover:bg-violet-600/25 disabled:cursor-not-allowed disabled:opacity-40">
                {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {generating ? t("generating") : t("generateBtn")}
              </button>

              {genError && (
                <div className="flex items-start gap-2 rounded border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[10px] text-error/80">
                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {genError}
                </div>
              )}

              {preview && (
                <div className="space-y-3 rounded border border-default bg-surface-1 p-3">
                  {preview.notice && (
                    <div className="flex items-start gap-2 rounded border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2 text-[10px] text-warning/80">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {preview.notice}
                    </div>
                  )}

                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-muted">{t("previewSummary")}</p>
                    <p className="mt-1 text-[11px] text-secondary">{preview.summary}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${preview.severity === "block" ? "border-rose-500/25 bg-error-muted text-rose-300/80" : "border-amber-500/25 bg-warning-muted text-warning/80"}`}>
                      {preview.severity}
                    </span>
                  </div>

                  {Object.keys(preview.rule_json).length > 0 && (
                    <pre className="overflow-x-auto rounded border border-default bg-black/30 px-3 py-2 text-[9.5px] text-tertiary">
                      {JSON.stringify(preview.rule_json, null, 2)}
                    </pre>
                  )}

                  <div className="flex items-center gap-2">
                    {!preview.notice && (
                      <button type="button" onClick={saveRule} disabled={saving}
                        className="inline-flex items-center gap-1.5 rounded border border-emerald-500/25 bg-emerald-600/15 px-3 py-1.5 text-[10px] font-semibold text-emerald-300/80 transition-colors hover:bg-emerald-600/25 disabled:opacity-40">
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        {t("saveRule")}
                      </button>
                    )}
                    {preview.setting_suggestion && (
                      <button type="button"
                        onClick={() => applySetting(preview.setting_suggestion!.setting_key, preview.setting_suggestion!.value)}
                        className="inline-flex items-center gap-1.5 rounded border border-sky-500/25 bg-sky-600/10 px-3 py-1.5 text-[10px] font-semibold text-accent/80 transition-colors hover:bg-sky-600/20">
                        {t("applyAsSetting")}: {String(preview.setting_suggestion.setting_key).replace(/_/g, " ")}
                      </button>
                    )}
                    <button type="button" onClick={() => { setPreview(null); }}
                      className="text-[10px] text-muted hover:text-secondary">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Rule detail tab ────────────────────────────────────────── */}
          {tab === "rule" && selectedRule && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[12px] font-semibold text-primary">{selectedRule.summary}</p>
                  <p className="mt-0.5 text-[10px] text-muted">{selectedRule.scope}</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${selectedRule.severity === "block" ? "border-rose-500/25 bg-error-muted text-rose-300/80" : "border-amber-500/25 bg-warning-muted text-warning/80"}`}>
                  {selectedRule.severity}
                </span>
              </div>

              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted">{t("sourceText")}</p>
                <p className="rounded border border-default bg-surface-1 px-3 py-2 text-[11px] text-tertiary leading-relaxed">{selectedRule.source_text}</p>
              </div>

              <div>
                <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-muted">{t("ruleJson")}</p>
                <pre className="overflow-x-auto rounded border border-default bg-black/30 px-3 py-2 text-[9.5px] text-tertiary">
                  {JSON.stringify(selectedRule.rule_json, null, 2)}
                </pre>
              </div>

              <div className="flex items-center gap-2">
                <button type="button" onClick={() => toggleRule(selectedRule)}
                  className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[10px] font-semibold transition-colors ${selectedRule.enabled ? "border-default bg-surface-2 text-tertiary hover:bg-surface-3" : "border-emerald-500/25 bg-emerald-600/10 text-emerald-300/70 hover:bg-emerald-600/20"}`}>
                  <Power className="h-3 w-3" />
                  {selectedRule.enabled ? t("disableRule") : t("enableRule")}
                </button>
                <button type="button" onClick={() => reExtract(selectedRule)}
                  className="inline-flex items-center gap-1.5 rounded border border-default bg-surface-1 px-3 py-1.5 text-[10px] font-semibold text-tertiary transition-colors hover:bg-surface-3">
                  <RefreshCw className="h-3 w-3" /> {t("reExtract")}
                </button>
                <button type="button" onClick={() => deleteRule(selectedRule)}
                  className="inline-flex items-center gap-1.5 rounded border border-rose-500/15 px-3 py-1.5 text-[10px] font-semibold text-error/60 transition-colors hover:bg-error-muted">
                  <Trash2 className="h-3 w-3" /> {tc("delete")}
                </button>
              </div>
            </div>
          )}

          {/* ── Settings tab ───────────────────────────────────────────── */}
          {tab === "settings" && (
            <div className="space-y-4 max-w-md">
              <div className="overflow-hidden rounded border border-default divide-y divide-white/[0.05]">
                <SelectRow label={tm("xmlCfdiRequired")} value={form.xml_required_mode ?? "mxn_only"} options={XML_OPTIONS} onChange={(v) => set("xml_required_mode", v)} />
                <ToggleRow label={tm("pdfPairRequired")} desc={tm("pdfPairDesc")} checked={!!form.pdf_pair_required_for_cfdi} onChange={(v) => set("pdf_pair_required_for_cfdi", v)} />
                <ToggleRow label={tm("internationalAllowed")} desc={tm("internationalDesc")} checked={!!form.international_expenses_allowed} onChange={(v) => set("international_expenses_allowed", v)} />
                <ToggleRow label={tm("ticketsAllowed")} desc={tm("ticketsDesc")} checked={!!form.tickets_allowed} onChange={(v) => set("tickets_allowed", v)} />
                <ToggleRow label={tm("justificationRequired")} desc={tm("justificationDesc")} checked={!!form.require_justification} onChange={(v) => set("require_justification", v)} />
                <ToggleRow label={tm("proofRequired")} desc={tm("proofDesc")} checked={!!form.require_proof} onChange={(v) => set("require_proof", v)} />
                <ToggleRow label={tm("docFreeExpenses")} desc={tm("docFreeExpensesDesc")} checked={!!form.allow_document_free_expenses} onChange={(v) => set("allow_document_free_expenses", v)} />
              </div>

              <div className="flex items-center gap-3">
                <button type="button" onClick={saveSettings} disabled={settingsSaving || !settingsDirty}
                  className="inline-flex items-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-3 py-1.5 text-[10px] font-semibold text-accent transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:opacity-40">
                  {settingsSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {settingsSaving ? tc("saving") : tc("save")}
                </button>
                {settingsSaved && <span className="inline-flex items-center gap-1 text-[10px] text-success/70"><CheckCircle2 className="h-3 w-3" /> {tc("saved")}</span>}
                {settingsError && <span className="text-[10px] text-error/70">{settingsError}</span>}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
