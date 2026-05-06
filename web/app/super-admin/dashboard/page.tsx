"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, Users, Activity, Server, Cpu, HardDrive, Database,
  Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle
} from "lucide-react";
import { superAdminApiCall } from "@/lib/api/super-admin-client";

interface PlatformStats {
  total_companies: number;
  total_users: number;
  active_users: number;
  inactive_users: number;
}

interface SystemHealth {
  database: boolean;
  redis: boolean;
  ollama: boolean;
  storage: boolean;
  uptime: string;
  memory_usage: number;
  cpu_usage: number;
}

interface TenantSummary {
  id: number;
  name: string;
  slug: string;
  user_count: number;
  is_active: boolean;
  created_at: string;
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, healthData, tenantsData] = await Promise.all([
        superAdminApiCall<PlatformStats>("/super-admin/stats"),
        superAdminApiCall<SystemHealth>("/super-admin/system-health"),
        superAdminApiCall<TenantSummary[]>("/super-admin/tenants"),
      ]);
      setStats(statsData);
      setHealth(healthData);
      setTenants(tenantsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading && !stats) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[15px] font-semibold text-primary">Platform Dashboard</h1>
          <p className="text-[11px] text-muted">Cross-tenant overview and system health</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Platform Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={<Building2 className="h-4 w-4" />}
          label="Tenants"
          value={stats?.total_companies ?? 0}
          href="/super-admin/tenants"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Total Users"
          value={stats?.total_users ?? 0}
          href="/super-admin/users"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Active Users"
          value={stats?.active_users ?? 0}
          tone="success"
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          label="Inactive Users"
          value={stats?.inactive_users ?? 0}
          tone="warning"
        />
      </div>

      {/* System Health */}
      <div className="mb-5">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted">System Health</h2>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <HealthCard name="Database" ok={health?.database ?? false} />
          <HealthCard name="Redis" ok={health?.redis ?? false} />
          <HealthCard name="LLM (Ollama)" ok={health?.ollama ?? false} />
          <HealthCard name="Storage" ok={health?.storage ?? false} />
        </div>
        {health && (
          <div className="mt-2 flex gap-4 text-[10px] text-muted">
            <span>Uptime: {health.uptime}</span>
            <span>Memory: {health.memory_usage.toFixed(1)}%</span>
            <span>CPU: {health.cpu_usage.toFixed(1)}%</span>
          </div>
        )}
      </div>

      {/* Recent Tenants */}
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted">Tenants</h2>
          <Link
            href="/super-admin/tenants"
            className="text-[10px] text-accent hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="rounded border border-subtle bg-surface-1">
          {tenants.length === 0 ? (
            <div className="px-4 py-6 text-center text-[11px] text-muted">No tenants yet</div>
          ) : (
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-subtle text-left text-[9px] uppercase tracking-widest text-muted">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Slug</th>
                  <th className="px-3 py-2 text-right">Users</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {tenants.slice(0, 5).map((t) => (
                  <tr key={t.id} className="border-b border-subtle last:border-0 hover:bg-surface-2">
                    <td className="px-3 py-2 font-medium text-secondary">{t.name}</td>
                    <td className="px-3 py-2 font-mono text-muted">{t.slug}</td>
                    <td className="px-3 py-2 text-right text-tertiary">{t.user_count}</td>
                    <td className="px-3 py-2 text-muted">
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <QuickLink href="/super-admin/llm-config" icon={<Cpu className="h-3.5 w-3.5" />} label="LLM Config" />
        <QuickLink href="/super-admin/agents" icon={<Activity className="h-3.5 w-3.5" />} label="Agent Definitions" />
        <QuickLink href="/super-admin/ai-policy" icon={<HardDrive className="h-3.5 w-3.5" />} label="AI Policies" />
        <QuickLink href="/super-admin/insights" icon={<Database className="h-3.5 w-3.5" />} label="Insights" />
      </div>
    </div>
  );
}

function StatCard({
  icon, label, value, href, tone = "neutral"
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href?: string;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneCls = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-primary";
  const content = (
    <div className="rounded border border-subtle bg-surface-1 p-3 hover:border-default transition-colors">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-[9px] uppercase tracking-widest">{label}</span>
      </div>
      <div className={`mt-1 text-[20px] font-bold ${toneCls}`}>{value.toLocaleString()}</div>
    </div>
  );
  if (href) {
    return <Link href={href}>{content}</Link>;
  }
  return content;
}

function HealthCard({ name, ok }: { name: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-2 rounded border px-3 py-2 ${ok ? "border-success/30 bg-success/10" : "border-error/30 bg-error/10"}`}>
      {ok ? (
        <CheckCircle className="h-3.5 w-3.5 text-success" />
      ) : (
        <XCircle className="h-3.5 w-3.5 text-error" />
      )}
      <span className={`text-[10px] font-medium ${ok ? "text-success" : "text-error"}`}>{name}</span>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded border border-subtle bg-surface-1 px-3 py-2 text-[11px] text-secondary hover:border-default hover:bg-surface-2 transition-colors"
    >
      <span className="text-muted">{icon}</span>
      {label}
    </Link>
  );
}