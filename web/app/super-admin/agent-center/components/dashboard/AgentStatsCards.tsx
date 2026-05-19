"use client";

import { 
  Bot, 
  Server, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  TrendingUp,
  Zap,
  Database
} from "lucide-react";

interface AgentStats {
  total_templates: number;
  total_deployments: number;
  active_agents: number;
  healthy_agents: number;
  degraded_agents: number;
  offline_agents: number;
  total_tenants: number;
}

export function AgentStatsCards({ stats }: { stats: AgentStats }) {
  const statCards = [
    {
      title: "Agent Templates",
      value: stats.total_templates,
      icon: <Bot className="h-4 w-4 text-accent" />,
      color: "bg-accent-muted",
    },
    {
      title: "Tenant Deployments",
      value: stats.total_deployments,
      icon: <Server className="h-4 w-4 text-accent" />,
      color: "bg-accent-muted",
    },
    {
      title: "Active Agents",
      value: stats.active_agents,
      icon: <Zap className="h-4 w-4 text-emerald-500" />,
      color: "bg-emerald-500/10",
    },
    {
      title: "Healthy Agents",
      value: stats.healthy_agents,
      icon: <CheckCircle className="h-4 w-4 text-success" />,
      color: "bg-success-muted",
    },
    {
      title: "Degraded Agents",
      value: stats.degraded_agents,
      icon: <AlertTriangle className="h-4 w-4 text-warning" />,
      color: "bg-warning-muted",
    },
    {
      title: "Offline Agents",
      value: stats.offline_agents,
      icon: <XCircle className="h-4 w-4 text-error" />,
      color: "bg-error-muted",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
      {statCards.map((card, index) => (
        <div 
          key={index} 
          className="bg-surface-1 border border-subtle rounded-lg p-4 flex flex-col"
        >
          <div className="flex items-center justify-between mb-2">
            <div className={`p-2 rounded-lg ${card.color}`}>
              {card.icon}
            </div>
          </div>
          <div className="mt-2">
            <p className="text-lg font-semibold text-primary">{card.value}</p>
            <p className="text-[11px] text-muted">{card.title}</p>
          </div>
        </div>
      ))}
    </div>
  );
}