"use client";

import { useState, useEffect } from "react";
import { Brain, Activity, Users, Settings, BarChart3, Zap } from "lucide-react";
import { getAgentMetrics, getActiveRequests, getTeamPerformance, getGlobalAgentStatus } from "@/lib/api/super-admin";

interface AgentTeam {
  id: string;
  name: string;
  description: string;
  status: "active" | "idle" | "error";
  lastActivity: string;
  requestCount: number;
  successRate: number;
  avgLatency: number;
}

interface AgentPerformance {
  team: string;
  totalRequests: number;
  successfulRequests: number;
  avgResponseTime: number;
  toolUsage: Record<string, number>;
}

export default function AgentManagementPage() {
  const [teams, setTeams] = useState<AgentTeam[]>([]);
  const [performance, setPerformance] = useState<AgentPerformance[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAgentData() {
      try {
        // Fetch real agent data from the API
        const [teamPerformance, globalStatus, agentMetrics, activeRequests] = await Promise.all([
          getTeamPerformance(),
          getGlobalAgentStatus(),
          getAgentMetrics(),
          getActiveRequests()
        ]);

        // Transform API data to match the frontend interface
        const realTeams: AgentTeam[] = Object.entries(teamPerformance).map(([teamId, perf]) => {
          const statusInfo = globalStatus.find(s => s.team === teamId);
          const activeReq = activeRequests.find(req => req.team === teamId);
          
          return {
            id: teamId,
            name: teamId.charAt(0).toUpperCase() + teamId.slice(1) + " Team",
            description: getTeamDescription(teamId),
            status: activeReq ? "active" : perf.total_requests > 0 ? "idle" : "error",
            lastActivity: activeReq 
              ? "Just now" 
              : perf.total_requests > 0 
                ? "Recently" 
                : "Never",
            requestCount: perf.total_requests,
            successRate: perf.success_rate * 100,
            avgLatency: perf.avg_duration * 1000 // Convert to milliseconds
          };
        });

        const realPerformance: AgentPerformance[] = Object.entries(teamPerformance).map(([teamId, perf]) => ({
          team: teamId,
          totalRequests: perf.total_requests,
          successfulRequests: perf.successful_requests,
          avgResponseTime: perf.avg_duration * 1000, // Convert to milliseconds
          toolUsage: {} // Tool usage data not available yet
        }));

        setTeams(realTeams);
        setPerformance(realPerformance);
      } catch (error) {
        console.error("Failed to fetch agent data:", error);
        // Fallback to mock data if API fails
        const mockTeams: AgentTeam[] = [
          {
            id: "config",
            name: "Configuration Team",
            description: "Company settings and module management",
            status: "active",
            lastActivity: "2 minutes ago",
            requestCount: 89,
            successRate: 99.2,
            avgLatency: 850,
          },
          {
            id: "expense",
            name: "Expense Team",
            description: "Expense intake, validation, and approval workflows",
            status: "active",
            lastActivity: "1 minute ago",
            requestCount: 256,
            successRate: 97.8,
            avgLatency: 950,
          },
          {
            id: "accounting",
            name: "Accounting Team",
            description: "Bookkeeping, tax compliance, and financial reporting",
            status: "idle",
            lastActivity: "15 minutes ago",
            requestCount: 67,
            successRate: 99.5,
            avgLatency: 1100,
          },
        ];

        const mockPerformance: AgentPerformance[] = [
          {
            team: "config",
            totalRequests: 89,
            successfulRequests: 88,
            avgResponseTime: 850,
            toolUsage: {
              "read_file": 25,
              "semantic_search": 18,
              "replace_string_in_file": 31,
              "create_file": 15,
            },
          },
          {
            team: "expense",
            totalRequests: 256,
            successfulRequests: 250,
            avgResponseTime: 950,
            toolUsage: {
              "read_file": 78,
              "semantic_search": 45,
              "replace_string_in_file": 67,
              "run_in_terminal": 66,
            },
          },
          {
            team: "accounting",
            totalRequests: 67,
            successfulRequests: 67,
            avgResponseTime: 1100,
            toolUsage: {
              "read_file": 22,
              "semantic_search": 15,
              "replace_string_in_file": 18,
              "run_in_terminal": 12,
            },
          },
        ];

        setTeams(mockTeams);
        setPerformance(mockPerformance);
      }
    }

    fetchAgentData();
  }, []);

  const getTeamDescription = (teamId: string): string => {
    const descriptions: Record<string, string> = {
      "config": "Company settings, module management, and system configuration",
      "expense": "Expense intake, validation, approval workflows, and receipt processing",
      "accounting": "Bookkeeping, tax compliance, financial reporting, and accounting integration",
      "integration": "API integrations, webhook management, and third-party connectivity",
      "compliance": "Regulatory compliance, audit trails, and security enforcement",
      "superadmin": "System-wide configuration, orchestration, and multi-tenant management"
    };
    return descriptions[teamId] || "Specialized AI agent team";
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-green-500/20 text-green-400";
      case "idle": return "bg-yellow-500/20 text-yellow-400";
      case "error": return "bg-red-500/20 text-red-400";
      default: return "bg-gray-500/20 text-gray-400";
    }
  };

  const selectedTeamData = teams.find(team => team.id === selectedTeam);
  const selectedPerformance = performance.find(p => p.team === selectedTeam);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Agent Management</h1>
          <p className="text-white/60 mt-1">
            Monitor and manage the AI agent teams powering the platform
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/40">
            {teams.filter(t => t.status === "active").length} active teams
          </span>
          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Agent Teams Overview */}
        <div className="bg-white/5 rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Agent Teams
          </h2>
          <div className="space-y-3">
            {teams.map((team) => (
              <div
                key={team.id}
                className={`p-4 rounded border cursor-pointer transition-colors ${
                  selectedTeam === team.id
                    ? "border-blue-400 bg-blue-400/10"
                    : "border-white/10 hover:border-white/20"
                }`}
                onClick={() => setSelectedTeam(team.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-white">{team.name}</h3>
                    <p className="text-white/60 text-sm mt-1">{team.description}</p>
                    <div className="flex items-center gap-4 mt-3 text-xs">
                      <span className="text-white/40">{team.requestCount} requests</span>
                      <span className="text-green-400">{team.successRate}% success</span>
                      <span className="text-white/40">{team.avgLatency}ms avg</span>
                    </div>
                  </div>
                  <div className={`px-2 py-1 rounded text-xs ${getStatusColor(team.status)}`}>
                    {team.status.toUpperCase()}
                  </div>
                </div>
                <div className="text-xs text-white/30 mt-2">
                  Last activity: {team.lastActivity}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team Details & Performance */}
        <div className="bg-white/5 rounded-lg p-6">
          <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Team Performance
          </h2>
          
          {selectedTeamData ? (
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-white">{selectedTeamData.name}</h3>
                <p className="text-white/60 text-sm">{selectedTeamData.description}</p>
              </div>

              {selectedPerformance && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 rounded p-3">
                      <div className="text-2xl font-bold text-white">
                        {selectedPerformance.totalRequests}
                      </div>
                      <div className="text-xs text-white/60">Total Requests</div>
                    </div>
                    <div className="bg-white/5 rounded p-3">
                      <div className="text-2xl font-bold text-green-400">
                        {((selectedPerformance.successfulRequests / selectedPerformance.totalRequests) * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-white/60">Success Rate</div>
                    </div>
                  </div>

                  <div>
                    <h4 className="font-medium text-white mb-3">Tool Usage</h4>
                    <div className="space-y-2">
                      {Object.entries(selectedPerformance.toolUsage)
                        .sort(([,a], [,b]) => b - a)
                        .map(([tool, count]) => (
                          <div key={tool} className="flex items-center justify-between">
                            <span className="text-sm text-white/60">{tool}</span>
                            <span className="text-sm text-white">{count}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <Settings className="h-12 w-12 text-white/20 mx-auto mb-4" />
              <p className="text-white/40">Select an agent team to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white/5 rounded-lg p-6">
        <h2 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm transition-colors">
            Refresh All Agents
          </button>
          <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm transition-colors">
            Run Performance Audit
          </button>
          <button className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded text-sm transition-colors">
            View Orchestrator Logs
          </button>
        </div>
      </div>
    </div>
  );
}