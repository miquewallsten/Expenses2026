"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { apiCall, apiPatch } from "@/lib/api/client";
import {
  MessageSquare, Mail, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Send, Settings2, ChevronRight, ArrowDownLeft, ArrowUpRight,
  Loader2, Eye, EyeOff, Copy, Check,
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
    replied:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    received:   "bg-sky-500/10 text-sky-400 border-sky-500/20",
    processing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    error:      "bg-red-500/10 text-red-400 border-red-500/20",
    ignored:    "bg-white/5 text-white/28 border-white/10",
  };
  const cls = map[status] ?? "bg-white/5 text-white/28 border-white/10";
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${cls}`}>
      {status}
    </span>
  );
}

function IntentBadge({ intent }: { intent: string | null }) {
  if (!intent) return null;
  return (
    <span className="rounded border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-medium text-indigo-300/70">
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
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-1 text-white/22 hover:text-white/50 transition-colors"
      title={t("copy")}
    >
      {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
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
      <label className="mb-0.5 block text-[10px] font-medium text-white/40">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? t("secretStored") : t("secretEnter")}
          className="flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
        />
        <button type="button" onClick={() => setShow(!show)} className="text-white/22 hover:text-white/50">
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
      const d = await apiCall<{ detail?: string }>(`/admin/channels/test/${companyId}/whatsapp`, {
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

  const webhookUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace("3000", "8000")}/channels/whatsapp/webhook`
    : "/channels/whatsapp/webhook";

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold text-white/75">{tw("title")}</p>
          <p className="text-[10px] text-white/35">{tw("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
          className={`relative h-5 w-9 rounded-full transition-colors ${form.is_enabled ? "bg-emerald-500/70" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Credentials */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">{tw("phoneNumberId")}</label>
          <input value={form.wa_phone_number_id} onChange={field("wa_phone_number_id")}
            placeholder={tw("phoneNumberIdPlaceholder")}
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">{tw("wabaId")}</label>
          <input value={form.wa_waba_id} onChange={field("wa_waba_id")}
            placeholder={tw("wabaIdPlaceholder")}
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">{tw("displayName")}</label>
          <input value={form.wa_display_name} onChange={field("wa_display_name")}
            placeholder={tw("displayNamePlaceholder")}
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
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
      <div className="rounded border border-indigo-500/15 bg-indigo-500/[0.04] p-3 space-y-2">
        <p className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wide">{tw("webhookSection")}</p>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">{tw("webhookUrl")}</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 font-mono truncate">{webhookUrl}</code>
            <CopyButton value={webhookUrl} />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">{tw("verifyToken")}</p>
          <div className="flex items-center gap-1">
            <input
              value={form.wa_webhook_verify_token}
              onChange={field("wa_webhook_verify_token")}
              placeholder={tw("verifyTokenPlaceholder")}
              className="flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-white/60 outline-none focus:border-indigo-500/50"
            />
            {form.wa_webhook_verify_token && <CopyButton value={form.wa_webhook_verify_token} />}
          </div>
        </div>
        <p className="text-[9.5px] text-white/25 leading-relaxed">
          {tw.rich("webhookHelp", {
            strong: (chunks) => <strong className="text-white/40">{chunks}</strong>,
          })}
        </p>
      </div>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded bg-indigo-600/70 px-3 py-1.5 text-[11px] font-medium text-white/90 hover:bg-indigo-600/90 disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {t("saveSettings")}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder={tw("testPlaceholder")}
            className="w-32 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/[0.04] disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {t("test")}
          </button>
        </div>
      </div>

      {testResult && (
        <p className={`text-[10px] ${testResult.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{testResult}</p>
      )}
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
  });
  const t = useTranslations("admin.channels");
  const te = useTranslations("admin.channels.email");
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
      const body: Record<string, unknown> = {
        ...form,
        email_smtp_port: Number(form.email_smtp_port) || 587,
      };
      if (!body.email_smtp_password) delete body.email_smtp_password;
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

  const inboundWebhook = typeof window !== "undefined"
    ? `${window.location.origin.replace("3000", "8000")}/channels/email/inbound`
    : "/channels/email/inbound";

  return (
    <div className="space-y-5">
      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
        <div>
          <p className="text-[11px] font-semibold text-white/75">{te("title")}</p>
          <p className="text-[10px] text-white/35">{te("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_enabled: !f.is_enabled }))}
          className={`relative h-5 w-9 rounded-full transition-colors ${form.is_enabled ? "bg-emerald-500/70" : "bg-white/15"}`}
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.is_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Inbound address */}
      <div>
        <label className="mb-0.5 block text-[10px] font-medium text-white/40">{te("inboundAddress")}</label>
        <input value={form.email_inbound_address} onChange={field("email_inbound_address")}
          placeholder={te("inboundPlaceholder")}
          className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
        />
        <p className="mt-0.5 text-[9.5px] text-white/25">{te("inboundHelp")}</p>
      </div>

      {/* Webhook info */}
      <div className="rounded border border-indigo-500/15 bg-indigo-500/[0.04] p-3 space-y-2">
        <p className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wide">{te("webhookSection")}</p>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">{te("webhookUrl")}</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 font-mono truncate">{inboundWebhook}</code>
            <CopyButton value={inboundWebhook} />
          </div>
        </div>
        <p className="text-[9.5px] text-white/25 leading-relaxed">
          {te.rich("webhookHelp", {
            code: (chunks) => <code className="text-white/40">{chunks}</code>,
          })}
        </p>
        <div className="col-span-2">
          <SecretField
            label={te("webhookSecret")}
            value={form.email_webhook_secret}
            isSet={settings.email_webhook_secret_set}
            onChange={(v) => setForm((f) => ({ ...f, email_webhook_secret: v }))}
          />
        </div>
      </div>

      {/* SMTP */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">{te("smtpSection")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">{te("smtpHost")}</label>
            <input value={form.email_smtp_host} onChange={field("email_smtp_host")}
              placeholder={te("smtpHostPlaceholder")}
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">{te("smtpPort")}</label>
            <input value={form.email_smtp_port} onChange={field("email_smtp_port")}
              placeholder="587"
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">{te("smtpUser")}</label>
            <input value={form.email_smtp_user} onChange={field("email_smtp_user")}
              placeholder={te("smtpUserPlaceholder")}
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">{te("smtpFrom")}</label>
            <input value={form.email_smtp_from} onChange={field("email_smtp_from")}
              placeholder={te("smtpFromPlaceholder")}
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div className="col-span-2">
            <SecretField
              label={te("smtpPassword")}
              value={form.email_smtp_password}
              isSet={settings.email_smtp_password_set}
              onChange={(v) => setForm((f) => ({ ...f, email_smtp_password: v }))}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded bg-indigo-600/70 px-3 py-1.5 text-[11px] font-medium text-white/90 hover:bg-indigo-600/90 disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {t("saveSettings")}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder={te("testPlaceholder")}
            className="w-40 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/[0.04] disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            {t("test")}
          </button>
        </div>
      </div>

      {testResult && (
        <p className={`text-[10px] ${testResult.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{testResult}</p>
      )}
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
  }, [channel]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-white/28">
      <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
    </div>
  );

  if (!messages.length) return (
    <p className="py-8 text-center text-[11px] text-white/25">{tl("empty")}</p>
  );

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[10px] text-white/30">{tl("countNewest", { n: messages.length })}</span>
        <button onClick={load} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/55">
          <RefreshCw className="h-3 w-3" /> {t("refresh")}
        </button>
      </div>
      {messages.map((msg) => {
        const isIn  = msg.direction === "inbound";
        const isExp = expanded === msg.id;
        return (
          <div key={msg.id} className="border-b border-white/[0.05] last:border-0">
            <button
              type="button"
              onClick={() => setExpanded(isExp ? null : msg.id)}
              className="flex w-full items-start gap-2.5 px-0 py-2 text-left hover:bg-white/[0.02]"
            >
              <span className={`mt-0.5 shrink-0 ${isIn ? "text-sky-400/60" : "text-emerald-400/60"}`}>
                {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium text-white/65 truncate">{msg.sender_ref}</span>
                  <span className={`shrink-0 rounded px-1 text-[8.5px] font-medium ${msg.channel === "whatsapp" ? "bg-emerald-500/10 text-emerald-300/60" : "bg-sky-500/10 text-sky-300/60"}`}>
                    {msg.channel}
                  </span>
                  {msg.intent && <IntentBadge intent={msg.intent} />}
                  <StatusBadge status={msg.status} />
                  <span className="ml-auto shrink-0 text-[9px] text-white/22">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-white/35">{msg.body || tl("noText")}</p>
              </div>
              <ChevronRight className={`mt-0.5 h-3 w-3 shrink-0 text-white/20 transition-transform ${isExp ? "rotate-90" : ""}`} />
            </button>
            {isExp && (
              <div className="mb-2 ml-6 rounded border border-white/[0.06] bg-white/[0.02] p-2.5 text-[10px] text-white/45 space-y-1">
                <p><span className="text-white/25">{tl("detailId")}</span> {msg.id}</p>
                <p><span className="text-white/25">{tl("detailThread")}</span> {msg.thread_id ?? "—"}</p>
                <p><span className="text-white/25">{tl("detailUserId")}</span> {msg.user_id ?? "—"}</p>
                {msg.body && <p className="whitespace-pre-wrap"><span className="text-white/25">{tl("detailBody")}</span> {msg.body}</p>}
                {msg.error_detail && <p className="text-red-400"><span className="text-white/25">{tl("detailError")}</span> {msg.error_detail}</p>}
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
      : "bg-amber-500/15 text-amber-300";

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
                statusFilter === s ? "bg-white/[0.10] text-white/80" : "text-white/35 hover:bg-white/[0.04] hover:text-white/60"
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
          className="flex items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 transition hover:border-white/20 hover:text-white/80 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {t("refresh")}
        </button>
      </div>

      {error && (
        <div className="rounded border border-rose-500/30 bg-rose-500/[0.08] p-2 text-[10.5px] text-rose-200 break-all">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[11px] text-white/30">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded border border-white/[0.07] bg-white/[0.02] py-8 text-center text-[11px] text-white/35">
          {td("empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-white/[0.07]">
          <table className="w-full text-[10.5px]">
            <thead>
              <tr className="border-b border-white/[0.07] bg-white/[0.02] text-left text-[9.5px] uppercase tracking-wide text-white/35">
                <th className="px-2 py-1.5 font-medium">{td("colEvent")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colRecipient")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colStatus")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colAttempts")}</th>
                <th className="px-2 py-1.5 font-medium">{td("colCreated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02]">
                  <td className="px-2 py-1.5">
                    <span className="font-mono text-white/75">{r.event_type}</span>
                    {r.resource_type && (
                      <span className="ml-1 text-[9.5px] text-white/30">
                        · {r.resource_type}#{r.resource_id ?? "—"}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5">
                    {r.recipient_address ? (
                      <span className="font-mono text-white/65">{r.recipient_address}</span>
                    ) : (
                      <span className="text-white/30">user#{r.recipient_user_id ?? "—"}</span>
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
                  <td className="px-2 py-1.5 tabular-nums text-white/60">{r.attempts}</td>
                  <td className="px-2 py-1.5 text-[10px] text-white/40">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
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
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-2">
      <div className="text-center">
        <p className="text-[10px] text-white/30">{t("total")}</p>
        <p className="text-[13px] font-semibold text-white/70">{stats.total_messages}</p>
      </div>
      <div className="h-8 w-px bg-white/[0.07]" />
      {Object.entries(stats.by_channel).map(([ch, cnt]) => (
        <div key={ch} className="text-center">
          <p className="text-[10px] text-white/30 capitalize">{ch}</p>
          <p className="text-[13px] font-semibold text-white/70">{cnt}</p>
        </div>
      ))}
      {stats.errors > 0 && (
        <>
          <div className="h-8 w-px bg-white/[0.07]" />
          <div className="text-center">
            <p className="text-[10px] text-red-400/60">{t("errors")}</p>
            <p className="text-[13px] font-semibold text-red-400">{stats.errors}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminChannelsPanel({ companyId }: { companyId: number }) {
  const t = useTranslations("admin.channels");
  const [channelTab, setChannelTab] = useState<ChannelTab>("whatsapp");
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
  }, []);

  const current = settings?.find((s) => s.channel === channelTab) ?? null;

  function handleSaved(updated: ChannelSettings) {
    setSettings((prev) => prev?.map((s) => s.channel === updated.channel ? updated : s) ?? [updated]);
  }

  const waEnabled = settings?.find((s) => s.channel === "whatsapp")?.is_enabled ?? false;
  const emEnabled = settings?.find((s) => s.channel === "email")?.is_enabled ?? false;

  return (
    <div className="flex min-h-0 flex-col">
      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* Channel tabs */}
      <div className="flex shrink-0 items-center gap-0 border-b border-white/[0.06] px-4">
        {(["whatsapp", "email"] as ChannelTab[]).map((ch) => {
          const enabled = ch === "whatsapp" ? waEnabled : emEnabled;
          return (
            <button
              key={ch}
              onClick={() => setChannelTab(ch)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[11px] font-medium transition-colors ${
                channelTab === ch
                  ? "border-indigo-400/60 text-white/80"
                  : "border-transparent text-white/35 hover:text-white/55"
              }`}
            >
              {ch === "whatsapp"
                ? <MessageSquare className="h-3.5 w-3.5" />
                : <Mail className="h-3.5 w-3.5" />}
              {ch === "whatsapp" ? "WhatsApp" : "Email"}
              <span className={`ml-0.5 h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400" : "bg-white/20"}`} />
            </button>
          );
        })}
      </div>

      {/* Sub-tabs */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-0">
        {((["settings", "log", "dispatches"]) as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex items-center gap-1 px-3 py-2 text-[10.5px] font-medium capitalize transition-colors ${
              subTab === t ? "text-white/70" : "text-white/28 hover:text-white/50"
            }`}
          >
            {t === "settings" ? <Settings2 className="h-3 w-3" /> : t === "log" ? <MessageSquare className="h-3 w-3" /> : <Send className="h-3 w-3" />}
            {t === "settings" ? "Configuration" : t === "log" ? "Message Log" : "Dispatches"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-white/28">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : subTab === "settings" ? (
          current ? (
            channelTab === "whatsapp"
              ? <WhatsAppSettingsForm settings={current} onSaved={handleSaved} companyId={companyId} />
              : <EmailSettingsForm settings={current} onSaved={handleSaved} companyId={companyId} />
          ) : (
            <p className="py-8 text-center text-[11px] text-white/25">Could not load settings.</p>
          )
        ) : subTab === "log" ? (
          <MessageLog channel={channelTab} companyId={companyId} />
        ) : (
          <DispatchLog channel={channelTab} companyId={companyId} />
        )}
      </div>
    </div>
  );
}
