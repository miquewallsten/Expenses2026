"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Network, Building2, Users, Activity, Server, Cpu, HardDrive, Database,
  Loader2, RefreshCw, AlertTriangle, ArrowRight, Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, StatusBadge } from "@/components/admin/shared/AdminPatterns";
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

export default function SuperAdminDashboard() {
  const t = useTranslations("superAdmin.dashboard");
  const tp = useTranslations("superAdmin.agentCenterPromo");
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsData, healthData] = await Promise.all([
        superAdminApiCall<PlatformStats>("/super-admin/stats"),
        superAdminApiCall<SystemHealth>("/super-admin/system-health"),
      ]);
      setStats(statsData);
      setHealth(healthData);
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
    <div className="mx-auto max-w-6xl px-6 py-6 space-y-5">
      <PremiumHeader
        icon={<Activity className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="overview"
        action={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            {t("refresh")}
          </button>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Agent Center Promo */}
      <Link
        href="/super-admin/agent-center"
        className="group block overflow-hidden rounded-lg border border-default bg-surface-1 transition-all hover:border-default hover:shadow-lg"
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
              <Network className="h-5 w-5 text-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-primary">{tp("title")}</h2>
                <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent">
                  {tp("live")}
                </span>
              </div>
              <p className="text-[11px] text-secondary">{tp("description")}</p>
            </div>
          </div>
          <ArrowRight className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5" />
        </div>
      </Link>

      {/* Platform Stats */}
      <SectionPanel title={t("title")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-lg border border-default bg-surface-0 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
              <Building2 className="h-3.5 w-3.5" />
              {t("tenants")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-primary">
              {stats?.total_companies ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-default bg-surface-0 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
              <Users className="h-3.5 w-3.5" />
              {t("totalUsers")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-primary">
              {stats?.total_users ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-default bg-surface-0 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
              <Activity className="h-3.5 w-3.5" />
              {t("activeUsers")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-primary">
              {stats?.active_users ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-default bg-surface-0 p-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted">
              <Zap className="h-3.5 w-3.5" />
              {t("agentFleet")}
            </div>
            <div className="mt-1 text-xl font-bold tabular-nums text-primary">
              {health?.ollama ? t("online") : t("offline")}
            </div>
          </div>
        </div>
      </SectionPanel>

      {/* System Health */}
      <SectionPanel title={t("systemHealth")}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { name: t("database"), icon: Database, ok: health?.database },
            { name: "Redis", icon: HardDrive, ok: health?.redis },
            { name: "Ollama", icon: Cpu, ok: health?.ollama },
            { name: t("storage"), icon: Server, ok: health?.storage },
          ].map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-2 rounded border border-subtle bg-surface-0 px-3 py-2"
            >
              <item.icon className="h-3.5 w-3.5 text-muted" />
              <span className="text-[11px] text-secondary">{item.name}</span>
              <StatusBadge
                status={item.ok ? "success" : "error"}
                label={item.ok ? "OK" : "Down"}
                size="sm"
              />
            </div>
          ))}
        </div>
      </SectionPanel>
    </div>
  );
}
