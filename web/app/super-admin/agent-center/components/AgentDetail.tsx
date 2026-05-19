"use client";

import { useState } from "react";
import { Trash2, X, Eye, Pencil, Shield, Bot, Wrench, Cpu, AlertCircle, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { SectionLabel, inputClasses } from "@/components/admin/shared/AdminPatterns";
import type { AgentDefinition, ToolInfo } from "@/lib/api/agent-definitions";

const PERSONA_COLORS: Record<string, string> = {
  admin: "bg-accent-muted text-accent",
  employee: "bg-success-muted text-success",
  accounting: "bg-amber-500/10 text-amber-400",
  procurement: "bg-pink-500/10 text-pink-400",
  super_admin: "bg-error-muted text-error",
};

const CATEGORY_ICONS: Record<string, typeof Bot> = {
  read: Eye,
  write: Pencil,
  config: Settings2,
  entity: Wrench,
  memory: Bot,
  diagnostic: AlertCircle,
  infra: Cpu,
  rbac: Shield,
};

interface AgentDetailProps {
  agent: AgentDefinition;
  tools: ToolInfo[];
  onSave: (agent: Partial<AgentDefinition>) => void;
  onDelete: (key: string) => void;
  saving: boolean;
}

export default function AgentDetail({ agent, tools, onSave, onDelete, saving }: AgentDetailProps) {
  const t = useTranslations("superAdmin.agentCenterPage");
  const [editing, setEditing] = useState<Partial<AgentDefinition>>({ ...agent });
  const [toolSearch, setToolSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const selectedTools = new Set(editing.allowed_tools || []);
  const allCategories = [...new Set(tools.map(t => t.category))];
  const filteredTools = tools.filter(t =>
    t.name.toLowerCase().includes(toolSearch.toLowerCase()) ||
    t.description.toLowerCase().includes(toolSearch.toLowerCase())
  );

  const toggleTool = (name: string) => {
    const next = new Set(selectedTools);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setEditing({ ...editing, allowed_tools: [...next] });
  };

  const handleSave = () => {
    onSave(editing);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditing({ ...agent });
    setIsEditing(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-primary">{agent.name}</h2>
          <span className={`rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${PERSONA_COLORS[agent.persona] || "bg-surface-2 text-secondary"}`}>
            {agent.persona}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <button onClick={handleCancel} className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary hover:bg-surface-2">
                {t("cancel")}
              </button>
              <button onClick={handleSave} disabled={saving} className="rounded bg-accent px-2 py-1 text-[10px] font-semibold text-white hover:bg-accent-hover disabled:opacity-40">
                {saving ? "..." : t("save")}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary hover:bg-surface-2">
                Edit
              </button>
              <button
                onClick={() => { if (confirm(t("confirmDelete"))) onDelete(agent.key); }}
                className="rounded border border-error/30 bg-error/5 px-2 py-1 text-[10px] text-error hover:bg-error/10"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isEditing ? (
          <div className="space-y-4">
            <div>
              <SectionLabel>{t("key")}</SectionLabel>
              <input value={editing.key || ""} onChange={(e) => setEditing({ ...editing, key: e.target.value })} className={inputClasses.mono} placeholder="e.g., my-custom-agent" />
            </div>
            <div>
              <SectionLabel>{t("name")}</SectionLabel>
              <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputClasses.base} placeholder="Agent display name" />
            </div>
            <div>
              <SectionLabel>{t("persona")}</SectionLabel>
              <select value={editing.persona || "admin"} onChange={(e) => setEditing({ ...editing, persona: e.target.value })} className={inputClasses.select}>
                <option value="admin">admin</option>
                <option value="employee">employee</option>
                <option value="accounting">accounting</option>
                <option value="procurement">procurement</option>
                <option value="super_admin">super_admin</option>
              </select>
            </div>
            <div>
              <SectionLabel>{t("description")}</SectionLabel>
              <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={inputClasses.textarea} rows={2} placeholder="What does this agent do?" />
            </div>
            <div>
              <SectionLabel>{t("systemPrompt")}</SectionLabel>
              <textarea value={editing.system_prompt || ""} onChange={(e) => setEditing({ ...editing, system_prompt: e.target.value })} className={inputClasses.textarea + " font-mono"} rows={8} placeholder="Agent system prompt..." />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <SectionLabel>{t("allowedTools")} ({selectedTools.size})</SectionLabel>
                <div className="flex gap-2">
                  <button onClick={() => setEditing({ ...editing, allowed_tools: tools.map(t => t.name) })} className="text-[10px] text-accent hover:underline">{t("selectAll")}</button>
                  <button onClick={() => setEditing({ ...editing, allowed_tools: [] })} className="text-[10px] text-secondary hover:underline">{t("clearAll")}</button>
                </div>
              </div>
              <input placeholder="Search tools..." value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} className={inputClasses.base + " mb-2"} />
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-md border border-subtle bg-surface-0 p-2">
                {allCategories.map(cat => {
                  const catTools = filteredTools.filter(t => t.category === cat);
                  if (catTools.length === 0) return null;
                  const Icon = CATEGORY_ICONS[cat] || Wrench;
                  return (
                    <div key={cat}>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted mt-2 mb-1 flex items-center gap-1">
                        <Icon className="h-3 w-3" />
                        {cat}
                      </div>
                      {catTools.map(tool => (
                        <label key={tool.name} className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-surface-1 cursor-pointer">
                          <input type="checkbox" checked={selectedTools.has(tool.name)} onChange={() => toggleTool(tool.name)} className="h-3 w-3 accent-accent" />
                          <span className="font-mono text-primary">{tool.name}</span>
                          <span className="text-secondary text-[10px] ml-auto truncate max-w-48">{tool.description.slice(0, 60)}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-default bg-surface-0 p-4">
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{t("key")}</div>
              <div className="font-mono text-[11px] text-primary">{agent.key}</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted mt-3 mb-1">{t("description")}</div>
              <div className="text-[11px] text-secondary">{agent.description || "-"}</div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-muted mt-3 mb-1">{t("allowedTools")}</div>
              <div className="text-[11px] text-secondary">{agent.allowed_tools?.length || 0} tools assigned</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
