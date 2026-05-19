"use client";

import { useEffect, useState } from "react";
import {
  Users, Loader2, RefreshCw, Search, Building2, MoreVertical,
  Mail, Shield, UserX, UserCheck, Edit2, Check, X, Copy,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { PremiumHeader, SectionPanel, StatusBadge, inputClasses } from "@/components/admin/shared/AdminPatterns";
import { superAdminApiCall, superAdminPatch, superAdminPost } from "@/lib/api/super-admin-client";
import { copyToClipboard } from "@/lib/copy";

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

const ROLE_CLASSES: Record<string, string> = {
  admin: "bg-accent-muted text-accent",
  super_admin: "bg-error-muted text-error",
  manager: "bg-success-muted text-success",
  accountant: "bg-accent-muted text-accent",
  employee: "bg-surface-2 text-secondary",
};

export default function UsersPage() {
  const t = useTranslations("superAdmin.users");
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [menuOpen, setMenuOpen] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", role: "" });
  const [inviteLink, setInviteLink] = useState<{id: number; link: string} | null>(null);

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

  const handleToggleActive = async (user: GlobalUser) => {
    try {
      await superAdminPatch(`/super-admin/users/${user.id}`, { is_active: !user.is_active });
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: !u.is_active } : u));
    } catch (e) {
      alert("Failed to update user");
    }
    setMenuOpen(null);
  };

  const handleResendInvite = async (user: GlobalUser) => {
    try {
      const res = await superAdminPost<{link: string}>(`/super-admin/users/${user.id}/resend-invite`);
      setInviteLink({ id: user.id, link: res.link });
      setTimeout(() => setInviteLink(null), 10000);
    } catch (e) {
      alert("Failed to generate invite");
    }
    setMenuOpen(null);
  };

  const startEdit = (user: GlobalUser) => {
    setEditingId(user.id);
    setEditForm({ full_name: user.full_name || "", role: user.role });
    setMenuOpen(null);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await superAdminPatch(`/super-admin/users/${editingId}`, editForm);
      setUsers(prev => prev.map(u => u.id === editingId ? { ...u, ...editForm } : u));
      setEditingId(null);
    } catch (e) {
      alert("Save failed");
    }
  };

  const roles = ["all", ...new Set(users.map(u => u.role))];

  const filtered = users.filter(u => {
    const matchesSearch =
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      u.company_name.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === "all" || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="mx-auto max-w-5xl px-5 py-5 space-y-5">
      <PremiumHeader
        icon={<Users className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
        section="users-roles"
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

      {inviteLink && (
        <div className="flex items-center justify-between rounded border border-success/30 bg-success-muted px-4 py-2.5 text-[11px] text-success">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5" />
            <span>{t("inviteLink")}: <strong>{inviteLink.link}</strong></span>
          </div>
          <button onClick={() => { copyToClipboard(inviteLink.link); }} className="text-success/70 hover:text-success">
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded border border-error/30 bg-error/10 px-3 py-2 text-[11px] text-error">
          <X className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <SectionPanel title={t("title")}>
        {/* Filters */}
        <div className="mb-3 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className={inputClasses.base + " pl-8"}
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className={inputClasses.select}
          >
            {roles.map(r => (
              <option key={r} value={r}>{r === "all" ? t("all") : r}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-[11px] text-muted">{t("noUsers")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-subtle bg-surface-1 text-left text-[9px] uppercase tracking-widest text-muted">
                  <th className="px-4 py-2.5">{t("role") === "Role" ? "Name" : "Nombre"}</th>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">{t("role")}</th>
                  <th className="px-4 py-2.5">Tenant</th>
                  <th className="px-4 py-2.5">{t("role") === "Role" ? "Status" : "Estado"}</th>
                  <th className="px-4 py-2.5">{t("lastLogin")}</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => {
                  const isEditing = editingId === u.id;
                  return (
                    <tr key={u.id} className="border-b border-subtle transition-colors hover:bg-surface-1">
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <input
                            value={editForm.full_name}
                            onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
                            className={inputClasses.base}
                          />
                        ) : (
                          <span className="font-medium text-primary">{u.full_name || "New"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-secondary text-[10px]">{u.email}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            value={editForm.role}
                            onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                            className={inputClasses.select}
                          >
                            <option value="admin">ADMIN</option>
                            <option value="manager">MANAGER</option>
                            <option value="accountant">ACCOUNTANT</option>
                            <option value="employee">EMPLOYEE</option>
                          </select>
                        ) : (
                          <span className={`rounded-sm px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider ${ROLE_CLASSES[u.role] || "bg-surface-2 text-secondary"}`}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-muted" />
                          <span className="text-secondary">{u.company_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-[10px] ${u.is_active ? "text-success" : "text-error"}`}>
                          <div className={`h-1.5 w-1.5 rounded-full ${u.is_active ? "bg-success" : "bg-error"}`} />
                          {u.is_active ? "Active" : "Deactivated"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : t("never")}
                      </td>
                      <td className="px-3 py-3">
                        <div className="relative flex items-center justify-end">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <button onClick={saveEdit} className="rounded p-1 text-success hover:bg-success/10"><Check className="h-3.5 w-3.5" /></button>
                              <button onClick={() => setEditingId(null)} className="rounded p-1 text-muted hover:bg-surface-2"><X className="h-3.5 w-3.5" /></button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setMenuOpen(menuOpen === u.id ? null : u.id)}
                                className="flex h-7 w-7 items-center justify-center rounded hover:bg-surface-2 transition-colors"
                              >
                                <MoreVertical className="h-3.5 w-3.5 text-muted" />
                              </button>
                              {menuOpen === u.id && (
                                <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded border border-subtle bg-surface-1 py-1 shadow-xl">
                                  <button
                                    onClick={() => startEdit(u)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-secondary hover:bg-surface-2"
                                  >
                                    <Edit2 className="h-3 w-3" /> {t("editProfile")}
                                  </button>
                                  <button
                                    onClick={() => handleResendInvite(u)}
                                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] text-accent hover:bg-surface-2"
                                  >
                                    <Mail className="h-3 w-3" /> {t("resendInvite")}
                                  </button>
                                  <div className="my-1 h-px bg-subtle" />
                                  <button
                                    onClick={() => handleToggleActive(u)}
                                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[10px] hover:bg-surface-2 ${u.is_active ? "text-error" : "text-success"}`}
                                  >
                                    {u.is_active ? <><UserX className="h-3 w-3" /> {t("deactivate")}</> : <><UserCheck className="h-3 w-3" /> {t("activate")}</>}
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionPanel>
    </div>
  );
}
