"use client";

import {
  PremiumHeader,
  SectionPanel,
  Row,
  Toggle,
  SectionLabel,
  inputClasses,
  SECTION_ACCENTS,
} from "@/components/admin/shared/AdminPatterns";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { apiCall, apiPatch } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/copy";
import {
  MessageSquare, Mail, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Send, Settings2, ChevronRight, ArrowDownLeft, ArrowUpRight,
  Loader2, Eye, EyeOff, Copy, Check, Shield
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChannelSettings {
  id: number;
  company_id: number;
  channel: "whatsapp" | "email";
  is_enabled: boolean;
  // WhatsApp
  wa_phone_number_id: string | null;
  wa_waba_id: string | null;
  wa_webhook_verify_token: string | null;
  wa_display_name: string | null;
  wa_access_token_set: boolean;
  // Email
  email_inbound_address: string | null;
  email_smtp_host: string | null;
  email_smtp_port: number | null;
  email_smtp_user: string | null;
  email_smtp_from: string | null;
  email_smtp_password_set: boolean;
  email_imap_host: string | null;
  email_imap_port: number | null;
  email_imap_user: string | null;
  email_imap_password_set: boolean;
  email_imap_enabled: boolean;
  email_webhook_secret_set: boolean;
}

interface ChannelMessage {
  id: number;
  channel: "whatsapp" | "email";
  direction: "inbound" | "outbound";
  sender_ref: string;
  user_id: number | null;
  thread_id: string | null;
  body: string | null;
  intent: string | null;
  status: string;
  error_detail: string | null;
  created_at: string;
}

interface ChannelStats {
  total_messages: number;
  by_channel: Record<string, number>;
  errors: number;
}

type ChannelTab = "whatsapp" | "email";
type SubTab = "settings" | "log" | "dispatches";

// ── Small helpers ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    replied:    "bg-success-muted text-success border-emerald-500/20",
    received:   "bg-accent/10 text-accent border-sky-500/20",
    processing: "bg-warning-muted text-warning border-amber-500/20",
    error:      "bg-red-500/10 text-error border-red-500/20",
    ignored:    "bg-surface-1 text-muted border-subtle",
  };
  const cls = map[status] ?? "bg-surface-1 text-muted border-subtle";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return null;
  return (
    <span className="rounded border border-blue-500/20 bg-accent-muted px-1.5 py-0.5 text-[9px] font-medium text-accent/70">
      {intent.replace(/_/g, " ")}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const t = useTranslations("admin.channels");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { copyToClipboard(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="ml-1 text-muted hover:text-secondary transition-colors"
      title={t("copy")}
    >
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function SecretField({ label, value, isSet, onChange }: {
  label: string;
  value: string;
  isSet: boolean;
  onChange: (v: string) => void;
}) {
  const t = useTranslations("admin.channels");
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-tertiary">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? t("secretStored") : t("secretEnter")}
          className="flex-1 rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted"
        />
        <button type="button" onClick={() => setShow(!show)} className="text-muted hover:text-secondary">
          {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}

// ── WhatsApp settings form ─────────────────────────────────────────────────────

function WhatsAppSettingsForm({
  settings,
  onSaved,
  companyId,
}: {
  settings: ChannelSettings;
  onSaved: (updated: ChannelSettings) => void;
  companyId: number;
}) {
  const [form, setForm] = useState({
    is_enabled:              settings.is_enabled,
    wa_phone_number_id:      settings.wa_phone_number_id ?? "",
    wa_waba_id:              settings.wa_waba_id ?? "",
    wa_access_token:         "",
    wa_webhook_verify_token: settings.wa_webhook_verify_token ?? "",
    wa_display_name:         settings.wa_display_name ?? "",
  });
  const t = useTranslations("admin.channels");
  const tw = useTranslations("admin.channels.whatsapp");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const field = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { ...form };
      if (!body.wa_access_token) delete body.wa_access_token; // don't overwrite with blank
      const updated = await apiPatch<ChannelSettings>(`/admin/channels/settings/${companyId}/whatsapp`, body);
      onSaved(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testRecipient.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      await apiCall<{ detail?: string }>(`/admin/channels/test/${companyId}/whatsapp`, {
        method: "POST",
        json: { recipient: testRecipient },
      });
      setTestResult(tw("testSent"));
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : t("connectionError");
      setTestResult(err);
    } finally {
      setTesting(false);
    }
  }

  const webhookUrl = useMemo(() => `${window.location.origin.replace("3000", "8000")}/channels/whatsapp/webhook`, []);

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded border border-default bg-surface-1 px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold text-secondary">{tw("title")}</p>
          <p className="text-[10px] text-muted">{tw("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
          className={`relative h-5 w-9 rounded-full transition-colors ${form.is_enabled ? "bg-success-muted" : "bg-surface-2"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-tertiary">{tw("phoneNumberId")}</label>
          <input value={form.wa_phone_number_id} onChange={field("wa_phone_number_id")}
            placeholder={tw("phoneNumberIdPlaceholder")}
            className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-tertiary">{tw("wabaId")}</label>
          <input value={form.wa_waba_id} onChange={field("wa_waba_id")}
            placeholder={tw("wabaIdPlaceholder")}
            className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] font-medium text-tertiary">{tw("displayName")}</label>
          <input value={form.wa_display_name} onChange={field("wa_display_name")}
            placeholder={tw("displayNamePlaceholder")}
            className="w-full rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted focus:bg-accent-muted"
          />
        </div>
        <div className="col-span-2">
          <SecretField
            label={tw("accessToken")}
            value={form.wa_access_token}
            isSet={settings.wa_access_token_set}
            onChange={(v) => setForm((f) => ({ ...f, wa_access_token: v }))}
          />
        </div>
      </div>

      {/* Webhook info */}
      <div className="rounded border border-blue-500/15 bg-accent-muted p-3 space-y-2">
        <p className="text-[10px] font-semibold text-accent/70 uppercase tracking-wide">{tw("webhookSection")}</p>
        <div>
          <p className="text-[10px] text-muted mb-0.5">{tw("webhookUrl")}</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 rounded bg-surface-2 px-2 py-1 text-[10px] text-secondary font-mono truncate">{webhookUrl}</code>
            <CopyButton value={webhookUrl} />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted mb-0.5">{tw("verifyToken")}</p>
          <div className="flex items-center gap-1">
            <input
              value={form.wa_webhook_verify_token}
              onChange={field("wa_webhook_verify_token")}
              placeholder={tw("verifyTokenPlaceholder")}
              className="flex-1 rounded border border-default bg-surface-2 px-2 py-1 text-[10px] font-mono text-secondary outline-none focus:bg-accent-muted"
            />
            {form.wa_webhook_verify_token && <CopyButton value={form.wa_webhook_verify_token} />}
          </div>
        </div>
        <p className="text-[9.5px] text-muted leading-relaxed">
          {tw.rich("webhookHelp", {
            strong: (chunks) => <strong className="text-tertiary">{chunks}</strong>,
          })}
        </p>
      </div>

      {error && <p className="text-[10px] text-error">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] font-medium text-primary hover:bg-accent-hover disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {t("saveSettings")}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder={tw("testPlaceholder")}
            className="w-32 rounded border border-default bg-surface-2 px-2 py-1.5 text-[11px] text-secondary outline-none placeholder:text-muted"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1 rounded border border-subtle px-2.5 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {t("test")}
          </button>
        </div>
      </div>

      {testResult && (
        <p className={`text-[10px] ${testResult.startsWith("✓") ? "text-success" : "text-error"}`}>{testResult}</p>
      )}

      {/* Setup Guide */}
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-4 space-y-3">
        <p className="text-[11px] font-semibold text-secondary">{tw("setupGuide")}</p>
        
        <div className="space-y-2.5">
          {[
            { step: "1", title: tw("step1Title"), desc: tw("step1Desc") },
            { step: "2", title: tw("step2Title"), desc: tw("step2Desc") },
            { step: "3", title: tw("step3Title"), desc: tw("step3Desc") },
            { step: "4", title: tw("step4Title"), desc: tw("step4Desc") },
            { step: "5", title: tw("step5Title"), desc: tw("step5Desc") },
          ].map((s) => (
            <div key={s.step} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                {s.step}
              </span>
              <div>
                <p className="text-[10.5px] font-medium text-secondary">{s.title}</p>
                <p className="text-[9.5px] text-muted leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="rounded-lg border border-subtle bg-surface-1 p-4 space-y-2.5">
        <p className="text-[11px] font-semibold text-secondary">{tw("phoneLinkingTitle")}</p>
        <p className="text-[9.5px] text-muted leading-relaxed">{tw("phoneLinkingDesc")}</p>
        <div className="mt-2 space-y-1.5">
          {[
            tw("linkingFlow1"),
            tw("linkingFlow2"),
            tw("linkingFlow3"),
            tw("linkingFlow4"),
          ].map((text, i) => (
            <p key={i} className="text-[10px] text-muted leading-relaxed flex gap-1.5">
              <span className="text-accent">{i + 1}.</span> {text}
            </p>
          ))}
        </div>
        <div className="mt-3 rounded border border-green-500/20 bg-green-500/5 p-2">
          <p className="text-[9.5px] text-success leading-relaxed">
            💡 <strong>Pro tip:</strong> You can also pre-link phones in <strong>Users → WhatsApp Phone</strong> or via the API, but the automatic email-verification flow handles it seamlessly.
          </p>
        </div>
        <p className="mt-2 text-[11px] font-semibold text-secondary">{tw("howItWorksTitle")}</p>
        <div className="space-y-1.5">
          {[
            tw("howItWorks1"),
            tw("howItWorks2"),
            tw("howItWorks3"),
            tw("howItWorks4"),
          ].map((text, i) => (
            <p key={i} className="text-[10px] text-muted leading-relaxed flex gap-1.5">
              <span className="text-accent">→</span> {text}
            </p>
          ))}
        </div>
        <p className="text-[11px] font-semibold text-secondary mt-3">{tw("capabilitiesTitle")}</p>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            tw("capExpenses"),
            tw("capApprove"),
            tw("capTimeTracking"),
            tw("capReports"),
            tw("capStatus"),
          ].map((cap, i) => (
            <p key={i} className="text-[9.5px] text-muted flex gap-1">
              <span className="text-success">✓</span> {cap}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Email settings form ────────────────────────────────────────────────────────

function EmailSettingsForm({
  settings,
  onSaved,
  companyId,
}: {
  settings: ChannelSettings;
  onSaved: (updated: ChannelSettings) => void;
  companyId: number;
}) {
  const [form, setForm] = useState({
    is_enabled:            settings.is_enabled,
    email_inbound_address: settings.email_inbound_address ?? "",
    email_webhook_secret:  "",
    email_smtp_host:       settings.email_smtp_host ?? "",
    email_smtp_port:       String(settings.email_smtp_port ?? 587),
    email_smtp_user:       settings.email_smtp_user ?? "",
    email_smtp_password:   "",
    email_smtp_from:       settings.email_smtp_from ?? "",
    email_imap_host:       settings.email_imap_host ?? "",
    email_imap_port:       String(settings.email_imap_port ?? 993),
    email_imap_user:       settings.email_imap_user ?? "",
    email_imap_password:   "",
    email_imap_enabled:    settings.email_imap_enabled || false,
  });
  const t = useTranslations("admin.channels");
  const te = useTranslations("admin.channels.email");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const field = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        ...form,
        email_smtp_port: Number(form.email_smtp_port) || 587,
        email_imap_port: Number(form.email_imap_port) || 993,
      };
      if (!body.email_smtp_password) delete body.email_smtp_password;
      if (!body.email_imap_password) delete body.email_imap_password;
      if (!body.email_webhook_secret) delete body.email_webhook_secret;
      const updated = await apiPatch<ChannelSettings>(`/admin/channels/settings/${companyId}/email`, body);
      onSaved(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testRecipient.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      await apiCall(`/admin/channels/test/${companyId}/email`, {
        method: "POST",
        json: { recipient: testRecipient },
      });
      setTestResult(te("testSent"));
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : t("connectionError");
      setTestResult(err);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Active State */}
      <div className="flex items-center justify-between rounded-xl border border-default bg-surface-1 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${form.is_enabled ? 'bg-success animate-pulse' : 'bg-muted'}`} />
          <div>
            <p className="text-[12px] font-bold text-primary uppercase tracking-tight">Mailbox Integration</p>
            <p className="text-[10px] text-tertiary">Allow Lola to send and receive corporate emails.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
          className={`relative h-5 w-9 rounded-full transition-all ${form.is_enabled ? "bg-success" : "bg-surface-3"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${form.is_enabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Outbound Sync */}
        <div className="space-y-4 rounded-xl border border-subtle bg-surface-1 p-5">
           <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest border-b border-subtle pb-1 flex items-center gap-2">
             <ArrowUpRight className="h-3 w-3" /> Sending (SMTP)
           </h3>
           <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-secondary uppercase">SMTP Server</label>
                <input value={form.email_smtp_host} onChange={field("email_smtp_host")}
                  placeholder="smtp.office365.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted transition-all"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-secondary uppercase">Port</label>
                  <input value={form.email_smtp_port} onChange={field("email_smtp_port")}
                    placeholder="587"
                    className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-secondary uppercase">Encryption</label>
                  <select className="w-full rounded-lg border border-default bg-surface-2 px-3 py-1.5 text-[11px] text-secondary outline-none">
                    <option>STARTTLS</option>
                    <option>SSL/TLS</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-secondary uppercase">Username</label>
                <input value={form.email_smtp_user} onChange={field("email_smtp_user")}
                  placeholder="user@company.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                />
              </div>
              <SecretField
                label="PASSWORD"
                value={form.email_smtp_password}
                isSet={settings.email_smtp_password_set}
                onChange={(v) => setForm((f) => ({ ...f, email_smtp_password: v }))}
              />
           </div>
        </div>

        {/* Incoming Sync (IMAP) */}
        <div className={`space-y-4 rounded-xl border border-subtle bg-surface-1 p-5 transition-opacity ${form.email_imap_enabled ? 'opacity-100' : 'opacity-50'}`}>
           <div className="flex items-center justify-between border-b border-subtle pb-1">
             <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-2">
               <ArrowDownLeft className="h-3 w-3" /> Receiving (IMAP)
             </h3>
             <button 
                type="button"
                onClick={() => setForm(f => ({...f, email_imap_enabled: !f.email_imap_enabled}))}
                className={`relative h-4 w-7 rounded-full transition-all ${form.email_imap_enabled ? "bg-rose-500" : "bg-surface-3"}`}
             >
                <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${form.email_imap_enabled ? "translate-x-3.5" : "translate-x-0.5"}`} />
             </button>
           </div>
           
           <div className={`space-y-3 ${form.email_imap_enabled ? '' : 'pointer-events-none'}`}>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-secondary uppercase">IMAP Server</label>
                <input value={form.email_imap_host} onChange={field("email_imap_host")}
                  placeholder="imap.office365.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-secondary uppercase">Port</label>
                  <input value={form.email_imap_port} onChange={field("email_imap_port")}
                    placeholder="993"
                    className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-secondary uppercase">User</label>
                  <input value={form.email_imap_user} onChange={field("email_imap_user")}
                    placeholder="gastos@company.com"
                    className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none focus:bg-accent-muted"
                  />
                </div>
              </div>
              <SecretField
                label="IMAP PASSWORD"
                value={form.email_imap_password}
                isSet={settings.email_imap_password_set}
                onChange={(v) => setForm((f) => ({ ...f, email_imap_password: v }))}
              />
              <p className="text-[9px] text-muted italic pt-1">
                When enabled, Lola will actively check this mailbox every 5 minutes to sweep new expense files into the bucket.
              </p>
           </div>
        </div>

        {/* Identity & Inbound Webhook */}
        <div className="space-y-4 rounded-xl border border-subtle bg-surface-1 p-5">
           <h3 className="text-[10px] font-bold text-muted uppercase tracking-widest border-b border-subtle pb-1 flex items-center gap-2">
             <Shield className="h-3 w-3" /> Identity & Webhook
           </h3>
           <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-secondary uppercase">Sender Name</label>
                <input value={form.email_smtp_from} onChange={field("email_smtp_from")}
                  placeholder="Company Finance Dept"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-secondary uppercase">System Inbox Address</label>
                <input value={form.email_inbound_address} onChange={field("email_inbound_address")}
                  placeholder="gastos@company.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] text-secondary outline-none"
                />
                <p className="text-[9px] text-muted italic">Employees forward expenses to this address.</p>
              </div>

              <div className="mt-4 pt-4 border-t border-subtle space-y-2">
                 <label className="text-[9px] font-bold text-muted uppercase tracking-wider">Webhook Security</label>
                 <SecretField
                   label="WEBHOOK SECRET"
                   value={form.email_webhook_secret}
                   isSet={settings.email_webhook_secret_set}
                   onChange={(v) => setForm((f) => ({ ...f, email_webhook_secret: v }))}
                 />
              </div>
           </div>
        </div>
      </div>

      {error && <p className="text-[11px] text-error font-medium px-2">{error}</p>}

      <div className="flex items-center justify-between border-t border-subtle pt-6">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-[11px] font-bold text-surface-0 hover:bg-primary-hover transition-all disabled:opacity-50">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Settings2 className="h-3.5 w-3.5" />}
          Save Mailbox Configuration
        </button>

        <div className="flex items-center gap-2">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="test@email.com"
            className="w-40 rounded-lg border border-default bg-surface-2 px-2.5 py-1.5 text-[11px] text-secondary outline-none"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1.5 rounded-lg border border-subtle px-3 py-1.5 text-[11px] font-semibold text-secondary hover:bg-surface-2 transition-colors disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Test
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Message log ────────────────────────────────────────────────────────────────

function MessageLog({ channel, companyId }: { channel: ChannelTab | "all"; companyId: number }) {
  const t = useTranslations("admin.channels");
  const tl = useTranslations("admin.channels.log");
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channel !== "all") params.set("channel", channel);
      params.set("limit", "80");
      const data = await apiCall<ChannelMessage[]>(`/admin/channels/messages/${companyId}?${params}`);
      setMessages(data);
    } finally {
      setLoading(false);
    }
  }, [channel, companyId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
    </div>
  );

  if (!messages.length) return (
    <p className="py-8 text-center text-[11px] text-muted">{tl("empty")}</p>
  );

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[10px] text-muted">{tl("countNewest", { n: messages.length })}</span>
        <button onClick={load} className="flex items-center gap-1 text-[10px] text-muted hover:text-tertiary">
          <RefreshCw className="h-3 w-3" /> {t("refresh")}
        </button>
      </div>
      {messages.map((msg) => {
        const isIn  = msg.direction === "inbound";
        const isExp = expanded === msg.id;
        return (
          <div key={msg.id} className="border-b border-subtle last:border-0">
            <button
              type="button"
              onClick={() => setExpanded(isExp ? null : msg.id)}
              className="flex w-full items-start gap-2.5 px-0 py-2 text-left hover:bg-surface-1"
            >
              <span className={`mt-0.5 shrink-0 ${isIn ? "text-accent/60" : "text-success/60"}`}>
                {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-secondary truncate">{msg.sender_ref}</span>
                  <span className={`shrink-0 rounded px-1 text-[8.5px] font-medium ${msg.channel === "whatsapp" ? "bg-success-muted text-emerald-300/60" : "bg-accent/10 text-accent/60"}`}>
                    {msg.channel}
                  </span>
                  {msg.intent && <IntentBadge intent={msg.intent} />}
                  <StatusBadge status={msg.status} />
                  <span className="ml-auto shrink-0 text-[9px] text-muted">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-muted">{msg.body || tl("noText")}</p>
              </div>
              <ChevronRight className={`mt-0.5 h-3 w-3 shrink-0 text-muted transition-transform ${isExp ? "rotate-90" : ""}`} />
            </button>
            {isExp && (
              <div className="mb-2 ml-6 rounded border border-subtle bg-surface-1 p-2.5 text-[10px] text-tertiary space-y-1">
                <p><span className="text-muted">{tl("detailId")}</span> {msg.id}</p>
                <p><span className="text-muted">{tl("detailThread")}</span> {msg.thread_id ?? " - "}</p>
                <p><span className="text-muted">{tl("detailUserId")}</span> {msg.user_id ?? " - "}</p>
                {msg.body && <p className="whitespace-pre-wrap"><span className="text-muted">{tl("detailBody")}</span> {msg.body}</p>}
                {msg.error_detail && <p className="text-error"><span className="text-muted">{tl("detailError")}</span> {msg.error_detail}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Dispatch Log (Phase 1.8) ───────────────────────────────────────────────────

interface DispatchRow {
  id: number;
  event_type: string;
  resource_type: string | null;
  resource_id: number | null;
  recipient_user_id: number | null;
  recipient_address: string | null;
  channel: string;
  status: string;
  attempts: number;
  last_error_text: string | null;
  created_at: string | null;
  sent_at: string | null;
}

function DispatchLog({ channel, companyId }: { channel: ChannelTab; companyId: number }) {
  const t = useTranslations("admin.channels");
  const td = useTranslations("admin.channels.dispatch");
  const [rows, setRows] = useState<DispatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "sent" | "failed">("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("channel", channel);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "100");
      const data = await apiCall<DispatchRow[]>(`/admin/channels/dispatches/${companyId}?${params}`);
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [channel, statusFilter, companyId]);

  useEffect(() => { void load(); }, [load]);

  const statusTone = (s: string) =>
    s === "sent" ? "bg-emerald-500/15 text-emerald-300"
      : s === "failed" ? "bg-rose-500/15 text-rose-300"
      : "bg-amber-500/15 text-warning";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {((["all", "pending", "sent", "failed"] as const).map((s) => {
            const labelKey = s === "all" ? "filterAll" : s === "pending" ? "filterPending" : s === "sent" ? "filterSent" : "filterFailed";
            return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-0.5 text-[10px] transition-colors ${
                statusFilter === s ? "bg-surface-2 text-secondary" : "text-muted hover:bg-surface-2 hover:text-secondary"
              }`}
            >
              {td(labelKey)}
            </button>
            );
          }))}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-secondary transition hover:border-strong hover:text-secondary disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t("refresh")}
        </button>
      </div>

      {error && (
        <div className="rounded border border-error bg-rose-500/[0.08] p-2 text-[10.5px] text-rose-200 break-all">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[11px] text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-default bg-surface-1 py-8 text-center text-[11px] text-muted">
          {td("empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-default">
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="border-b border-default bg-surface-1 text-left text-[9.5px] uppercase tracking-wide text-muted">
                <th className="px-2 py-1.5 font-medium">{td("colEvent")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colRecipient")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colStatus")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colAttempts")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-subtle last:border-b-0 hover:bg-surface-1">
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-secondary">{r.event_type}</span>
                    {r.resource_type && (
                      <span className="ml-1 text-[9.5px] text-muted">
                        · {r.resource_type}#{r.resource_id ?? " - "}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.recipient_address ? (
                      <span className="font-mono text-secondary">{r.recipient_address}</span>
                    ) : (
                      <span className="text-muted">user#{r.recipient_user_id ?? " - "}</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] ${statusTone(r.status)}`}>
                      {r.status}
                    </span>
                    {r.last_error_text && (
                      <div className="mt-0.5 max-w-xs truncate text-[9.5px] text-rose-300/70" title={r.last_error_text}>
                        {r.last_error_text}
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-secondary">{r.attempts}</td>
                  <td className="px-2 py-1.5 text-[10px] text-tertiary">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : " - "}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: ChannelStats | null }) {
  const t = useTranslations("admin.channels.stats");
  if (!stats) return null;
  return (
    <div className="flex items-center gap-4 border-b border-subtle px-4 py-2">
      <div className="text-center">
        <p className="text-[10px] text-muted">{t("total")}</p>
        <p className="text-[13px] font-semibold text-secondary">{stats.total_messages}</p>
      </div>
      <div className="h-8 w-px bg-surface-3" />
      {Object.entries(stats.by_channel).map(([ch, cnt]) => (
        <div key={ch} className="text-center">
          <p className="text-[10px] text-muted capitalize">{ch}</p>
          <p className="text-[13px] font-semibold text-secondary">{cnt}</p>
        </div>
      ))}
      {stats.errors > 0 && (
        <>
          <div className="h-8 w-px bg-surface-3" />
          <div className="text-center">
            <p className="text-[10px] text-error/60">{t("errors")}</p>
            <p className="text-[13px] font-semibold text-error">{stats.errors}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminChannelsPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.channels");
  const [channelTab, setChannelTab] = useState<ChannelTab>("email");
  const [subTab, setSubTab] = useState<SubTab>("settings");
  const [settings, setSettings] = useState<ChannelSettings[] | null>(null);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiCall<ChannelSettings[] | null>(`/admin/channels/settings/${companyId}`).catch(() => null),
      apiCall<ChannelStats | null>(`/admin/channels/stats/${companyId}`).catch(() => null),
    ]).then(([s, st]) => {
      setSettings(s);
      setStats(st);
    }).finally(() => setLoading(false));
  }, [companyId]);

  const current = settings?.find((s) => s.channel === channelTab) ?? null;

  function handleSaved(updated: ChannelSettings) {
    setSettings((prev) => prev?.map((s) => s.channel === updated.channel ? updated : s) ?? [updated]);
  }

  const waEnabled = settings?.find((s) => s.channel === "whatsapp")?.is_enabled ?? false;
  const emEnabled = settings?.find((s) => s.channel === "email")?.is_enabled ?? false;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-4">
      <PremiumHeader
        section="channels"
        icon={<MessageSquare className="h-4 w-4" />}
        title={t("title")}
        subtitle="Configure WhatsApp and Email communication channels"
        metrics={[
          {
            label: "total",
            value: stats?.total_messages ?? 0,
            tone: "neutral",
          },
          {
            label: "errors",
            value: stats?.errors ?? 0,
            tone: (stats?.errors ?? 0) > 0 ? "error" : "success",
          },
        ]}
      />

      {/* Main Tabs */}
      <div className="flex gap-0 border-b border-subtle">
        {(["whatsapp", "email"] as ChannelTab[]).map((ch) => {
          const enabled = ch === "whatsapp" ? waEnabled : emEnabled;
          return (
            <button
              key={ch}
              onClick={() => setChannelTab(ch)}
              className={`relative flex items-center gap-2 px-6 py-3 text-[11px] font-semibold transition-colors ${
                channelTab === ch
                  ? "text-primary"
                  : "text-muted hover:text-secondary"
              }`}
            >
              {ch === "whatsapp" ? <MessageSquare className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
              {ch === "whatsapp" ? t("tabWhatsApp") : t("tabEmail")}
              <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-success" : "bg-muted"}`} />
              {channelTab === ch && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent" />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex gap-6">
        {/* Sidebar Sub-Tabs */}
        <div className="w-44 shrink-0 space-y-1">
          {(["settings", "log", "dispatches"] as SubTab[]).map((st) => (
            <button
              key={st}
              onClick={() => setSubTab(st)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-[11px] font-medium transition-all ${
                subTab === st
                  ? "bg-accent-muted text-accent shadow-sm"
                  : "text-secondary hover:bg-surface-2 hover:text-primary"
              }`}
            >
              <span>{t(`subTab.${st.charAt(0).toUpperCase() + st.slice(1)}`)}</span>
              {subTab === st && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted" />
            </div>
          ) : subTab === "settings" ? (
            current ? (
              channelTab === "whatsapp"
                ? <WhatsAppSettingsForm settings={current} onSaved={handleSaved} companyId={companyId} />
                : <EmailSettingsForm settings={current} onSaved={handleSaved} companyId={companyId} />
            ) : (
              <p className="py-8 text-center text-[11px] text-muted">Could not load settings.</p>
            )
          ) : subTab === "log" ? (
            <MessageLog channel={channelTab} companyId={companyId} />
          ) : (
            <DispatchLog channel={channelTab} companyId={companyId} />
          )}
        </div>
      </div>
    </div>
  );
}
