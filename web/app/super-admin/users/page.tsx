"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users, Loader2, RefreshCw, Search, Building2
} from "lucide-react";
import { superAdminApiCall } from "@/lib/api/super-admin-client";

interface GlobalUser {
  id: number;
  email: string;
  full_name: string;
  company_id: number;
  company_name: string;
  role: string;
  is_active: boolean;
  last_login: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await superAdminApiCall<GlobalUser[]>("/super-admin/users");
      setUsers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const roles = ["all", ...new Set(users.map(u => u.role))];

  const filtered = users.filter(u => {
    const matchesSearch =
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.company_name.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleColors: Record<string, string> = {
    admin: "bg-accent-muted text-accent",
    super_admin: "bg-rose-500/15 text-rose-300",
    manager: "bg-emerald-500/15 text-emerald-300",
    accountant: "bg-blue-500/15 text-blue-300",
    employee: "bg-surface-2 text-secondary",
  };

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
            <h1 className="text-[15px] font-semibold text-primary">Users</h1>
            <p className="text-[10px] text-muted">All users across all tenants</p>
          </div>
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
        <div className="mb-4 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded border border-subtle bg-surface-1 py-1.5 pl-8 pr-3 text-[11px] text-secondary placeholder:text-muted focus:border-default focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded border border-subtle bg-surface-1 px-2.5 py-1.5 text-[11px] text-secondary focus:border-default focus:outline-none"
        >
          {roles.map(r => (
            <option key={r} value={r}>{r === "all" ? "All Roles" : r}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-muted">Total</div>
          <div className="text-[16px] font-bold text-primary">{users.length}</div>
        </div>
        <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-muted">Active</div>
          <div className="text-[16px] font-bold text-success">{users.filter(u => u.is_active).length}</div>
        </div>
        <div className="rounded border border-subtle bg-surface-1 px-3 py-2">
          <div className="text-[9px] uppercase tracking-widest text-muted">Tenants</div>
          <div className="text-[16px] font-bold text-accent">{new Set(users.map(u => u.company_id)).size}</div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded border border-subtle bg-surface-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center text-[11px] text-muted">
            {search || roleFilter !== "all" ? "No users match your filters" : "No users yet"}
          </div>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-subtle text-left text-[9px] uppercase tracking-widest text-muted">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-subtle last:border-0 hover:bg-surface-2">
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-muted text-[10px] font-medium text-accent">
                        {(u.full_name || u.email).charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-secondary">{u.full_name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted">{u.email}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-muted" />
                      <span className="text-tertiary">{u.company_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${roleColors[u.role] || "bg-surface-2 text-secondary"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${u.is_active ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-muted">
                    {u.last_login ? new Date(u.last_login).toLocaleDateString() : "Never"}
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