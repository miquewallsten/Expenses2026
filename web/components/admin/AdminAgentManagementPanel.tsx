"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Bot,
  Settings,
  Zap,
  Shield,
  Brain,
  Database,
  Activity,
  BarChart3,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  AlertTriangle,
  Info,
  Play,
  Pause,
  RefreshCw
} from "lucide-react";
import { getAuthHeaders, getCurrentCompanyId } from "@/lib/session";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

interface AgentConfig {
  agent_v2_enabled: boolean;
  ai_copilot_enabled: boolean;
  ai_policy_enabled: boolean;
  ai_accounting_assist_enabled: boolean;
  ai_approval_assist_enabled: boolean;
  ai_workflow_assist_enabled: boolean;
  auto_account_suggestion_enabled: boolean;
}

interface AgentStats {
  total_requests: number;
  successful_requests: number;
  avg_response_time: number;
  active_sessions: number;
  tool_usage: Record<string, number>;
}

interface AgentModule {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  configurable: boolean;
  icon: React.ReactNode;
  category: "core" | "assist" | "integration";
}

export default function AdminAgentManagementPanel() {
  const t = useTranslations("admin.agentManagement");
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const agentModules: AgentModule[] = [
    {
      key: "agent_v2",
      name: t("modules.agentV2"),
      description: t("modules.agentV2Desc"),
      enabled: config?.agent_v2_enabled ?? false,
      configurable: true,
      icon: <Bot className="h-4 w-4" />,
      category: "core"
    },
    {
      key: "ai_copilot",
      name: t("modules.aiCopilot"),
      description: t("modules.aiCopilotDesc"),
      enabled: config?.ai_copilot_enabled ?? false,
      configurable: true,
      icon: <Brain className="h-4 w-4" />,
      category: "core"
    },
    {
      key: "ai_policy",
      name: t("modules.aiPolicy"),
      description: t("modules.aiPolicyDesc"),
      enabled: config?.ai_policy_enabled ?? false,
      configurable: true,
      icon: <Shield className="h-4 w-4" />,
      category: "assist"
    },
    {
      key: "ai_accounting",
      name: t("modules.aiAccounting"),
      description: t("modules.aiAccountingDesc"),
      enabled: config?.ai_accounting_assist_enabled ?? false,
      configurable: true,
      icon: <Database className="h-4 w-4" />,
      category: "assist"
    },
    {
      key: "ai_approval",
      name: t("modules.aiApproval"),
      description: t("modules.aiApprovalDesc"),
      enabled: config?.ai_approval_assist_enabled ?? false,
      configurable: true,
      icon: <CheckCircle className="h-4 w-4" />,
      category: "assist"
    },
    {
      key: "ai_workflow",
      name: t("modules.aiWorkflow"),
      description: t("modules.aiWorkflowDesc"),
      enabled: config?.ai_workflow_assist_enabled ?? false,
      configurable: true,
      icon: <Activity className="h-4 w-4" />,
      category: "assist"
    },
    {
      key: "auto_account",
      name: t("modules.autoAccount"),
      description: t("modules.autoAccountDesc"),
      enabled: config?.auto_account_suggestion_enabled ?? false,
      configurable: true,
      icon: <Zap className="h-4 w-4" />,
      category: "integration"
    }
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const companyId = getCurrentCompanyId();
      if (!companyId) return;

      const [configRes, statsRes] = await Promise.all([
        fetch(`${API}/admin/company-setup/${companyId}`, {
          headers: getAuthHeaders()
        }),
        fetch(`${API}/admin/agent/stats/${companyId}`, {
          headers: getAuthHeaders()
        })
      ]);

      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (moduleKey: string, enabled: boolean) => {
    try {
      setSaving(prev => ({ ...prev, [moduleKey]: true }));
      setError(null);

      const companyId = getCurrentCompanyId();
      if (!companyId) return;

      const response = await fetch(`${API}/admin/company-setup/${companyId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders()
        },
        body: JSON.stringify({ [moduleKey]: enabled })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const updated = await response.json();
      setConfig(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update setting");
    } finally {
      setSaving(prev => ({ ...prev, [moduleKey]: false }));
    }
  };

  const getStatusColor = (enabled: boolean) => {
    return enabled 
      ? "bg-green-500/20 text-green-400" 
      : "bg-gray-500/20 text-gray-400";
  };

  const getCategoryModules = (category: string) => {
    return agentModules.filter(module => module.category === category);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">{t("title")}</h1>
          <p className="text-white/60 mt-1">{t("description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            className="flex items-center gap-1.5 rounded border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            {t("refresh")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-400" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-blue-400" />
              <span className="text-xs text-white/60">{t("stats.totalRequests")}</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.total_requests.toLocaleString()}</div>
          </div>

          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-400" />
              <span className="text-xs text-white/60">{t("stats.successRate")}</span>
            </div>
            <div className="text-2xl font-bold text-green-400">
              {stats.total_requests > 0 
                ? `${((stats.successful_requests / stats.total_requests) * 100).toFixed(1)}%`
                : "0%"
              }
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="h-4 w-4 text-yellow-400" />
              <span className="text-xs text-white/60">{t("stats.avgResponseTime")}</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {stats.avg_response_time}ms
            </div>
          </div>

          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Play className="h-4 w-4 text-green-400" />
              <span className="text-xs text-white/60">{t("stats.activeSessions")}</span>
            </div>
            <div className="text-2xl font-bold text-white">
              {stats.active_sessions}
            </div>
          </div>
        </div>
      )}

      {/* Module Configuration */}
      <div className="space-y-6">
        {/* Core Modules */}
        <div>
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-400" />
            {t("categories.core")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getCategoryModules("core").map((module) => (
              <ModuleCard
                key={module.key}
                module={module}
                saving={saving[module.key]}
                onToggle={toggleModule}
              />
            ))}
          </div>
        </div>

        {/* AI Assist Modules */}
        <div>
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" />
            {t("categories.assist")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getCategoryModules("assist").map((module) => (
              <ModuleCard
                key={module.key}
                module={module}
                saving={saving[module.key]}
                onToggle={toggleModule}
              />
            ))}
          </div>
        </div>

        {/* Integration Modules */}
        <div>
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-400" />
            {t("categories.integration")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {getCategoryModules("integration").map((module) => (
              <ModuleCard
                key={module.key}
                module={module}
                saving={saving[module.key]}
                onToggle={toggleModule}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 rounded-lg p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          {t("quickActions")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors">
            {t("actions.runDiagnostics")}
          </button>
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors">
            {t("actions.performanceReport")}
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm transition-colors">
            {t("actions.viewLogs")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModuleCard({ module, saving, onToggle }: {
  module: AgentModule;
  saving: boolean;
  onToggle: (key: string, enabled: boolean) => void;
}) {
  const t = useTranslations("admin.agentManagement");

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="text-white/60">{module.icon}</div>
          <h3 className="font-medium text-white">{module.name}</h3>
        </div>
        <div className={`px-2 py-1 rounded text-xs ${module.enabled ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}`}>
          {module.enabled ? t("status.active") : t("status.inactive")}
        </div>
      </div>

      <p className="text-white/60 text-sm mb-4">{module.description}</p>

      {module.configurable && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/40">{t("toggleLabel")}</span>
          <button
            onClick={() => onToggle(module.key, !module.enabled)}
            disabled={saving}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors disabled:opacity-50 ${
              module.enabled
                ? "border-green-500/40 bg-green-600/30"
                : "border-gray-500/40 bg-gray-600/30"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                module.enabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      )}
    </div>
  );
}