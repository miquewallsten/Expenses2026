"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2, Plus, Loader2, RefreshCw, Search, MoreVertical,
  Trash2, UserPlus, Edit2
} from "lucide-react";
import { superAdminApiCall, superAdminPost, superAdminPut, superAdminDelete } from "@/lib/api/super-admin-client";

interface Tenant {
  id: number;
  name: string;
  slug: string;
  user_count: number;
  is_active: boolean;
  created_at: string;
}

interface TenantCreate {
  name: string;
  slug: string;
  admin_email: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState<TenantCreate>({ name: "", slug: "", admin_email: "" });
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState<number | null>(null);

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
      const updated = await superAdminPut<Tenant>(`/super-admin/tenants/${tenant.id}`, {
        is_active: !tenant.is_active
      });
      setTenants(prev => prev.map(t => t.id === tenant.id ? updated : t));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tenant");
    }
    setMenuOpen(null);
  };

  const handleDelete = async (tenant: Tenant) => {
    if (!confirm(`Delete "${tenant.name}"? This cannot be undone.`)) return;
    try {
      await superAdminDelete(`/super-admin/tenants/${tenant.id}`);
      setTenants(prev => prev.filter(t => t.id !== tenant.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete tenant");
    }
    setMenuOpen(null);
  };

  const filtered = tenants.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-5xl px-5 py-5">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/dashboard"
            className="flex items-center gap-1 rounded border border-subtle bg-surface-1 px-2 py-1 text-[11px] text-secondary hover:bg-surface-2"
          >
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-[15px] font-semibold text-primary">Tenants</h1>
            <p className="text-[10px] text-muted">Manage all companies on the platform</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded border border-subtle bg-surface-1 px-2 py-1.5 text-[11px] text-secondary hover:bg-surface-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent-hover"
          >
            <Plus className="h-3 w-3" />
            New Tenant
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          {error}
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenants..."
            className="w-full rounded border border-subtle bg-surface-1 py-1.5 pl-8 pr-3 text-[11px] text-secondary placeholder:text-muted focus:border-default focus:outline-none"
          />
        </div>
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded border border-subtle bg-surface-1 p-4">
            <h2 className="mb-4 text-[13px] font-semibold text-primary">Create New Tenant</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted">Company Name</label>
                <input
                  type="text"
                  value={newTenant.name}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:border-default focus:outline-none"
                  placeholder="Acme Corp"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted">Slug</label>
                <input
                  type="text"
                  value={newTenant.slug}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))}
                  className="w-full rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] font-mono text-secondary focus:border-default focus:outline-none"
                  placeholder="acme-corp"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-widest text-muted">Admin Email</label>
                <input
                  type="email"
                  value={newTenant.admin_email}
                  onChange={(e) => setNewTenant(prev => ({ ...prev, admin_email: e.target.value }))}
                  className="w-full rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:border-default focus:outline-none"
                  placeholder="admin@acme.com"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="rounded border border-subtle bg-surface-1 px-3 py-1.5 text-[11px] text-secondary hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTenant.name || !newTenant.slug || !newTenant.admin_email}
                className="flex items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-[11px] text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded border border-subtle bg-surface-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-muted">
            {search ? "No tenants match your search" : "No tenants yet"}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-subtle text-left text-[9px] uppercase tracking-widest text-muted">
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2 text-right">Users</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b border-subtle last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded bg-accent-muted text-[10px] font-medium text-accent">
                        {t.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-secondary">{t.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-muted">{t.slug}</td>
                  <td className="px-3 py-2.5 text-right text-tertiary">{t.user_count}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${t.is_active ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                      {t.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="relative">
                      <button
                        onClick={() => setMenuOpen(menuOpen === t.id ? null : t.id)}
                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-surface-3"
                      >
                        <MoreVertical className="h-3.5 w-3.5 text-muted" />
                      </button>
                      {menuOpen === t.id && (
                        <div className="absolute right-0 top-full z-10 w-36 rounded border border-subtle bg-surface-1 py-1 shadow-lg">
                          <button
                            onClick={() => handleToggle(t)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-secondary hover:bg-surface-2"
                          >
                            {t.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => handleDelete(t)}
                            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[10px] text-error hover:bg-surface-2"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}