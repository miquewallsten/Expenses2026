"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, Sun, Moon, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/shell/ThemeProvider";
import { superAdminPost } from "@/lib/api/super-admin-client";
import { storeSuperAdminSession } from "@/lib/super-admin-session";

export default function SuperAdminLoginPage() {
  const router = useRouter();
  const t = useTranslations("superAdmin");
  const { theme: currentTheme, setTheme: setThemeFn } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError(t("login.emailPasswordRequired"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await superAdminPost<any>(
        "/auth/super-admin/login",
        { email: email.trim(), password },
        { authenticated: false, redirectOn401: false }
      );

      storeSuperAdminSession({
        token: data.token,
        userId: data.user_id,
        email: data.email,
        name: data.full_name,
      });

      localStorage.removeItem("session");
      localStorage.removeItem("currentUserId");

      router.replace("/super-admin/dashboard");
    } catch (err: any) {
      console.error("Login error:", err);
      setError(err.message || t("login.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  const themeIcon = currentTheme === "dark" ? Moon : currentTheme === "light" ? Sun : Monitor;
  const cycleTheme = () => {
    if (currentTheme === "dark") setThemeFn("light");
    else if (currentTheme === "light") setThemeFn("system");
    else setThemeFn("dark");
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-0 px-4">

      {/* Theme toggle */}
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={currentTheme === "dark" ? "Switch to light theme" : currentTheme === "light" ? "Switch to system theme" : "Switch to dark theme"}
        className="fixed right-4 top-4 z-50 flex h-9 w-9 items-center justify-center rounded-lg border border-default bg-surface-2 text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
      >
        {(() => { const I = themeIcon; return <I className="h-4 w-4" />; })()}
      </button>

      {/* Subtle background decoration */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-64 -top-64 h-[200px] w-[200px] rounded-full bg-accent-muted blur-xl" />
        <div className="absolute -bottom-48 -right-48 h-[180px] w-[180px] rounded-full bg-accent-muted blur-xl" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.025]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="relative w-full max-w-sm">
        <div className="overflow-hidden rounded-lg border border-default bg-surface-1 shadow-lg">
          <div className="h-px w-full bg-default" />
          <div className="px-8 py-8">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-error-muted ring-1 ring-error/30">
                <Lock className="h-4 w-4 text-error" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-error/70">{t("login.platformAdmin")}</p>
              </div>
            </div>

            <div className="mb-6">
              <h1 className="text-lg font-semibold tracking-tight text-primary">{t("login.title")}</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-tertiary">{t("login.description")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-tertiary">{t("login.email")}</label>
                <input id="email" type="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  placeholder="admin@platform.com"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2.5 text-sm text-primary placeholder-tertiary outline-none transition-all focus:bg-accent-muted focus:ring-1 focus:ring-accent/30"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-tertiary">{t("login.password")}</label>
                <input id="password" type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  placeholder="Enter password"
                  className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2.5 text-sm text-primary placeholder-tertiary outline-none transition-all focus:bg-accent-muted focus:ring-1 focus:ring-accent/30"
                />
              </div>

              {error && <p className="text-[11px] text-error/80">{error}</p>}

              <button type="submit" disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-error px-4 py-2.5 text-sm font-semibold text-white transition-all hover:bg-accent active:bg-error/80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex gap-1">
                    {[0, 1, 2].map((d) => (
                      <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-white/70" style={{ animationDelay: (d * 120) + "ms" }} />
                    ))}
                  </span>
                ) : (
                  <>{t("login.signIn")}<ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
