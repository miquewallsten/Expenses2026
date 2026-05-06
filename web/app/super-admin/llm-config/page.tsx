// web/app/super-admin/llm-config/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, Send, X, Zap, MessageSquare, Trash2, Copy } from "lucide-react";
import {
  listLLMConfigs, upsertLLMConfig, deleteLLMConfig, testLLMConnection, testLLMChat, LLMConfig,
} from "@/lib/api/llm-config";
import LLMConfigAssistant from "@/components/super-admin/LLMConfigAssistant";

const PROVIDERS = [
  { key: "ollama-cloud", label: "Ollama Cloud", hint: "GLM, DeepSeek, Qwen via ollama.com/api. Requires API key.", baseUrl: "https://ollama.com", defaultModel: "glm-5", defaultApiKeyEnv: "LLM_API_KEY" },
  { key: "ollama", label: "Ollama (Local)", hint: "Runs on your machine. No API cost.", baseUrl: "http://localhost:11434", defaultModel: "llama3.2", defaultApiKeyEnv: "" },
  { key: "anthropic", label: "Anthropic", hint: "Claude models. Requires ANTHROPIC_API_KEY env var.", baseUrl: "https://api.anthropic.com", defaultModel: "claude-sonnet-4-6", defaultApiKeyEnv: "ANTHROPIC_API_KEY" },
] as const;

const POPULAR_MODELS: Record<string, string[]> = {
  "ollama-cloud": [
    "glm-5",
    "glm-5.1",
    "deepseek-v4-flash",
    "deepseek-v4-pro",
    "qwen3.5",
    "gemma4",
    "kimi-k2.6",
    "ministral-3",
    "nemotron-3-super",
  ],
  ollama: ["llama3.2", "llama3.1", "mistral", "codellama"],
  anthropic: ["claude-sonnet-4-6", "claude-opus-4-7", "claude-haiku-4-5-20251001"],
};

interface ChatResult {
  model: string;
  prompt: string;
  response: string;
  latency_ms: number;
  ok: boolean;
  error?: string;
}

