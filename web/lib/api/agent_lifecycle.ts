/**
 * Agent Lifecycle Management API Client
 * 
 * Communicates with the backend to manage agent templates, deployments, and health.
 * Uses the centralized apiCall client for auth, error handling, and 401 redirect.
 */

import { superAdminApiCall, superAdminPost, superAdminPatch, superAdminDelete } from "./super-admin-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentTemplate {
  id: number;
  key: string;
  name: string;
  description: string | null;
  category: "worker" | "config_helper" | "platform";
  persona: string;
  system_prompt: string;
  allowed_tools: string[];
  default_settings: Record<string, any> | null;
  workflow_mapping: string[] | null;
  version: number;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantAgent {
  id: number;
  template_id: number;
  template_key: string;
  template_name: string;
  company_id: number;
  settings: Record<string, any> | null;
  is_active: boolean;
  deployed_at: string;
  deployed_by: number | null;
  last_heartbeat_at: string | null;
  health_status: "healthy" | "degraded" | "offline" | "pending";
  total_conversations: number;
  total_tool_calls: number;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentHeartbeat {
  id: number;
  tenant_agent_id: number;
  status: "healthy" | "degraded" | "offline" | "error";
  response_time_ms: number | null;
  active_sessions: number;
  error_count: number;
  last_error: string | null;
  dependencies: Record<string, string> | null;
  uptime_seconds: number;
  metrics: Record<string, any> | null;
  created_at: string;
}

export interface AgentWorkflowMapping {
  id: number;
  tenant_agent_id: number;
  workflow_step: string;
  role: "primary" | "backup" | "assistant";
  config: Record<string, any> | null;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export interface AgentHealthSummary {
  total_agents: number;
  healthy: number;
  degraded: number;
  offline: number;
  pending: number;
  error_rate: number;
  avg_response_time: number;
  total_tool_calls: number;
  uptime_percentage: number;
}

// ---------------------------------------------------------------------------
// Template Management
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<AgentTemplate[]> {
  return superAdminApiCall<AgentTemplate[]>("/platform/agents/templates");
}

export async function getTemplate(id: number): Promise<AgentTemplate> {
  return superAdminApiCall<AgentTemplate>(`/platform/agents/templates/${id}`);
}

export async function createTemplate(template: Omit<AgentTemplate, "id" | "created_at" | "updated_at" | "version">): Promise<AgentTemplate> {
  return superAdminPost<AgentTemplate>("/platform/agents/templates", template);
}

export async function updateTemplate(id: number, updates: Partial<AgentTemplate>): Promise<AgentTemplate> {
  return superAdminPatch<AgentTemplate>(`/platform/agents/templates/${id}`, updates);
}

export async function deleteTemplate(id: number): Promise<void> {
  await superAdminDelete(`/platform/agents/templates/${id}`);
}

// ---------------------------------------------------------------------------
// Deployment Management
// ---------------------------------------------------------------------------

export async function listDeployments(): Promise<TenantAgent[]> {
  return superAdminApiCall<TenantAgent[]>("/platform/agents/deployments");
}

export async function getTenantAgent(id: number): Promise<TenantAgent> {
  return superAdminApiCall<TenantAgent>(`/platform/agents/deployments/${id}`);
}

export async function updateTenantAgent(id: number, updates: Partial<TenantAgent>): Promise<TenantAgent> {
  return superAdminPatch<TenantAgent>(`/platform/agents/deployments/${id}`, updates);
}

export async function removeTenantAgent(id: number): Promise<void> {
  await superAdminDelete(`/platform/agents/deployments/${id}`);
}

export async function deployAgent(templateId: number, companyId: number): Promise<TenantAgent> {
  return superAdminPost<TenantAgent>("/platform/agents/deployments", { template_id: templateId, company_id: companyId });
}

// ---------------------------------------------------------------------------
// Health Monitoring
// ---------------------------------------------------------------------------

export async function getAgentHealthSummary(): Promise<AgentHealthSummary> {
  return superAdminApiCall<AgentHealthSummary>("/platform/agents/health/summary");
}

export async function getDeploymentHeartbeats(agentId: number, limit: number = 50): Promise<AgentHeartbeat[]> {
  return superAdminApiCall<AgentHeartbeat[]>(`/platform/agents/deployments/${agentId}/heartbeats?limit=${limit}`);
}

// ---------------------------------------------------------------------------
// Workflow Management
// ---------------------------------------------------------------------------

export async function getAgentWorkflows(agentId: number): Promise<AgentWorkflowMapping[]> {
  return superAdminApiCall<AgentWorkflowMapping[]>(`/platform/agents/deployments/${agentId}/workflows`);
}

export async function mapAgentToWorkflow(agentId: number, workflowStep: string, role: string = "primary"): Promise<AgentWorkflowMapping> {
  return superAdminPost<AgentWorkflowMapping>(`/platform/agents/deployments/${agentId}/workflows`, { workflow_step: workflowStep, role });
}

export async function unmapAgentFromWorkflow(mappingId: number): Promise<void> {
  await superAdminDelete(`/platform/agents/workflows/${mappingId}`);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getAgentDashboard(): Promise<any> {
  return superAdminApiCall("/platform/agents/dashboard");
}
