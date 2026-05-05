// web/app/super-admin/llm-config/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, X, Zap } from "lucide-react";
import {
  listLLMConfigs, upsertLLMConfig, deleteLLMConfig, testLLMConnection, LLMConfig,
} from "@/lib/api/llm-config";
import LLMConfigAssistant from "@/components/super-admin/LLMConfigAssistant";

const PROVIDERS = [
  { key: "openai", label: "Ollama Cloud", hint: "GLM, DeepSeek, Qwen via ollama.com/v1 API." },
  { key: "ollama", label: "Ollama (Local)", hint: "Runs on your machine. No API cost." },
  { key: "anthropic", label: "Anthropic", hint: "Claude models. Requires ANTHROPIC_API_KEY env var." },
] as const;

const POPULAR_MODELS: Record<string, string[]> = {
  openai: [
    "glm-5:cloud",
    "gpt-oss:20b-cloud",
    "deepseek-v3.2:cloud",
    "qwen3.5:cloud",
    "devstral-2:123b-cloud",
  ],
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
};

export default function LLMConfigPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editing, setEditing] = useState<Partial<LLMConfig>>({ provider: "ollama", model_name: "llama3.2", company_id: null });
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; error: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSavingCfg] = useState(false);

  const globalConfig = configs.find(c => c.company_id === null);
  const tenantConfigs = configs.filter(c => c.company_id !== null);

  useEffect(() => {
    listLLMConfigs().then(setConfigs).catch(console.error);
  }, []);

  useEffect(() => {
    if (globalConfig) {
      // Defer to avoid setState-during-render warning
      const id = setTimeout(() => setEditing({ ...globalConfig }), 0);
      return () => clearTimeout(id);
    }
  }, [globalConfig]);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await testLLMConnection(editing);
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, latency_ms: 0, error: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSavingCfg(true);
    try {
      const updated = await upsertLLMConfig({ ...editing, company_id: null });
      setConfigs(prev => {
        const without = prev.filter(c => c.company_id !== null);
        return [updated, ...without];
      });
    } finally {
      setSavingCfg(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-5">
      <header className="mb-5">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-primary">LLM Configuration</h1>
        <p className="mt-0.5 text-[10.5px] text-tertiary">
          Global provider used by all agents. Tenants can override below.
        </p>
      </header>

      {/* Provider selector */}
      <div className="mb-4">
        <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-2">Provider</div>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.key} onClick={() => setEditing(prev => ({ ...prev, provider: p.key }))}
              className={`rounded border px-3 py-2 text-left transition-colors ${editing.provider === p.key ? "bg-accent-muted bg-accent-muted" : "border-subtle bg-surface-1 hover:bg-surface-2"}`}>
              <div className={`text-[11px] font-semibold ${editing.provider === p.key ? "text-accent/90" : "text-secondary"}`}>{p.label}</div>
              <div className="text-[9px] text-muted mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Config fields */}
      <div className="rounded border border-subtle bg-surface-1 p-4 space-y-3 mb-4">
        <div>
          <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">Model Name</label>
          <div className="flex gap-2">
            <input value={editing.model_name || ""} onChange={e => setEditing(p => ({ ...p, model_name: e.target.value }))}
              placeholder={editing.provider === "ollama" ? "llama3.2" : editing.provider === "anthropic" ? "claude-sonnet-4-6" : "glm-5:cloud"}
              className="flex-1 rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:outline-none focus:bg-accent-muted font-mono" />
            {editing.provider && POPULAR_MODELS[editing.provider] && (
              <select
                onChange={e => setEditing(p => ({ ...p, model_name: e.target.value }))}
                className="rounded border border-default bg-surface-1 px-2 py-1.5 text-[10px] text-tertiary"
              >
                <option value="">Quick select…</option>
                {POPULAR_MODELS[editing.provider].map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        {editing.provider === "openai" && (
          <div>
            <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">Base URL</label>
            <input value={editing.base_url || ""} onChange={e => setEditing(p => ({ ...p, base_url: e.target.value }))}
              placeholder="https://ollama.com/v1"
              className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary font-mono focus:outline-none focus:bg-accent-muted" />
          </div>
        )}
        {editing.provider === "ollama" && (
          <div>
            <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">Base URL</label>
            <input value={editing.base_url || ""} onChange={e => setEditing(p => ({ ...p, base_url: e.target.value }))}
              placeholder="http://localhost:11434"
              className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:outline-none focus:bg-accent-muted" />
          </div>
        )}
        {editing.provider !== "ollama" && (
          <div>
            <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">API Key Env Var</label>
            <input value={editing.api_key_env_ref || ""} onChange={e => setEditing(p => ({ ...p, api_key_env_ref: e.target.value }))}
              placeholder={editing.provider === "openai" ? "LLM_API_KEY" : "ANTHROPIC_API_KEY"}
              className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary font-mono focus:outline-none focus:bg-accent-muted" />
            <p className="text-[9px] text-muted mt-1">Name of the environment variable on the server — key is never stored in the database.</p>
          </div>
        )}
      </div>

      {/* Test + Save */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-default bg-surface-1 text-[11px] text-tertiary hover:bg-surface-2 disabled:opacity-40">
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Test Connection
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 rounded border bg-accent-muted bg-accent-muted text-[11px] text-accent hover:bg-accent-hover/15 disabled:opacity-40">
          {saving ? "Saving…" : "Save as Global Default"}
        </button>
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[10px] ${testResult.ok ? "text-success" : "text-error"}`}>
            {testResult.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {testResult.ok ? `${testResult.latency_ms}ms` : testResult.error}
          </div>
        )}
      </div>

      {/* Per-tenant overrides */}
      {tenantConfigs.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-2">Per-Tenant Overrides</div>
          <div className="rounded border border-subtle bg-surface-1 overflow-hidden">
            {tenantConfigs.map((c, i) => (
              <div key={c.id} className={`flex items-center px-3 py-2 gap-3 ${i > 0 ? "border-t border-subtle" : ""}`}>
                <span className="text-[10px] text-secondary flex-1">Company #{c.company_id}</span>
                <span className="text-[10px] text-tertiary">{c.provider}</span>
                <span className="text-[10px] text-tertiary font-mono">{c.model_name}</span>
                <button onClick={async () => { await deleteLLMConfig(c.id); setConfigs(p => p.filter(x => x.id !== c.id)); }}
                  className="text-muted hover:text-error/70">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <LLMConfigAssistant
        currentProvider={editing.provider}
        currentModel={editing.model_name}
      />
    </div>
  );
}
