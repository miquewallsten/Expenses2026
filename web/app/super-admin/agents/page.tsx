// web/app/super-admin/agents/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Brain, Circle, Pencil, Plus, Trash2, Zap, Mail, MessageCircle } from "lucide-react";
import {
  listAgentDefinitions, updateAgentDefinition, createAgentDefinition,
  deleteAgentDefinition, toggleAgent, listChannelConfigs, updateChannelConfig,
  getToolRegistry, AgentDefinition, ChannelAgentConfig, ToolInfo,
} from "@/lib/api/agent-definitions";

const PERSONA_BADGES: Record<string, string> = {
  admin: "bg-indigo-500/15 text-indigo-300/80 border-indigo-500/25",
  employee: "bg-emerald-500/15 text-emerald-300/80 border-emerald-500/25",
  procurement: "bg-amber-500/15 text-amber-300/80 border-amber-500/25",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
};

export default function AgentBuilderPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<ChannelAgentConfig[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selected, setSelected] = useState<AgentDefinition | null>(null);
  const [editing, setEditing] = useState<Partial<AgentDefinition> | null>(null);
  const [activeTab, setActiveTab] = useState<"identity" | "prompt" | "tools" | "channel">("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newAgent, setNewAgent] = useState({ key: "", name: "", description: "", persona: "admin", system_prompt: "" });

  useEffect(() => {
    Promise.all([listAgentDefinitions(), listChannelConfigs(), getToolRegistry()])
      .then(([a, c, t]) => { setAgents(a); setChannelConfigs(c); setTools(t); })
      .catch(console.error);
  }, []);

  function selectAgent(a: AgentDefinition) {
    setSelected(a);
    setEditing({ ...a });
    setActiveTab("identity");
    setError(null);
  }

  function channelConfig(a: AgentDefinition): ChannelAgentConfig | undefined {
    return channelConfigs.find(c => c.agent_id === a.id);
  }

  function isChannelAgent(a: AgentDefinition) {
    return ["whatsapp", "email"].includes(a.key);
  }

  async function save() {
    if (!editing || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAgentDefinition(selected.key, editing);
      setAgents(prev => prev.map(a => a.key === updated.key ? updated : a));
      setSelected(updated);
      setEditing({ ...updated });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(a: AgentDefinition) {
    const updated = await toggleAgent(a.key, !a.is_active);
    setAgents(prev => prev.map(x => x.key === updated.key ? updated : x));
    if (selected?.key === a.key) { setSelected(updated); setEditing({ ...updated }); }
  }

  async function handleDelete(a: AgentDefinition) {
    if (a.is_system) return;
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    await deleteAgentDefinition(a.key);
    setAgents(prev => prev.filter(x => x.key !== a.key));
    if (selected?.key === a.key) { setSelected(null); setEditing(null); }
  }

  async function handleCreate() {
    try {
      const agent = await createAgentDefinition({ ...newAgent, allowed_tools: [], is_active: true });
      setAgents(prev => [...prev, agent]);
      setShowNew(false);
      setNewAgent({ key: "", name: "", description: "", persona: "admin", system_prompt: "" });
      selectAgent(agent);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveChannelConfig(agentKey: string, data: Partial<ChannelAgentConfig>) {
    const updated = await updateChannelConfig(agentKey, data);
    setChannelConfigs(prev => prev.map(c => c.agent_id === updated.agent_id ? updated : c));
  }

  const grouped = {
    system: agents.filter(a => a.is_system && !isChannelAgent(a)),
    channel: agents.filter(a => isChannelAgent(a)),
    custom: agents.filter(a => !a.is_system),
  };

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Agents</span>
          <button onClick={() => setShowNew(true)}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:bg-white/[0.05]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {[["System", grouped.system], ["Channels", grouped.channel], ["Custom", grouped.custom]].map(([label, group]) => (
            (group as AgentDefinition[]).length > 0 && (
              <div key={label as string}>
                <div className="px-3 py-1 text-[8.5px] font-bold uppercase tracking-widest text-white/22">{label as string}</div>
                {(group as AgentDefinition[]).map(a => (
                  <button key={a.key} onClick={() => selectAgent(a)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${selected?.key === a.key ? "bg-indigo-500/10 border-r-2 border-indigo-500/50" : "hover:bg-white/[0.03]"}`}>
                    <Circle className={`h-1.5 w-1.5 shrink-0 fill-current ${a.is_active ? "text-emerald-400" : "text-white/20"}`} />
                    <span className="flex-1 truncate text-[11px] text-white/70">{a.name}</span>
                    {isChannelAgent(a) && <span className="text-white/30">{CHANNEL_ICONS[a.key]}</span>}
                  </button>
                ))}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected && (
          <div className="flex h-full items-center justify-center text-[11px] text-white/25">
            Select an agent to configure it
          </div>
        )}
        {selected && editing && (
          <div className="p-4 max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white/85">{selected.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${PERSONA_BADGES[selected.persona] || PERSONA_BADGES.admin}`}>
                    {selected.persona}
                  </span>
                  {selected.is_system && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-white/35">system</span>
                  )}
                </div>
                <div className="text-[10px] text-white/35 mt-0.5">{selected.key}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(selected)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${selected.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300/70 hover:bg-emerald-500/15" : "border-white/[0.06] bg-white/[0.02] text-white/35 hover:bg-white/[0.05]"}`}>
                  {selected.is_active ? "Active" : "Inactive"}
                </button>
                {!selected.is_system && (
                  <button onClick={() => handleDelete(selected)}
                    className="text-[10px] px-2 py-1 rounded border border-rose-500/25 bg-rose-500/10 text-rose-300/70 hover:bg-rose-500/15">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-white/[0.06] mb-4">
              {(["identity", "prompt", "tools", ...(isChannelAgent(selected) ? ["channel"] : [])] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)}
                  className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${activeTab === tab ? "text-indigo-300/80 border-b-2 border-indigo-500/50 -mb-px" : "text-white/40 hover:text-white/60"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Identity tab */}
            {activeTab === "identity" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Name</label>
                  <input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Description</label>
                  <input value={editing.description || ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Persona</label>
                  <select value={editing.persona || "admin"} onChange={e => setEditing(p => ({ ...p, persona: e.target.value }))}
                    disabled={selected.is_system}
                    className="w-full rounded border border-white/[0.07] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none disabled:opacity-40">
                    <option value="admin">admin</option>
                    <option value="employee">employee</option>
                    <option value="procurement">procurement</option>
                  </select>
                </div>
              </div>
            )}

            {/* Prompt tab */}
            {activeTab === "prompt" && (
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">System Prompt</label>
                <textarea value={editing.system_prompt || ""} onChange={e => setEditing(p => ({ ...p, system_prompt: e.target.value }))}
                  rows={16}
                  className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40 resize-none" />
                <div className="text-[9px] text-white/25 mt-1">{(editing.system_prompt || "").length} chars</div>
              </div>
            )}

            {/* Tools tab */}
            {activeTab === "tools" && (
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-2">
                  Allowed Tools <span className="text-white/20 normal-case font-normal">(empty = all persona tools)</span>
                </label>
                <div className="space-y-0.5">
                  {Object.entries(
                    tools.reduce((acc, t) => ({ ...acc, [t.category]: [...(acc[t.category] || []), t] }), {} as Record<string, ToolInfo[]>)
                  ).sort().map(([cat, catTools]) => (
                    <div key={cat}>
                      <div className="text-[8.5px] font-bold uppercase tracking-widest text-white/22 px-1 py-1">{cat}</div>
                      {catTools.map(tool => {
                        const checked = (editing.allowed_tools || []).includes(tool.name);
                        return (
                          <label key={tool.name} className="flex items-start gap-2 px-1 py-0.5 rounded hover:bg-white/[0.02] cursor-pointer">
                            <input type="checkbox" checked={checked}
                              onChange={e => {
                                const list = editing.allowed_tools || [];
                                setEditing(p => ({
                                  ...p,
                                  allowed_tools: e.target.checked ? [...list, tool.name] : list.filter(t => t !== tool.name),
                                }));
                              }}
                              className="mt-0.5 accent-indigo-500" />
                            <span>
                              <span className="text-[10px] text-white/70 font-mono">{tool.name}</span>
                              {tool.destructive && <span className="ml-1 text-[8px] text-rose-400/70">destructive</span>}
                              <span className="block text-[9px] text-white/30">{tool.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Channel tab */}
            {activeTab === "channel" && isChannelAgent(selected) && (() => {
              const cfg = channelConfig(selected);
              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">
                      Autonomous Threshold <span className="text-white/20 normal-case font-normal">— below this confidence, escalate to human</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={1} step={0.05}
                        defaultValue={cfg?.autonomous_threshold ?? 0.80}
                        onChange={e => saveChannelConfig(selected.key, { autonomous_threshold: parseFloat(e.target.value), high_stakes_rules: cfg?.high_stakes_rules, test_mode: cfg?.test_mode })}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-[11px] text-white/60 w-10 text-right">{((cfg?.autonomous_threshold ?? 0.80) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Test Mode</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked={cfg?.test_mode ?? false}
                        onChange={e => saveChannelConfig(selected.key, { autonomous_threshold: cfg?.autonomous_threshold, high_stakes_rules: cfg?.high_stakes_rules, test_mode: e.target.checked })}
                        className="accent-indigo-500" />
                      <span className="text-[11px] text-white/60">Log actions but never commit them (safe for testing)</span>
                    </label>
                  </div>
                </div>
              );
            })()}

            {error && <div className="mt-3 text-[10px] text-rose-400/80">{error}</div>}
            <div className="mt-4">
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15 disabled:opacity-40">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New agent modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-96 rounded border border-white/[0.07] bg-zinc-900 p-4">
            <div className="text-[12px] font-semibold text-white/80 mb-3">New Agent</div>
            <div className="space-y-2.5">
              {([["key", "Key (slug)"], ["name", "Display Name"], ["description", "Description"]] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">{label}</label>
                  <input value={(newAgent as any)[field]}
                    onChange={e => setNewAgent(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
              ))}
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">System Prompt</label>
                <textarea value={newAgent.system_prompt} onChange={e => setNewAgent(p => ({ ...p, system_prompt: e.target.value }))}
                  rows={4} className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40 resize-none" />
              </div>
            </div>
            {error && <div className="mt-2 text-[10px] text-rose-400/80">{error}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleCreate}
                className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15">
                Create
              </button>
              <button onClick={() => { setShowNew(false); setError(null); }}
                className="px-3 py-1.5 rounded border border-white/[0.07] text-[11px] text-white/40 hover:bg-white/[0.03]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
