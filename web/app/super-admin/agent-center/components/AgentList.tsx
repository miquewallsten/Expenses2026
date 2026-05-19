"use client";

import { Search, Plus, RefreshCw, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { inputClasses } from "@/components/admin/shared/AdminPatterns";

const PERSONA_COLORS: Record<string, string> = {
  admin: "border-rose-500/25 bg-rose-500/10 text-rose-400",
  accounting: "border-emerald-500/25 bg-emerald-500/10 text-emerald-400",
  employee: "border-sky-500/25 bg-sky-500/10 text-accent",
  report_builder: "border-purple-500/25 bg-purple-500/10 text-purple-400",
};

interface AgentEntry {
  key: string;
  name: string;
  persona: string;
  is_active: boolean;
  deployed_at?: string;
  last_activity_at?: string;
  description?: string | null;
}

interface Props {
  agents: AgentEntry[];
  selectedKey: string | null;
  onSelect: (agent: AgentEntry) => void;
  onToggle: (key: string, currentState: boolean) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onCreate?: () => void;
  onRefresh?: () => void;
  loading?: boolean;
}

export default function AgentList({
  agents,
  selectedKey,
  onSelect,
  onToggle,
  search,
  onSearchChange,
  onCreate,
  onRefresh,
  loading,
}: Props) {
  const t = useTranslations("agents");

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.key.toLowerCase().includes(search.toLowerCase()) ||
      a.persona.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("searchAgents")}
            className={`${inputClasses.base} pl-8`}
          />
        </div>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-8 w-8 items-center justify-center rounded border border-default text-muted hover:bg-surface-2 hover:text-secondary"
            title={t("refresh")}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
        {onCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="flex h-8 items-center gap-1.5 rounded bg-accent px-2.5 text-[11px] font-semibold text-primary hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("addAgent")}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-muted">
            <Search className="h-6 w-6" />
            <p className="text-[11px]">{t("noAgentsFound")}</p>
          </div>
        ) : (
          filtered.map((agent) => (
            <div
              key={agent.key}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(agent)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(agent); } }}
              className={`w-full flex items-center gap-2.5 border-b border-subtle px-3 py-2.5 text-left transition-colors hover:bg-surface-1 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-accent/30 ${
                selectedKey === agent.key ? "bg-accent/5" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-primary truncate">{agent.name}</span>
                  <span className={`rounded-sm px-1 py-0.5 text-[8px] font-bold uppercase tracking-wider ${PERSONA_COLORS[agent.persona] || "bg-surface-2 text-secondary"}`}>
                    {agent.persona}
                  </span>
                </div>
                <div className="text-[10px] text-muted font-mono">{agent.key}</div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(agent.key, agent.is_active);
                }}
                className="shrink-0 rounded p-0.5 hover:bg-surface-2 focus-visible:ring-1 focus-visible:ring-accent/30"
                title={agent.is_active ? t("inactive") : t("active")}
              >
                {agent.is_active ? (
                  <ToggleRight className="h-4 w-4 text-success" />
                ) : (
                  <ToggleLeft className="h-4 w-4 text-muted" />
                )}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
