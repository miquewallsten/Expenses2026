// web/app/super-admin/llm-config/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, X, Zap } from "lucide-react";
import {
  listLLMConfigs, upsertLLMConfig, deleteLLMConfig, testLLMConnection, LLMConfig,
} from "@/lib/api/llm-config";

const PROVIDERS = [
  { key: "ollama", label: "Ollama (Local)", hint: "Runs on your machine. No API cost." },
  { key: "anthropic", label: "Anthropic", hint: "Claude models. Requires ANTHROPIC_API_KEY env var." },
  { key: "openai", label: "OpenAI", hint: "GPT models. Requires OPENAI_API_KEY env var." },
] as const;

export default function LLMConfigPage() {
  const [configs, setConfigs] = useState<<LLLLMConfig[]>([]);
  const [editing, setEditing] = useState<<PartialPartial<<LLLLMConfig>>({ provider: "ollama", model_name: "llama3.2", company_id: null });
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; error: string | null } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSavingCfg] = useState(false);

  const globalConfig = configs.find(c => c.company_id === null);
  const tenantConfigs = configs.filter(c => c.company_id !== null);

  useEffect(() => {
    listLLMConfigs().then(setConfigs).catch(console.error);
  }, []);

  useEffect(() => {
    if (globalConfig) setEditing({ ...globalConfig });
  }, [configs.length]);

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
    <<divdiv className="mx-auto max-w-2xl px-5 py-5">
      <<headerheader className="mb-5">
        <<hh1 className="text-[13px] font-bold tracking-[-0.01em] text-white/85">LLM Configuration</h1>
        <<pp className="mt-0.5 text-[10.5px] text-white/40">
          Global provider used by all agents. Tenants can override below.
        </p>
      </header>

      {/* Provider selector */}
      <<divdiv className="mb-4">
        <<divdiv className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Provider</div>
        <<divdiv className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <<buttonbutton key={p.key} onClick={() => setEditing(prev => ({ ...prev, provider: p.key }))}
              className={`rounded border px-3 py-2 text-left transition-colors ${editing.provider === p.key ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
              <<divdiv className={`text-[11px] font-semibold ${editing.provider === p.key ? "text-indigo-200/90" : "text-white/65"}`}>{p.label}</div>
              <<divdiv className="text-[9px] text-white/30 mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Config fields */}
      <<divdiv className="rounded border border-white/[0.06] bg-white/[0.015] p-4 space-y-3 mb-4">
        <<divdiv>
          <<labellabel className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Model Name</label>
          <<inputinput value={editing.model_name || ""} onChange={e => setEditing(p => ({ ...p, model_name: e.target.value }))}
            placeholder={editing.provider === "ollama" ? "llama3.2" : editing.provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
            className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
        </div>
        {editing.provider === "ollama" && (
          <<divdiv>
            <<labellabel className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Base URL</label>
            <<inputinput value={editing.base_url || ""} onChange={e => setEditing(p => ({ ...p, base_url: e.target.value }))}
              placeholder="http://localhost:11434"
              className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
          </div>
        )}
        {editing.provider !== "ollama" && (
          <<divdiv>
            <<labellabel className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">API Key Env Var</label>
            <<inputinput value={editing.api_key_env_ref || ""} onChange={e => setEditing(p => ({ ...p, api_key_env_ref: e.target.value }))}
              placeholder="ANTHROPIC_API_KEY"
              className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40" />
            <<pp className="text-[9px] text-white/30 mt-1">Name of the environment variable on the server — key is never stored in the database.</p>
          </div>
        )}
      </div>

      {/* Test + Save */}
      <<divdiv className="flex items-center gap-3 mb-5">
        <<buttonbutton onClick={handleTest} disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.07] bg-white/[0.02] text-[11px] text-white/55 hover:bg-white/[0.05] disabled:opacity-40">
          {testing ? <<LoaderLoader2 className="h-3 w-3 animate-spin" /> : <<ZapZap className="h-3 w-3" />}
          Test Connection
        </button>
        <<buttonbutton onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15 disabled:opacity-40">
          {saving ? "Saving…" : "Save as Global Default"}
        </button>
        {testResult && (
          <<divdiv className={`flex items-center gap-1.5 text-[10px] ${testResult.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>
            {testResult.ok ? <<CheckCheck className="h-3 w-3" /> : <<XX className="h-3 w-3" />}
            {testResult.ok ? `${testResult.latency_ms}ms` : testResult.error}
          </div>
        )}
      </div>

      {/* Per-tenant overrides */}
      {tenantConfigs.length > 0 && (
        <<divdiv>
          <<divdiv className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Per-Tenant Overrides</div>
          <<divdiv className="rounded border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            {tenantConfigs.map((c, i) => (
              <<divdiv key={c.id} className={`flex items-center px-3 py-2 gap-3 ${i > 0 ? "border-t border-white/[0.05]" : ""}`}>
                <<spanspan className="text-[10px] text-white/50 flex-1">Company #{c.company_id}</span>
                <<spanspan className="text-[10px] text-white/55">{c.provider}</span>
                <<spanspan className="text-[10px] text-white/40 font-mono">{c.model_name}</span>
                <<buttonbutton onClick={async () => { await deleteLLMConfig(c.id); setConfigs(p => p.filter(x => x.id !== c.id)); }}
                  className="text-white/25 hover:text-rose-400/70">
                  <<XX className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
