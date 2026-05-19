"use client";

import { useState } from "react";
import { 
  Play, 
  Pause, 
  Eye, 
  MoreVertical,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock
} from "lucide-react";
import {
  updateTenantAgent
} from "@/lib/api/agent_lifecycle";

interface TenantAgent {
  id: number;
  template_id: number;
  template_key: string;
  template_name: string;
  company_id: number;
  settings: Record<string, any> | null;
  is_active: boolean;
  deployed_at: string;
  last_heartbeat_at: string | null;
  health_status: string;
  total_conversations: number;
  total_tool_calls: number;
  last_activity_at: string | null;
}

export function AgentList({ agents }: { agents: TenantAgent[] }) {
  const [updatingAgent, setUpdatingAgent] = useState<number | null>(null);

  const handleToggleActive = async (agentId: number, isActive: boolean) => {
    setUpdatingAgent(agentId);
    try {
      await updateTenantAgent(agentId, { is_active: !isActive });
      // In a real implementation, we would refetch the data here
      window.location.reload();
    } catch (error) {
      console.error("Failed to update agent:", error);
    } finally {
      setUpdatingAgent(null);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "degraded":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "offline":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-500";
      case "degraded":
        return "text-yellow-500";
      case "offline":
        return "text-red-500";
      case "pending":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  return (
    <div className="bg-surface-1 border border-subtle rounded-lg overflow-hidden">
      <div className="border-b border-subtle p-4">
        <h3 className="text-sm font-semibold text-primary">Active Agent Deployments</h3>
        <p className="text-xs text-muted mt-1">Manage all deployed agents across tenants</p>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-surface-2 border-b border-subtle">
            <tr>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Agent</th>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Tenant</th>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Status</th>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Activity</th>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Deployed</th>
              <th className="py-3 px-4 text-xs font-medium text-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={agent.id} className="border-b border-subtle last:border-0 hover:bg-surface-2/50">
                <td className="py-3 px-4">
                  <div>
                    <div className="font-medium text-sm text-primary">{agent.template_name}</div>
                    <div className="text-xs text-muted">{agent.template_key}</div>
                  </div>
                </td>
                
                <td className="py-3 px-4">
                  <div className="text-sm">Company {agent.company_id}</div>
                </td>
                
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(agent.health_status)}
                    <span className={`text-sm capitalize ${getStatusColor(agent.health_status)}`}>
                      {agent.health_status}
                    </span>
                  </div>
                </td>
                
                <td className="py-3 px-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Conv:</span>
                      <span className="font-medium">{agent.total_conversations}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted">Calls:</span>
                      <span className="font-medium">{agent.total_tool_calls}</span>
                    </div>
                  </div>
                </td>
                
                <td className="py-3 px-4">
                  <div className="text-xs text-muted">
                    {new Date(agent.deployed_at).toLocaleDateString()}
                  </div>
                  {agent.last_activity_at && (
                    <div className="text-[10px] text-muted mt-1">
                      Active: {new Date(agent.last_activity_at).toLocaleTimeString()}
                    </div>
                  )}
                </td>
                
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1">
                    <button 
                      className="p-1 rounded hover:bg-surface-2"
                      onClick={() => handleToggleActive(agent.id, agent.is_active)}
                      disabled={updatingAgent === agent.id}
                    >
                      {updatingAgent === agent.id ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                      ) : agent.is_active ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </button>
                    <button className="p-1 rounded hover:bg-surface-2">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button className="p-1 rounded hover:bg-surface-2">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            
            {agents.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center">
                    <div className="bg-surface-2 p-3 rounded-full mb-3">
                      <Bot className="h-8 w-8 text-muted" />
                    </div>
                    <h3 className="text-lg font-medium text-primary mb-1">No agents deployed</h3>
                    <p className="text-sm text-muted">Deploy agents to see them listed here</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Placeholder icon
function Bot({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
    </svg>
  );
}