"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/auth/super-admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? "Login failed");
      }

      const data = await res.json();

      // Store super-admin session separately from tenant session
      localStorage.setItem(
        "superAdminSession",
        JSON.stringify({
          token: data.token,
          userId: data.user_id,
          email: data.email,
          name: data.full_name,
        })
      );

      router.replace("/super-admin/llm-config");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-0 px-4">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-64 -top-64 h-[600px] w-[600px] rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute -bottom-48 -right-48 h-[500px] w-[500px] rounded-full bg-rose-500/10 blur-3xl" />
        <svg
          className="absolute inset-0 h-full w-full opacity-[0.025]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="animate-scale-in relative w-full max-w-sm">
        {/* Glow ring */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-rose-500/20 via-transparent to-transparent" />

        <div className="relative overflow-hidden rounded-2xl border border-default bg-surface-1/80 shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-sm">
          {/* Top accent - rose for super-admin */}
          <div className="h-px w-full bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />

          <div className="px-8 py-8">
            {/* Brand mark */}
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-600/25 ring-1 ring-rose-500/30">
                <Lock className="h-4 w-4 text-rose-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-error/70">
                  Platform Admin
                </p>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h1 className="text-lg font-semibold tracking-tight text-primary">Super Admin Access</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-tertiary">
                Cross-tenant platform administration. Credentials required.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-tertiary"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError("");
                  }}
                  placeholder="admin@platform.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2.5 text-sm text-primary placeholder-tertiary outline-none transition-all focus:bg-accent-muted focus:ring-1 focus:ring-rose-500/30"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-tertiary"
                >
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2.5 text-sm text-primary placeholder-tertiary outline-none transition-all focus:bg-accent-muted focus:ring-1 focus:ring-rose-500/30"
                />
              </div>

              {error && <p className="text-[11px] text-error/80">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-rose-500 active:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70"
                        style={{ animationDelay: `${d * 120}ms` }}
                      />
                    ))}
                  </span>
                ) : (
                  <>
                    Sign In
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}