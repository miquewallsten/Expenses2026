"use client";

/**
 * Phase 4.2 frontend — platform API admin section.
 *
 * Wraps GET/POST/DELETE /admin/platform-api/{cid}/keys and
 * GET/POST/PATCH/DELETE /admin/platform-api/{cid}/webhooks.
 * Two stacked panels: API Keys (issuance + revoke) and Webhook
 * Subscriptions (create + toggle + delete). Plaintext key + webhook
 * secret are shown exactly once on creation.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  KeyRound,
  Plus,
  Loader2,
  RefreshCw,
  Trash2,
  Webhook,
  Power,
  PowerOff,
  Copy,
  Check,
  AlertTriangle,
} from "lucide-react";
import { getCurrentCompanyId, getAuthHeaders } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface ApiKeyRow {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

interface WebhookRow {
  id: number;
  event_type: string;
  target_url: string;
  is_enabled: boolean;
  description: string | null;
  secret_preview: string;
  created_at: string | null;
}

const SCOPE_PRESETS = [
  "expenses:read",
  "expenses:write",
  "masterdata:read",
  "payments:write",
  "*",
] as const;

const EVENT_PRESETS = [
  "*",
  "expense.approved",
  "expense.returned",
  "poliza.ready",
  "cfdi.cancelled",
] as const;

export default function PlatformApiSection() {
  const t = useTranslations("admin.platformApi");
  const [companyId, setCompanyId] = useState<number | null>(null);

  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [hooks, setHooks] = useState<WebhookRow[]>([]);
  const [hooksLoading, setHooksLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Key form
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["expenses:read"]);

  // Webhook form
  const [hookEvent, setHookEvent] = useState<string>("expense.approved");
  const [hookUrl, setHookUrl] = useState("");
  const [hookDesc, setHookDesc] = useState("");

  useEffect(() => {
    const cid = getCurrentCompanyId();
    if (cid) setCompanyId(Number(cid));
  }, []);

  const loadKeys = useCallback(async (cid: number) => {
    setKeysLoading(true);
    try {
      const res = await fetch(`${API}/admin/platform-api/${cid}/keys`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      setKeys(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setKeysLoading(false);
    }
  }, []);

  const loadHooks = useCallback(async (cid: number) => {
    setHooksLoading(true);
    try {
      const res = await fetch(`${API}/admin/platform-api/${cid}/webhooks`, {
        headers: { ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      setHooks(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setHooksLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) return;
    void loadKeys(companyId);
    void loadHooks(companyId);
  }, [companyId, loadKeys, loadHooks]);

  const toggleScope = (s: string) =>
    setKeyScopes((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );

  const createKey = useCallback(async () => {
    if (!companyId || !keyName.trim() || keyScopes.length === 0) return;
    setBusyId("new-key");
    setError(null);
    try {
      const res = await fetch(`${API}/admin/platform-api/${companyId}/keys`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), scopes: keyScopes }),
      });
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      const body = (await res.json()) as { row: ApiKeyRow; plaintext: string };
      setKeys((prev) => [body.row, ...prev]);
      setRevealedKey(body.plaintext);
      setKeyName("");
      setKeyScopes(["expenses:read"]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }, [companyId, keyName, keyScopes]);

  const revokeKey = useCallback(
    async (row: ApiKeyRow) => {
      if (!companyId) return;
      if (!window.confirm(t("keys.confirmRevoke"))) return;
      setBusyId(`key-${row.id}`);
      setError(null);
      try {
        const res = await fetch(
          `${API}/admin/platform-api/${companyId}/keys/${row.id}`,
          { method: "DELETE", headers: { ...getAuthHeaders() } },
        );
        if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
        setKeys((prev) =>
          prev.map((k) =>
            k.id === row.id ? { ...k, revoked_at: new Date().toISOString() } : k,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t],
  );

  const createHook = useCallback(async () => {
    if (!companyId || !hookEvent.trim() || !hookUrl.trim()) return;
    setBusyId("new-hook");
    setError(null);
    try {
      const res = await fetch(
        `${API}/admin/platform-api/${companyId}/webhooks`,
        {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: hookEvent.trim(),
            target_url: hookUrl.trim(),
            description: hookDesc.trim() || null,
          }),
        },
      );
      if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
      const body = (await res.json()) as { row: WebhookRow; secret: string };
      setHooks((prev) => [body.row, ...prev]);
      setRevealedSecret(body.secret);
      setHookUrl("");
      setHookDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }, [companyId, hookEvent, hookUrl, hookDesc]);

  const toggleHook = useCallback(
    async (row: WebhookRow) => {
      if (!companyId) return;
      setBusyId(`hook-${row.id}`);
      setError(null);
      try {
        const res = await fetch(
          `${API}/admin/platform-api/${companyId}/webhooks/${row.id}`,
          {
            method: "PATCH",
            headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ is_enabled: !row.is_enabled }),
          },
        );
        if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
        const updated = (await res.json()) as WebhookRow;
        setHooks((prev) => prev.map((h) => (h.id === row.id ? updated : h)));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId],
  );

  const deleteHook = useCallback(
    async (row: WebhookRow) => {
      if (!companyId) return;
      if (!window.confirm(t("webhooks.confirmDelete"))) return;
      setBusyId(`hook-${row.id}`);
      setError(null);
      try {
        const res = await fetch(
          `${API}/admin/platform-api/${companyId}/webhooks/${row.id}`,
          { method: "DELETE", headers: { ...getAuthHeaders() } },
        );
        if (!res.ok) throw new Error((await res.text()) || `${res.status}`);
        setHooks((prev) => prev.filter((h) => h.id !== row.id));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
      } finally {
        setBusyId(null);
      }
    },
    [companyId, t],
  );

  const copy = useCallback(async (val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, []);

  if (!companyId) {
    return (
      <main className="min-h-screen bg-surface-0 text-primary">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded border border-amber-500/20 bg-amber-500/[0.05] p-4 text-[12px] text-warning/80">
            {t("noCompany")}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-surface-0 text-primary">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Premium header */}
        <div className="relative overflow-hidden rounded-lg border border-default bg-gradient-to-r from-surface-1 via-surface-1 to-cyan-500/[0.02] px-4 py-3 mb-5">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--color-cyan-500)/5%,_transparent_50%)]" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10">
                <KeyRound className="h-4 w-4 text-cyan-400" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-sm font-semibold text-primary">{t("title")}</h1>
                <span className="text-[9px] text-muted">{t("subtitle")}</span>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-3 flex items-start gap-2 rounded border border-error bg-rose-500/[0.06] px-3 py-2 text-[10.5px] text-rose-200/85">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span className="break-all">{error}</span>
          </div>
        )}

        {/* Reveal banner — plaintext key */}
        {revealedKey && (
          <div className="mb-5 rounded border border-cyan-500/30 bg-accent/[0.06] p-3">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-cyan-200/85">
              <span>{t("keys.revealHeader")}</span>
              <button
                type="button"
                onClick={() => setRevealedKey(null)}
                className="text-cyan-300/55 hover:text-cyan-200"
              >
                ×
              </button>
            </div>
            <p className="mb-2 text-[10px] text-cyan-200/55">{t("keys.revealBody")}</p>
            <div className="flex items-center gap-2 rounded border border-cyan-500/20 bg-surface-0/60 px-2 py-1.5">
              <code className="flex-1 break-all font-mono text-[11px] text-cyan-100">
                {revealedKey}
              </code>
              <button
                type="button"
                onClick={() => copy(revealedKey)}
                className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-secondary transition hover:border-strong hover:text-primary"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>
        )}

        {/* ── API Keys ─────────────────────────────────────────────────── */}
        <section className="mb-7">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">
              {t("keys.title")}
            </h2>
            <button
              type="button"
              onClick={() => companyId && void loadKeys(companyId)}
              disabled={keysLoading}
              className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
            >
              {keysLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("refresh")}
            </button>
          </div>

          {/* New key form */}
          <div className="mb-3 rounded border border-default bg-surface-1 p-3">
            <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">
                  {t("keys.name")}
                </span>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="ERP Bridge"
                  className="rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary outline-none focus:border-cyan-500/40"
                />
              </label>
              <div className="flex flex-col gap-1 md:col-span-2">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">
                  {t("keys.scopes")}
                </span>
                <div className="flex flex-wrap gap-1">
                  {SCOPE_PRESETS.map((s) => {
                    const on = keyScopes.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleScope(s)}
                        className={`rounded border px-1.5 py-0.5 font-mono text-[10px] transition ${
                          on
                            ? "border-cyan-500/40 bg-accent/[0.10] text-cyan-200/90"
                            : "border-subtle bg-surface-1 text-tertiary hover:border-strong hover:text-secondary"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void createKey()}
              disabled={busyId === "new-key" || !keyName.trim() || keyScopes.length === 0}
              className="flex items-center gap-1 rounded border border-cyan-500/40 bg-accent/[0.10] px-3 py-1 text-[10.5px] font-medium text-cyan-200/90 transition hover:bg-accent/[0.18] disabled:opacity-40"
            >
              {busyId === "new-key" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {t("keys.create")}
            </button>
          </div>

          {/* Keys table */}
          {keysLoading ? (
            <div className="flex items-center gap-2 py-6 text-[11px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
            </div>
          ) : keys.length === 0 ? (
            <div className="rounded border border-default bg-surface-1 py-8 text-center text-[11px] text-muted">
              {t("keys.empty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-default">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-default bg-surface-1 text-left text-[9.5px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1.5 font-medium">{t("keys.th.name")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("keys.th.prefix")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("keys.th.scopes")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("keys.th.lastUsed")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("keys.th.status")}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-subtle last:border-b-0 hover:bg-surface-1">
                      <td className="px-2 py-1.5 text-secondary">{k.name}</td>
                      <td className="px-2 py-1.5 font-mono text-tertiary">{k.key_prefix}…</td>
                      <td className="px-2 py-1.5">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-surface-2 px-1 py-0 font-mono text-[9.5px] text-tertiary"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-tertiary">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        {k.revoked_at ? (
                          <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] text-rose-300">
                            {t("keys.statusRevoked")}
                          </span>
                        ) : (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] text-emerald-300">
                            {t("keys.statusActive")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {!k.revoked_at && (
                          <button
                            type="button"
                            onClick={() => void revokeKey(k)}
                            disabled={busyId === `key-${k.id}`}
                            className="rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-[10px] text-rose-300/80 transition hover:border-rose-500/40 hover:bg-rose-500/[0.10] disabled:opacity-40"
                          >
                            {busyId === `key-${k.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Webhooks ─────────────────────────────────────────────────── */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">
              <Webhook className="h-3 w-3 text-tertiary" />
              {t("webhooks.title")}
            </h2>
            <button
              type="button"
              onClick={() => companyId && void loadHooks(companyId)}
              disabled={hooksLoading}
              className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-tertiary transition hover:border-strong hover:text-secondary disabled:opacity-50"
            >
              {hooksLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("refresh")}
            </button>
          </div>

          {/* Reveal banner — webhook secret */}
          {revealedSecret && (
            <div className="mb-3 rounded border border-cyan-500/30 bg-accent/[0.06] p-3">
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-cyan-200/85">
                <span>{t("webhooks.revealHeader")}</span>
                <button
                  type="button"
                  onClick={() => setRevealedSecret(null)}
                  className="text-cyan-300/55 hover:text-cyan-200"
                >
                  ×
                </button>
              </div>
              <p className="mb-2 text-[10px] text-cyan-200/55">{t("webhooks.revealBody")}</p>
              <div className="flex items-center gap-2 rounded border border-cyan-500/20 bg-surface-0/60 px-2 py-1.5">
                <code className="flex-1 break-all font-mono text-[11px] text-cyan-100">
                  {revealedSecret}
                </code>
                <button
                  type="button"
                  onClick={() => copy(revealedSecret)}
                  className="flex items-center gap-1 rounded border border-subtle bg-surface-2 px-2 py-1 text-[10px] text-secondary transition hover:border-strong hover:text-primary"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? t("copied") : t("copy")}
                </button>
              </div>
            </div>
          )}

          {/* New webhook form */}
          <div className="mb-3 rounded border border-default bg-surface-1 p-3">
            <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">
                  {t("webhooks.event")}
                </span>
                <select
                  value={hookEvent}
                  onChange={(e) => setHookEvent(e.target.value)}
                  className="rounded border border-default bg-surface-0 px-2 py-1 font-mono text-[11px] text-primary outline-none focus:border-cyan-500/40"
                >
                  {EVENT_PRESETS.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">
                  {t("webhooks.targetUrl")}
                </span>
                <input
                  type="url"
                  value={hookUrl}
                  onChange={(e) => setHookUrl(e.target.value)}
                  placeholder="https://erp.example.com/webhooks/foplat"
                  className="rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary outline-none focus:border-cyan-500/40"
                />
              </label>
              <label className="flex flex-col gap-1 md:col-span-3">
                <span className="text-[9.5px] uppercase tracking-wide text-muted">
                  {t("webhooks.description")}
                </span>
                <input
                  type="text"
                  value={hookDesc}
                  onChange={(e) => setHookDesc(e.target.value)}
                  className="rounded border border-default bg-surface-0 px-2 py-1 text-[11px] text-primary outline-none focus:border-cyan-500/40"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => void createHook()}
              disabled={busyId === "new-hook" || !hookUrl.trim()}
              className="flex items-center gap-1 rounded border border-cyan-500/40 bg-accent/[0.10] px-3 py-1 text-[10.5px] font-medium text-cyan-200/90 transition hover:bg-accent/[0.18] disabled:opacity-40"
            >
              {busyId === "new-hook" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {t("webhooks.create")}
            </button>
          </div>

          {/* Webhooks table */}
          {hooksLoading ? (
            <div className="flex items-center gap-2 py-6 text-[11px] text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("loading")}
            </div>
          ) : hooks.length === 0 ? (
            <div className="rounded border border-default bg-surface-1 py-8 text-center text-[11px] text-muted">
              {t("webhooks.empty")}
            </div>
          ) : (
            <div className="overflow-hidden rounded border border-default">
              <table className="w-full text-[10.5px]">
                <thead>
                  <tr className="border-b border-default bg-surface-1 text-left text-[9.5px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-1.5 font-medium">{t("webhooks.th.event")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("webhooks.th.target")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("webhooks.th.secret")}</th>
                    <th className="px-2 py-1.5 font-medium">{t("webhooks.th.status")}</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {hooks.map((h) => (
                    <tr key={h.id} className="border-b border-subtle last:border-b-0 hover:bg-surface-1">
                      <td className="px-2 py-1.5 font-mono text-secondary">{h.event_type}</td>
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-secondary break-all">{h.target_url}</div>
                        {h.description && (
                          <div className="text-[9.5px] text-muted">{h.description}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-tertiary">{h.secret_preview}</td>
                      <td className="px-2 py-1.5">
                        {h.is_enabled ? (
                          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9.5px] text-emerald-300">
                            {t("webhooks.statusEnabled")}
                          </span>
                        ) : (
                          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[9.5px] text-tertiary">
                            {t("webhooks.statusDisabled")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void toggleHook(h)}
                            disabled={busyId === `hook-${h.id}`}
                            className="rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-[10px] text-secondary transition hover:border-strong hover:text-primary disabled:opacity-40"
                            title={h.is_enabled ? t("webhooks.disable") : t("webhooks.enable")}
                          >
                            {busyId === `hook-${h.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : h.is_enabled ? (
                              <PowerOff className="h-3 w-3" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteHook(h)}
                            disabled={busyId === `hook-${h.id}`}
                            className="rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-[10px] text-rose-300/80 transition hover:border-rose-500/40 hover:bg-rose-500/[0.10] disabled:opacity-40"
                            title={t("webhooks.delete")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
