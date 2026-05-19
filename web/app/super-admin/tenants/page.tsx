"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, Plus, Loader2, RefreshCw, Search, MoreVertical,
  Trash2, UserPlus, Edit2, Eye, X, Mail, Shield, ChevronRight,
  ExternalLink, Check, UserX, UserCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, StatusBadge, inputClasses } from "@/components/admin/shared/AdminPatterns";
import {
  superAdminApiCall, superAdminPost, superAdminPut, superAdminDelete, superAdminPatch,
} from "@/lib/api/super-admin-client";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  user_count: number;
  is_active: boolean;
  dev_login_enabled: boolean;
  created_at: string;
}

interface TenantCreate {
  name: string;
  slug: string;
  admin_email: string;
}

interface GlobalUser {
  id: number;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
}

export default function TenantsPage() {
  const t = useTranslations("superAdmin.tenants");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState<TenantCreate>({ name: "", slug: "", admin_email: "" });
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

  const [detailsId, setDetailsId] = useState<number | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<GlobalUser[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "config">("users");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAdminApiCall<Tenant[]>("/super-admin/tenants");
      setTenants(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tenants");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openDetails = async (id: number) => {
    setDetailsId(id);
    setDetailsLoading(true);
    try {
      const users = await superAdminApiCall<GlobalUser[]>(`/super-admin/tenants/${id}/users`);
      setTenantUsers(users);
    } catch (e) {
      console.error(e);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newTenant.name || !newTenant.slug || !newTenant.admin_email) return;
    setCreating(true);
    try {
      const tenant = await superAdminPost<Tenant>("/super-admin/tenants", newTenant);
      setTenants(prev => [...prev, tenant]);
      setShowCreate(false);
      setNewTenant({ name: "", slug: "", admin_email: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (tenant: Tenant) => {
    try {
      const updated = await superAdminPut<Tenant>(`/super-admin/tenants/${tenant.id}`, { is_active: !tenant.is_active });
      setTenants(prev => prev.map(tn => tn.id === tenant.id ? updated : tn));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tenant");
    }
    setMenuOpen(null);
  };

  const handleResendInvite = async (user: GlobalUser) => {
    try {
      const res = await superAdminPost<{link: string}>(`/super-admin/users/${user.id}/resend-invite`);
      alert(`Magic Link: ${res.link}`);
    } catch (e) {
      alert("Failed to generate invite");
    }
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`Delete "${tenant.name}"?`)) return;
    try {
      await superAdminDelete(`/super-admin/tenants/${tenant.id}`);
      setTenants(prev => prev.filter(tn => tn.id !== tenant.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete tenant");
    }
    setMenuOpen(null);
  };

  const handleToggleDevLogin = async (tenant: Tenant) => {
    try {
      const updated = await superAdminPut<Tenant>(`/super-admin/tenants/${tenant.id}`, { dev_login_enabled: !tenant.dev_login_enabled });
      setTenants(prev => prev.map(tn => tn.id === tenant.id ? updated : tn));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tenant");
    }
    setMenuOpen(null);
  };

  const filtered = tenants.filter(tn =>
    tn.name.toLowerCase().includes(search.toLowerCase()) ||
    tn.slug.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTenant = tenants.find(tn => tn.id === detailsId);

  return (
    <div className="mx-auto max-w-5xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<Building2 className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="company-setup"
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-1.5 rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {t("refresh")}
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded bg-accent py-1.5 px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-accent-hover"
            >
              <Plus className="h-3 w-3" />
              {t("create")}
            </button>
          </div>
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          <X className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <SectionPanel title={t("title")}>
        {/* Search */}
        <div className="mb-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className={inputClasses.base + " pl-8"}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[11px] text-muted">{t("noTenants")}</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((tenant) => (
              <div
                key={tenant.id}
                className={`group flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors cursor-pointer ${
                  detailsId === tenant.id
                    ? "border-accent/30 bg-accent/5"
                    : "border-default bg-surface-0 hover:bg-surface-1"
                }`}
                onClick={() => openDetails(tenant.id)}
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-2">
                  <Building2 className="h-4 w-4 text-secondary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold text-primary truncate">{tenant.name}</div>
                  <div className="text-[10px] text-muted font-mono">{tenant.slug}</div>
                </div>
                <StatusBadge
                  status={tenant.is_active ? "success" : "error"}
                  label={tenant.is_active ? t("active") : t("inactive")}
                  size="sm"
                />
                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === tenant.id ? null : tenant.id); }}
                    className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-2"
                  >
                    <MoreVertical className="h-3.5 w-3.5 text-muted" />
                  </button>
                  {menuOpen === tenant.id && (
                    <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded border border-subtle bg-surface-1 py-1 shadow-xl">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggle(tenant); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-secondary hover:bg-surface-2"
                      >
                        {tenant.is_active ? <><UserX className="h-3 w-3" /> {t("inactive")}</> : <><UserCheck className="h-3 w-3" /> {t("active")}</>}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggleDevLogin(tenant); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-secondary hover:bg-surface-2"
                      >
                        Dev Login: {tenant.dev_login_enabled ? "ON" : "OFF"}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(tenant); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-error hover:bg-error/5"
                      >
                        <Trash2 className="h-3 w-3" /> {t("delete")}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overlay-backdrop" onClick={() => setShowCreate(false)}>
          <div className="w-full max-w-md rounded-lg border border-default bg-surface-1 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-semibold text-primary">{t("createTitle")}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">{t("name")}</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                  className={inputClasses.base}
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">{t("slug")}</label>
                <input
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })}
                  className={inputClasses.base}
                />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">{t("adminEmail")}</label>
                <input
                  type="email"
                  value={newTenant.admin_email}
                  onChange={(e) => setNewTenant({ ...newTenant, admin_email: e.target.value })}
                  className={inputClasses.base}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded border border-default bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2">
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="rounded bg-accent px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-accent-hover disabled:opacity-40"
              >
                {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Panel */}
      {detailsId && selectedTenant && (
        <div className="fixed inset-0 z-40 flex justify-end overlay-backdrop" onClick={() => setDetailsId(null)}>
          <div className="w-full max-w-lg overflow-auto bg-surface-1 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-primary">{selectedTenant.name}</h2>
                <p className="text-[10px] font-mono text-muted">{selectedTenant.slug}</p>
              </div>
              <button onClick={() => setDetailsId(null)} className="rounded p-1 hover:bg-surface-2">
                <X className="h-4 w-4 text-muted" />
              </button>
            </div>

            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setActiveTab("users")}
                className={`rounded px-3 py-1.5 text-[11px] font-medium ${activeTab === "users" ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2"}`}
              >
                {t("users")} ({tenantUsers.length})
              </button>
              <button
                onClick={() => setActiveTab("config")}
                className={`rounded px-3 py-1.5 text-[11px] font-medium ${activeTab === "config" ? "bg-accent/15 text-accent" : "text-muted hover:bg-surface-2"}`}
              >
                {t("config")}
              </button>
            </div>

            {activeTab === "users" ? (
              <div>
                {detailsLoading ? (
                  <div className="flex justify-center py-10"><Loader2 className="h-4 w-4 animate-spin text-muted" /></div>
                ) : tenantUsers.length === 0 ? (
                  <div className="py-10 text-center text-[11px] text-muted">{t("noUsers")}</div>
                ) : (
                  <div className="space-y-2">
                    {tenantUsers.map(u => (
                      <div key={u.id} className="flex items-center justify-between rounded-lg border border-subtle bg-surface-0 p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-semibold text-primary truncate">{u.full_name || "New"}</span>
                            <span className="rounded-sm bg-surface-2 px-1 py-0.5 text-[8px] font-bold uppercase text-muted">{u.role}</span>
                          </div>
                          <div className="text-[10px] text-muted font-mono truncate">{u.email}</div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <button onClick={() => handleResendInvite(u)} title={t("resendInvite")} className="p-1.5 rounded hover:bg-surface-2 text-secondary">
                            <Mail className="h-3.5 w-3.5" />
                          </button>
                          <span className={`flex items-center gap-1 text-[10px] ${u.is_active ? "text-success" : "text-error"}`}>
                            <div className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-success" : "bg-error"}`} />
                            {u.is_active ? t("active") : t("inactive")}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-dashed border-error/30 bg-error/5 p-4 text-center">
                  <Shield className="mx-auto mb-2 h-5 w-5 text-error/50" />
                  <p className="text-[11px] text-error/70">{t("discoveryPhase")}</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-secondary">{t("commsChannels")}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{t("unverified")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-secondary">{t("addOnModules")}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted">{t("drafting")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-secondary">{t("identityAssets")}</span>
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-success">{t("standard")}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 border-t border-subtle pt-5">
              <button
                onClick={() => {
                  localStorage.setItem("currentUserId", String(tenantUsers[0]?.id));
                  localStorage.setItem("currentCompanyId", String(detailsId));
                  window.location.href = "/mywork?module=admin";
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[11px] font-bold text-surface-0 hover:bg-primary-hover"
              >
                <ExternalLink className="h-3.5 w-3.5" /> {t("assumeWorkspace")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
