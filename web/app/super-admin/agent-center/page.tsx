"use client";

import { useEffect, useState, useCallback } from "react";
import { Network, Loader2, AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, StatusBadge } from "@/components/admin/shared/AdminPatterns";
import {
  listAgentDefinitions, createAgentDefinition, updateAgentDefinition,
  deleteAgentDefinition, toggleAgent, getToolRegistry,
  type AgentDefinition, type ToolInfo,
} from "@/lib/api/agent-definitions";
import AgentList from "./components/AgentList";
import AgentDetail from "./components/AgentDetail";
import AgentArchitecture from "./components/AgentArchitecture";

export default function AgentCenterPage() {
  const t = useTranslations("superAdmin.agentCenterPage");
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<"agents" | "architecture">("agents");
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentData, toolData] = await Promise.all([listAgentDefinitions(), getToolRegistry()]);
      setAgents(agentData);
      setTools(toolData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleToggle = async (key: string, isActive: boolean) => {
    try {
      await toggleAgent(key, !isActive);
      await fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Toggle failed");
    }
  };

  const handleDelete = async (key: string) => {
    try {
      await deleteAgentDefinition(key);
      await fetchData();
      if (selectedKey === key) setSelectedKey(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleSave = async (agent: Partial<AgentDefinition>) => {
    setSaving(true);
    try {
      if (agent.key && agents.find(a => a.key === agent.key)) {
        await updateAgentDefinition(agent.key, agent);
      } else {
        await createAgentDefinition(agent as any);
      }
      await fetchData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const selectedAgent = agents.find(a => a.key === selectedKey) || null;

  if (loading && agents.length === 0) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<Network className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="overview"
      />

      {error && (
        <div className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Tab selector */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab("agents")}
          className={`rounded px-3 py-1.5 text-[11px] font-medium ${tab === "agents" ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2"}`}
        >
          {t("agents")} ({agents.length})
        </button>
        <button
          onClick={() => setTab("architecture")}
          className={`rounded px-3 py-1.5 text-[11px] font-medium ${tab === "architecture" ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2"}`}
        >
          {t("architecture")}
        </button>
      </div>

      {tab === "agents" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Agent List */}
          <div className="lg:col-span-1 rounded-lg border border-default bg-surface-1 overflow-hidden" style={{ minHeight: "400px" }}>
            <AgentList
              agents={agents}
              search={search}
              onSearchChange={setSearch}
              selectedKey={selectedKey}
              onSelect={(agent) => setSelectedKey(agent.key)}
              onToggle={handleToggle}
              onCreate={() => {
                setSelectedKey(null);
              }}
              onRefresh={fetchData}
              loading={loading}
            />
          </div>

          {/* Agent Detail */}
          <div className="lg:col-span-2 rounded-lg border border-default bg-surface-1 overflow-hidden" style={{ minHeight: "400px" }}>
            {selectedAgent ? (
              <AgentDetail
                agent={selectedAgent}
                tools={tools}
                onSave={handleSave}
                onDelete={handleDelete}
                saving={saving}
              />
            ) : (
              <div className="flex h-full items-center justify-center py-12 text-[11px] text-muted">
                Select an agent to view details
              </div>
            )}
          </div>
        </div>
      ) : (
        <AgentArchitecture />
      )}
    </div>
  );
}