export default function LLMConfigPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editing, setEditing] = useState<Partial<LLMConfig>>({ provider: "ollama-cloud", model_name: "glm-5", base_url: "https://ollama.com", api_key_env_ref: "LLM_API_KEY", company_id: null });
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; error: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSavingCfg] = useState(false);

  // Chat playground state
  const [chatPrompt, setChatPrompt] = useState("What is 2+2? Reply with just the number.");
  const [chatTesting, setChatTesting] = useState(false);
  const [chatResults, setChatResults] = useState<ChatResult[]>([]);

  const globalConfig = configs.find(c => c.company_id === null);
  const tenantConfigs = configs.filter(c => c.company_id !== null);

  useEffect(() => {
    listLLMConfigs().then(setConfigs).catch(console.error);
  }, []);

  useEffect(() => {
    if (globalConfig) {
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
    // Validate api_key_env_ref is an env var name, not an actual key
    // Valid env var names are short and uppercase (e.g., LLM_API_KEY, ANTHROPIC_API_KEY)
    // Actual API keys are long strings with mixed case (e.g., 87e154dc... or sk-abc123...)
    if (editing.api_key_env_ref) {
      const val = editing.api_key_env_ref.trim();
      // Reject if it looks like an actual key: long AND not all uppercase
      if (val.length > 25 && val !== val.toUpperCase()) {
        alert("API Key Env Var should be the NAME of the environment variable (e.g., LLM_API_KEY), not the actual key value!");
        return;
      }
    }
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

  async function handleChatTest() {
    if (!chatPrompt.trim()) return;
    setChatTesting(true);

    try {
      const r = await testLLMChat({
        prompt: chatPrompt,
        provider: editing.provider || "ollama-cloud",
        model_name: editing.model_name || "glm-5",
        base_url: editing.base_url || "https://ollama.com",
        api_key_env_ref: editing.api_key_env_ref || "LLM_API_KEY",
      });

      const result: ChatResult = {
        model: r.model || editing.model_name || "unknown",
        prompt: chatPrompt,
        response: r.content || "",
        latency_ms: r.latency_ms,
        ok: r.ok,
        error: r.error || undefined,
      };
      setChatResults(prev => [result, ...prev.slice(0, 9)]);
    } catch (e: any) {
      setChatResults(prev => [{
        model: editing.model_name || "unknown",
        prompt: chatPrompt,
        response: "",
        latency_ms: 0,
        ok: false,
        error: e.message,
      }, ...prev.slice(0, 9)]);
    } finally {
      setChatTesting(false);
    }
  }

  async function testAllModels() {
    const providerKey = editing.provider || "ollama-cloud";
    const models = POPULAR_MODELS[providerKey] || [];
    for (const model of models) {
      if (chatTesting) break;
      setChatTesting(true);
      try {
        const r = await testLLMChat({
          prompt: chatPrompt,
          provider: providerKey,
          model_name: model,
          base_url: editing.base_url || "https://ollama.com",
          api_key_env_ref: editing.api_key_env_ref || "LLM_API_KEY",
        });
        setChatResults(prev => [{
          model: r.model || model,
          prompt: chatPrompt,
          response: r.content || "",
          latency_ms: r.latency_ms,
          ok: r.ok,
          error: r.error || undefined,
        }, ...prev.slice(0, 9)]);
      } catch (e: any) {
        setChatResults(prev => [{
          model,
          prompt: chatPrompt,
          response: "",
          latency_ms: 0,
          ok: false,
          error: e.message,
        }, ...prev.slice(0, 9)]);
      }
    }
    setChatTesting(false);
  }

  // Get provider label for display
  const providerLabel = PROVIDERS.find(p => p.key === editing.provider)?.label || editing.provider;

  return (
    <div className="mx-auto max-w-4xl px-5 py-5">
      <header className="mb-5">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-primary">LLM Configuration</h1>
        <p className="mt-0.5 text-[10.5px] text-tertiary">
          Global provider used by all agents. Tenants can override below.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-6">
        {/* Left column: Config */}
        <div>
          {/* Provider selector */}
          <div className="mb-4">
            <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-2">Provider</div>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(p => (
                <button key={p.key} onClick={() => setEditing(prev => ({
                  ...prev,
                  provider: p.key,
                  base_url: p.baseUrl,
                  model_name: prev.model_name || p.defaultModel,
                  api_key_env_ref: prev.api_key_env_ref || p.defaultApiKeyEnv,
                }))}
                  className={`rounded border px-3 py-2 text-left transition-colors ${editing.provider === p.key ? "bg-accent-muted" : "border-subtle bg-surface-1 hover:bg-surface-2"}`}>
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
                  placeholder={editing.provider === "ollama" ? "llama3.2" : editing.provider === "anthropic" ? "claude-sonnet-4-6" : "glm-5"}
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
            {/* Base URL for all providers */}
            <div>
              <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">Base URL</label>
              <input value={editing.base_url || ""} onChange={e => setEditing(p => ({ ...p, base_url: e.target.value }))}
                placeholder={editing.provider === "ollama" ? "http://localhost:11434" : editing.provider === "anthropic" ? "https://api.anthropic.com" : "https://ollama.com"}
                className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary font-mono focus:outline-none focus:bg-accent-muted" />
            </div>
            {/* API Key for non-local ollama */}
            {editing.provider !== "ollama" && (
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">API Key (from environment)</label>
                <div className="flex items-center gap-2">
                  <input value={editing.api_key_env_ref || ""} onChange={e => setEditing(p => ({ ...p, api_key_env_ref: e.target.value }))}
                    placeholder={editing.provider === "anthropic" ? "ANTHROPIC_API_KEY" : "LLM_API_KEY"}
                    className="flex-1 rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary font-mono focus:outline-none focus:bg-accent-muted" />
                  <span className="text-[9px] text-tertiary">← env var name</span>
                </div>
                <p className="text-[9px] text-muted mt-1">
                  Key is read from <code className="text-accent">{editing.api_key_env_ref || "LLM_API_KEY"}</code> in your .env file
                </p>
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
              className="px-3 py-1.5 rounded border bg-accent-muted text-[11px] text-accent hover:bg-accent-hover/15 disabled:opacity-40">
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
        </div>

        {/* Right column: Chat Playground */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-2">Chat Playground</div>
          <div className="rounded border border-subtle bg-surface-1 p-4">
            {/* Prompt input */}
            <div className="mb-3">
              <label className="text-[9px] uppercase tracking-widest font-bold text-muted block mb-1">Test Prompt</label>
              <textarea
                value={chatPrompt}
                onChange={e => setChatPrompt(e.target.value)}
                placeholder="Enter a prompt to test the model..."
                rows={3}
                className="w-full rounded border border-default bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:outline-none focus:bg-accent-muted resize-none"
              />
            </div>

            {/* Model display */}
            <div className="mb-3 flex items-center gap-2">
              <span className="text-[9px] text-muted">Testing:</span>
              <span className="text-[10px] font-mono text-accent">{editing.model_name || "no model"}</span>
              <span className="text-[9px] text-muted">({providerLabel})</span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={handleChatTest}
                disabled={chatTesting || !chatPrompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-accent text-[11px] text-white hover:bg-accent-hover disabled:opacity-40"
              >
                {chatTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Test Model
              </button>
              <button
                onClick={testAllModels}
                disabled={chatTesting || !chatPrompt.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-default bg-surface-1 text-[11px] text-tertiary hover:bg-surface-2 disabled:opacity-40"
              >
                Test All {POPULAR_MODELS[editing.provider || "ollama-cloud"]?.length || 0} Models
              </button>
              {chatResults.length > 0 && (
                <button
                  onClick={() => setChatResults([])}
                  className="flex items-center gap-1 px-2 py-1.5 text-muted hover:text-error/70"
                  title="Clear results"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Results */}
            {chatResults.length > 0 && (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {chatResults.map((r, i) => (
                  <div
                    key={i}
                    className={`rounded border p-3 ${r.ok ? "border-default bg-surface-1" : "border-error/30 bg-error/5"}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className={`h-3 w-3 ${r.ok ? "text-accent" : "text-error"}`} />
                        <span className="text-[10px] font-mono font-semibold text-primary">{r.model}</span>
                        <span className="text-[9px] text-muted">{r.latency_ms}ms</span>
                      </div>
                      {r.ok && r.response && (
                        <button
                          onClick={() => navigator.clipboard.writeText(r.response)}
                          className="text-muted hover:text-secondary"
                          title="Copy response"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    {r.ok ? (
                      <p className="text-[11px] text-secondary leading-relaxed">{r.response}</p>
                    ) : (
                      <p className="text-[10px] text-error/80">{r.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <LLMConfigAssistant
        currentProvider={editing.provider}
        currentModel={editing.model_name}
      />
    </div>
  );
}