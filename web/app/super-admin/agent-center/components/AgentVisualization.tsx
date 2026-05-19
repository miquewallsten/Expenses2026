"use client";

import { useState, useEffect } from "react";
import { 
  Network, 
  ShieldCheck, 
  Zap, 
  Cpu, 
  Command,
  ArrowRight,
  Activity,
  Search,
  Lock,
  FileText,
  Database,
  AlertTriangle
} from "lucide-react";
import {
  listTemplates,
  listDeployments,
  getAgentHealthSummary,
} from "@/lib/api/agent_lifecycle";

interface AgentNode {
  id: string;
  name: string;
  type: "orchestrator" | "persona" | "toolset" | "worker" | "config";
  status: "active" | "idle" | "warning" | "error";
  connections: string[];
  description: string;
  category: string;
  health_status: string;
}

export default function AgentVisualization() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tmpl, deps, healthData] = await Promise.all([
          listTemplates(),
          listDeployments(),
          getAgentHealthSummary(),
        ]);
        setTemplates(tmpl);
        setDeployments(deps);
        setHealth(healthData);
        if (tmpl.length > 0) {
          setActiveNode(tmpl[0].key);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500 mb-2"></div>
          <p className="text-sm text-muted">Loading visualization...</p>
        </div>
      </div>
    );
  }

  // Transform templates and deployments into nodes for visualization
  const nodes: AgentNode[] = templates.map(template => {
    const activeDeployments = deployments.filter(d => d.template_key === template.key);
    const healthStatus = activeDeployments.some(d => d.health_status === "error") 
      ? "error" 
      : activeDeployments.some(d => d.health_status === "degraded") 
        ? "warning" 
        : "active";

    return {
      id: template.key,
      name: template.name,
      type: template.category === "worker" ? "worker" : 
            template.category === "config_helper" ? "config" : "persona",
      status: healthStatus as any,
      connections: [],
      description: template.description,
      category: template.category,
      health_status: healthStatus,
    };
  });

  const currentNode = nodes.find(n => n.id === activeNode) || nodes[0];

  return (
    <div className="flex h-[calc(100vh-120px)]">
      {/* Main Graph Area */}
      <div className="flex-1 bg-surface-ground p-6 overflow-auto relative">
        {/* Legend */}
        <div className="absolute left-6 top-6 z-10 flex flex-col gap-2 rounded-lg border border-subtle bg-surface-1/80 backdrop-blur-[2px] p-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-rose-500" />
            <span className="text-[10px] text-secondary">Orchestrator</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-[10px] text-secondary">Persona</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-[10px] text-secondary">Worker</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-purple-500" />
            <span className="text-[10px] text-secondary">Config Helper</span>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center h-full">
          {/* Visualization Header */}
          <div className="text-center mb-12">
            <h2 className="text-xl font-bold text-primary mb-2">Agent Network Visualization</h2>
            <p className="text-sm text-muted">Interactive view of all deployed agents and their relationships</p>
          </div>

          {/* Central Orchestrator */}
          <div className="flex flex-col items-center mb-12">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center mb-4">
                <Cpu className="h-12 w-12 text-rose-500" />
              </div>
              <h3 className="text-sm font-bold text-center">Lola Core Orchestrator</h3>
              <p className="text-xs text-muted text-center mt-1">Main routing engine</p>
            </div>
          </div>

          {/* Agent Categories */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 w-full max-w-4xl">
            {/* Config Helpers */}
            <div className="flex flex-col items-center">
              <h4 className="text-sm font-semibold text-purple-500 mb-4 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Config Helpers
              </h4>
              <div className="space-y-4">
                {nodes.filter(n => n.category === "config_helper").map(node => (
                  <NodeCard 
                    key={node.id}
                    node={node}
                    isActive={activeNode === node.id}
                    onClick={() => setActiveNode(node.id)}
                  />
                ))}
                {nodes.filter(n => n.category === "config_helper").length === 0 && (
                  <p className="text-xs text-muted">No config helpers</p>
                )}
              </div>
            </div>

            {/* Workers */}
            <div className="flex flex-col items-center">
              <h4 className="text-sm font-semibold text-emerald-500 mb-4 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Worker Agents
              </h4>
              <div className="space-y-4">
                {nodes.filter(n => n.category === "worker").map(node => (
                  <NodeCard 
                    key={node.id}
                    node={node}
                    isActive={activeNode === node.id}
                    onClick={() => setActiveNode(node.id)}
                  />
                ))}
                {nodes.filter(n => n.category === "worker").length === 0 && (
                  <p className="text-xs text-muted">No worker agents</p>
                )}
              </div>
            </div>

            {/* Platform */}
            <div className="flex flex-col items-center">
              <h4 className="text-sm font-semibold text-blue-500 mb-4 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Platform Agents
              </h4>
              <div className="space-y-4">
                {nodes.filter(n => n.category === "platform").map(node => (
                  <NodeCard 
                    key={node.id}
                    node={node}
                    isActive={activeNode === node.id}
                    onClick={() => setActiveNode(node.id)}
                  />
                ))}
                {nodes.filter(n => n.category === "platform").length === 0 && (
                  <p className="text-xs text-muted">No platform agents</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="w-80 shrink-0 border-l border-subtle bg-surface-1 p-6 overflow-auto">
        {currentNode ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-muted">Agent Details</span>
              <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                currentNode.health_status === 'active' ? 'bg-success/15 text-success' :
                currentNode.health_status === 'warning' ? 'bg-warning/15 text-warning' :
                'bg-destructive/15 text-destructive'
              }`}>
                <Activity className="h-2.5 w-2.5" />
                {currentNode.health_status}
              </div>
            </div>

            <div>
              <h2 className="text-[16px] font-bold text-primary">{currentNode.name}</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-secondary">{currentNode.description}</p>
            </div>

            <div className="space-y-3 pt-4 border-t border-subtle">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted">Category</h3>
              <div className="flex items-center gap-2 rounded bg-surface-2 p-2">
                {currentNode.category === 'worker' && <Zap className="h-3.5 w-3.5 text-emerald-400" />}
                {currentNode.category === 'config_helper' && <ShieldCheck className="h-3.5 w-3.5 text-purple-400" />}
                {currentNode.category === 'platform' && <Lock className="h-3.5 w-3.5 text-blue-400" />}
                <span className="text-[11px] text-primary capitalize">
                  {currentNode.category.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-subtle">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted">Capabilities</h3>
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded bg-surface-2 p-2">
                  <FileText className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] text-primary">Document Processing</span>
                </div>
                <div className="flex items-center gap-2 rounded bg-surface-2 p-2">
                  <Database className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] text-primary">Data Validation</span>
                </div>
                <div className="flex items-center gap-2 rounded bg-surface-2 p-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] text-primary">Policy Compliance</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button className="flex w-full items-center justify-center gap-2 rounded border border-subtle bg-surface-2 py-2 text-[11px] font-medium text-secondary hover:bg-surface-hover hover:text-primary transition-colors">
                <Command className="h-3 w-3" />
                View Configuration
              </button>
            </div>

            <div className="rounded-lg bg-accent/5 p-4 border border-accent/10">
              <h4 className="text-[10px] font-bold text-accent uppercase tracking-wider mb-2">Deployment Stats</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted">Active Deployments</span>
                  <span className="text-secondary">
                    {deployments.filter(d => d.template_key === currentNode.id && d.is_active).length}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted">Total Calls</span>
                  <span className="text-secondary">-</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted">Success Rate</span>
                  <span className="text-secondary">-</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Search className="h-8 w-8 text-muted mb-4 opacity-20" />
            <p className="text-[11px] text-muted">Select an agent to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NodeCard({ node, isActive, onClick }: { 
  node: AgentNode, 
  isActive: boolean, 
  onClick: () => void
}) {
  const getNodeIcon = () => {
    switch (node.type) {
      case "orchestrator": return <Cpu className="h-3.5 w-3.5" />;
      case "persona": return <ShieldCheck className="h-3.5 w-3.5" />;
      case "worker": return <Zap className="h-3.5 w-3.5" />;
      case "config": return <ShieldCheck className="h-3.5 w-3.5" />;
      default: return <Zap className="h-3.5 w-3.5" />;
    }
  };

  const getNodeColor = () => {
    switch (node.type) {
      case "orchestrator": return "bg-rose-500/10 border-rose-500/20 text-rose-400";
      case "persona": return "bg-blue-500/10 border-blue-500/20 text-blue-400";
      case "worker": return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
      case "config": return "bg-purple-500/10 border-purple-500/20 text-purple-400";
      default: return "bg-zinc-500/10 border-zinc-500/20 text-zinc-400";
    }
  };

  return (
    <button 
      onClick={onClick}
      className={`
        relative flex w-full items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-200
        ${isActive 
          ? 'border-rose-500/50 bg-rose-500/5 shadow-[0_0_15px_rgba(244,63,94,0.1)] scale-105' 
          : 'border-subtle bg-surface-1 hover:border-default'
        }
      `}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border ${getNodeColor()}`}>
        {getNodeIcon()}
      </div>
      <div className="flex-1 text-left">
        <div className={`text-[11px] font-bold leading-tight ${isActive ? 'text-primary' : 'text-secondary'}`}>
          {node.name}
        </div>
        <div className="text-[8px] text-muted uppercase tracking-wider truncate">
          {node.health_status} • {node.category}
        </div>
      </div>
    </button>
  );
}