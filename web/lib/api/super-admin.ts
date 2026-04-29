/**
 * Super Admin API client
 * Provides typed access to platform-wide management endpoints
 */

import { apiCall } from "./client";

export interface AgentMetrics {
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  active_requests: number;
  uptime_seconds: number;
  request_rate_per_minute: number;
}

export interface ActiveRequest {
  team: string;
  start_time: number;
  status: string;
  user_message: string;
  duration?: number;
  end_time?: number;
  error?: string;
}

export interface TeamPerformance {
  team: string;
  total_requests: number;
  successful_requests: number;
  failed_requests: number;
  success_rate: number;
  avg_duration: number;
}

export interface AgentTeamStatus {
  team: string;
  status: string;
  requests: number;
  success_rate: number;
  company_id: number;
  company_name: string;
}

export interface TenantSummary {
  id: number;
  name: string;
  slug: string;
  user_count: number;
  is_active: boolean;
  created_at: string;
}

export interface SystemHealth {
  database: boolean;
  redis: boolean;
  ollama: boolean;
  storage: boolean;
  uptime: string;
  memory_usage: number;
  cpu_usage: number;
}

export interface GlobalUser {
  id: number;
  email: string;
  full_name: string;
  company_id: number;
  company_name: string;
  role: string;
  is_active: boolean;
  last_login: string;
}

export interface PlatformStats {
  total_companies: number;
  total_users: number;
  active_users: number;
  inactive_users: number;
}

/**
 * Get real-time agent performance metrics
 */
export async function getAgentMetrics(): Promise<AgentMetrics> {
  return apiCall<AgentMetrics>("/super-admin/agent-metrics");
}

/**
 * Get currently active agent requests
 */
export async function getActiveRequests(): Promise<ActiveRequest[]> {
  return apiCall<ActiveRequest[]>("/super-admin/active-requests");
}

/**
 * Get recent request history
 */
export async function getRequestHistory(limit: number = 100): Promise<ActiveRequest[]> {
  return apiCall<ActiveRequest[]>("/super-admin/request-history?limit=" + limit);
}

/**
 * Get detailed performance metrics by team
 */
export async function getTeamPerformance(): Promise<Record<string, TeamPerformance>> {
  return apiCall<Record<string, TeamPerformance>>("/super-admin/team-performance");
}

/**
 * Get status of ALL agent teams across ALL companies
 */
export async function getGlobalAgentStatus(): Promise<AgentTeamStatus[]> {
  return apiCall<AgentTeamStatus[]>("/super-admin/agents/status");
}

/**
 * List all companies/tenants in the platform
 */
export async function listAllTenants(): Promise<TenantSummary[]> {
  return apiCall<TenantSummary[]>("/super-admin/tenants");
}

/**
 * Get platform-wide system health
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  return apiCall<SystemHealth>("/super-admin/system-health");
}

/**
 * List ALL users across ALL companies
 */
export async function listAllUsers(): Promise<GlobalUser[]> {
  return apiCall<GlobalUser[]>("/super-admin/users");
}

/**
 * Get platform-wide statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  return apiCall<PlatformStats>("/super-admin/stats");
}