"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare, Mail, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Send, Settings2, ChevronRight, ArrowDownLeft, ArrowUpRight,
  Loader2, Eye, EyeOff, Copy, Check,
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

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
type SubTab = "settings" | "log";

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
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="ml-1 text-white/22 hover:text-white/50 transition-colors"
      title="Copy"
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
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-white/40">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={isSet ? "••••••••  (stored — leave blank to keep)" : "Enter value…"}
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
      const r = await fetch(`${API}/admin/channels/settings/${companyId}/whatsapp`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      onSaved(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testRecipient.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/admin/channels/test/${companyId}/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: testRecipient }),
      });
      const d = await r.json();
      setTestResult(r.ok ? "✓ Message sent successfully" : d.detail ?? "Failed");
    } catch {
      setTestResult("Connection error");
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
          <p className="text-[11px] font-semibold text-white/75">WhatsApp Channel</p>
          <p className="text-[10px] text-white/35">Receive expenses and answer queries via WhatsApp Business</p>
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
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">Phone Number ID</label>
          <input value={form.wa_phone_number_id} onChange={field("wa_phone_number_id")}
            placeholder="From Meta App Dashboard"
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">WABA ID</label>
          <input value={form.wa_waba_id} onChange={field("wa_waba_id")}
            placeholder="WhatsApp Business Account ID"
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] font-medium text-white/40">Display Name</label>
          <input value={form.wa_display_name} onChange={field("wa_display_name")}
            placeholder="e.g. Acme Corp Expenses"
            className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
          />
        </div>
        <div className="col-span-2">
          <SecretField
            label="System User Access Token"
            value={form.wa_access_token}
            isSet={settings.wa_access_token_set}
            onChange={(v) => setForm((f) => ({ ...f, wa_access_token: v }))}
          />
        </div>
      </div>

      {/* Webhook info */}
      <div className="rounded border border-indigo-500/15 bg-indigo-500/[0.04] p-3 space-y-2">
        <p className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wide">Webhook Configuration (Meta App Dashboard)</p>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">Webhook URL</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 font-mono truncate">{webhookUrl}</code>
            <CopyButton value={webhookUrl} />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">Verify Token</p>
          <div className="flex items-center gap-1">
            <input
              value={form.wa_webhook_verify_token}
              onChange={field("wa_webhook_verify_token")}
              placeholder="Auto-generated on save if blank"
              className="flex-1 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-white/60 outline-none focus:border-indigo-500/50"
            />
            {form.wa_webhook_verify_token && <CopyButton value={form.wa_webhook_verify_token} />}
          </div>
        </div>
        <p className="text-[9.5px] text-white/25 leading-relaxed">
          Subscribe to the <strong className="text-white/40">messages</strong> field under Webhooks in your Meta App Dashboard. Use the URL and verify token above.
        </p>
      </div>

      {error && <p className="text-[10px] text-red-400">{error}</p>}

      <div className="flex items-center gap-2">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded bg-indigo-600/70 px-3 py-1.5 text-[11px] font-medium text-white/90 hover:bg-indigo-600/90 disabled:opacity-50">
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save Settings
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="+521234567890"
            className="w-32 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/[0.04] disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Test
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
      const r = await fetch(`${API}/admin/channels/settings/${companyId}/email`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(await r.text());
      onSaved(await r.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    if (!testRecipient.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const r = await fetch(`${API}/admin/channels/test/${companyId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: testRecipient }),
      });
      const d = await r.json();
      setTestResult(r.ok ? "✓ Email sent successfully" : d.detail ?? "Failed");
    } catch {
      setTestResult("Connection error");
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
          <p className="text-[11px] font-semibold text-white/75">Email Channel</p>
          <p className="text-[10px] text-white/35">Receive expense documents forwarded to a corporate email address</p>
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
        <label className="mb-0.5 block text-[10px] font-medium text-white/40">Corporate Inbound Address</label>
        <input value={form.email_inbound_address} onChange={field("email_inbound_address")}
          placeholder="gastos@yourcompany.com"
          className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
        />
        <p className="mt-0.5 text-[9.5px] text-white/25">Employees forward invoices to this address. Set up routing in your email provider to POST to the webhook below.</p>
      </div>

      {/* Webhook info */}
      <div className="rounded border border-indigo-500/15 bg-indigo-500/[0.04] p-3 space-y-2">
        <p className="text-[10px] font-semibold text-indigo-300/70 uppercase tracking-wide">Email Provider Webhook</p>
        <div>
          <p className="text-[10px] text-white/35 mb-0.5">Inbound Webhook URL</p>
          <div className="flex items-center gap-1">
            <code className="flex-1 rounded bg-white/[0.04] px-2 py-1 text-[10px] text-white/60 font-mono truncate">{inboundWebhook}</code>
            <CopyButton value={inboundWebhook} />
          </div>
        </div>
        <p className="text-[9.5px] text-white/25 leading-relaxed">
          Supports SendGrid Inbound Parse, Postmark Inbound, and Mailgun Routes.
          Append <code className="text-white/40">?provider=postmark</code> or <code className="text-white/40">?provider=mailgun</code> as needed.
        </p>
        <div className="col-span-2">
          <SecretField
            label="Webhook Signature Secret (optional)"
            value={form.email_webhook_secret}
            isSet={settings.email_webhook_secret_set}
            onChange={(v) => setForm((f) => ({ ...f, email_webhook_secret: v }))}
          />
        </div>
      </div>

      {/* SMTP */}
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">SMTP — Outbound Replies</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">SMTP Host</label>
            <input value={form.email_smtp_host} onChange={field("email_smtp_host")}
              placeholder="smtp.sendgrid.net"
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">SMTP Port</label>
            <input value={form.email_smtp_port} onChange={field("email_smtp_port")}
              placeholder="587"
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">SMTP User</label>
            <input value={form.email_smtp_user} onChange={field("email_smtp_user")}
              placeholder="apikey"
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div>
            <label className="mb-0.5 block text-[10px] font-medium text-white/40">From Address</label>
            <input value={form.email_smtp_from} onChange={field("email_smtp_from")}
              placeholder="gastos@yourcompany.com"
              className="w-full rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18 focus:border-indigo-500/50"
            />
          </div>
          <div className="col-span-2">
            <SecretField
              label="SMTP Password / API Key"
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
          Save Settings
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          <input value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)}
            placeholder="test@example.com"
            className="w-40 rounded border border-white/[0.08] bg-white/[0.04] px-2 py-1.5 text-[11px] text-white/75 outline-none placeholder:text-white/18"
          />
          <button onClick={sendTest} disabled={testing || !testRecipient.trim()}
            className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1.5 text-[11px] text-white/50 hover:bg-white/[0.04] disabled:opacity-40">
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
            Test
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
  const [messages, setMessages] = useState<ChannelMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (channel !== "all") params.set("channel", channel);
      params.set("limit", "80");
      const r = await fetch(`${API}/admin/channels/messages/${companyId}?${params}`);
      if (r.ok) setMessages(await r.json());
    } finally {
      setLoading(false);
    }
  }, [channel]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-white/28">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );

  if (!messages.length) return (
    <p className="py-8 text-center text-[11px] text-white/25">No messages yet.</p>
  );

  return (
    <div className="space-y-0">
      <div className="flex items-center justify-between pb-2">
        <span className="text-[10px] text-white/30">{messages.length} messages (newest first)</span>
        <button onClick={load} className="flex items-center gap-1 text-[10px] text-white/30 hover:text-white/55">
          <RefreshCw className="h-3 w-3" /> Refresh
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
                <p className="mt-0.5 truncate text-[10px] text-white/35">{msg.body || "(no text)"}</p>
              </div>
              <ChevronRight className={`mt-0.5 h-3 w-3 shrink-0 text-white/20 transition-transform ${isExp ? "rotate-90" : ""}`} />
            </button>
            {isExp && (
              <div className="mb-2 ml-6 rounded border border-white/[0.06] bg-white/[0.02] p-2.5 text-[10px] text-white/45 space-y-1">
                <p><span className="text-white/25">ID:</span> {msg.id}</p>
                <p><span className="text-white/25">Thread:</span> {msg.thread_id ?? "—"}</p>
                <p><span className="text-white/25">User ID:</span> {msg.user_id ?? "—"}</p>
                {msg.body && <p className="whitespace-pre-wrap"><span className="text-white/25">Body:</span> {msg.body}</p>}
                {msg.error_detail && <p className="text-red-400"><span className="text-white/25">Error:</span> {msg.error_detail}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Stats bar ──────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: ChannelStats | null }) {
  if (!stats) return null;
  return (
    <div className="flex items-center gap-4 border-b border-white/[0.06] px-4 py-2">
      <div className="text-center">
        <p className="text-[10px] text-white/30">Total</p>
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
            <p className="text-[10px] text-red-400/60">Errors</p>
            <p className="text-[13px] font-semibold text-red-400">{stats.errors}</p>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function AdminChannelsPanel({ companyId }: { companyId: number }) {
  const [channelTab, setChannelTab] = useState<ChannelTab>("whatsapp");
  const [subTab, setSubTab] = useState<SubTab>("settings");
  const [settings, setSettings] = useState<ChannelSettings[] | null>(null);
  const [stats, setStats] = useState<ChannelStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/channels/settings/${companyId}`).then((r) => r.ok ? r.json() : null),
      fetch(`${API}/admin/channels/stats/${companyId}`).then((r) => r.ok ? r.json() : null),
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
        {(["settings", "log"] as SubTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`flex items-center gap-1 px-3 py-2 text-[10.5px] font-medium capitalize transition-colors ${
              subTab === t ? "text-white/70" : "text-white/28 hover:text-white/50"
            }`}
          >
            {t === "settings" ? <Settings2 className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
            {t === "settings" ? "Configuration" : "Message Log"}
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
        ) : (
          <MessageLog channel={channelTab} companyId={companyId} />
        )}
      </div>
    </div>
  );
}
