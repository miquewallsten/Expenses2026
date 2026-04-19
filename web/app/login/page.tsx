"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCurrentUserId, setCurrentRole, setCurrentCompanyId } from "@/lib/session";

const ROLES = ["employee", "manager", "admin", "accounting"] as const;
type Role = (typeof ROLES)[number];

export default function LoginPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [companyId, setCompanyId] = useState("1");
  const [role, setRole] = useState<Role>("employee");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim()) {
      setError("User ID is required.");
      return;
    }
    setCurrentUserId(userId.trim());
    setCurrentRole(role);
    setCurrentCompanyId(companyId.trim() || "1");
    router.push(`/${role}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">
            Financial Ops Platform
          </div>
          <h1 className="text-xl font-semibold text-white">Portal Login</h1>
          <p className="mt-1 text-xs text-white/35">
            This is a lightweight portal login for local development.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
              User ID
            </label>
            <input
              type="text"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setError(""); }}
              placeholder="e.g. 1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/25 focus:ring-0 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
              Company ID
            </label>
            <input
              type="text"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="e.g. 1"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-white/25 focus:ring-0 transition-colors"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-white/25 transition-colors"
            >
              {ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-2.5 text-sm font-medium text-white transition-colors"
          >
            Enter Portal
          </button>
        </form>
      </div>
    </div>
  );
}
