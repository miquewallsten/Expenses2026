"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect } from "react";
import { Mail, ArrowRight, Sun, Moon, Monitor } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/components/shell/ThemeProvider";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function LoginPage() {
  const t = useTranslations("auth");
  const tSettings = useTranslations("settings");
  const { theme: currentTheme, setTheme: setThemeFn } = useTheme();
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError(t("emailRequired")); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/magic-link/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      setSent(true);
      if (data.dev_link) setDevLink(data.dev_link);
    } catch {
      setError(t("somethingWentWrong"));
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

      {/* Theme toggle - prominent button */}
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={currentTheme === "dark" ? "Switch to light theme" : currentTheme === "light" ? "Switch to system theme" : "Switch to dark theme"}
          className="flex items-center gap-1.5 rounded-lg border border-default bg-surface-2 px-3 py-2 text-[11px] font-medium text-secondary transition-colors hover:bg-surface-3 hover:text-primary"
        >
          {(() => { const I = themeIcon; return <I className="h-3.5 w-3.5" />; })()}
          {currentTheme === "dark" ? tSettings("themeOptions.dark") : currentTheme === "light" ? tSettings("themeOptions.light") : tSettings("themeOptions.system")}
        </button>
      </div>

      {/* ── Geometric background ───────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* Radial indigo glow - top-left */}
        <div className="absolute -left-64 -top-64 h-[200px] w-[200px] rounded-full bg-accent-muted blur-xl" />
        {/* Radial glow - bottom-right */}
        <div className="absolute -bottom-48 -right-48 h-[180px] w-[180px] rounded-full bg-accent-muted blur-xl" />
        {/* Grid lines */}
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
        {/* Diagonal accent line */}
        <div
          className="absolute left-0 top-0 h-px w-full origin-top-left bg-accent/10"
          style={{ transform: "rotate(-8deg) translateY(38vh) scaleX(1.4)" }}
        />
      </div>

      {/* ── Card ──────────────────────────────────────────────────────────────── */}
      <div className="animate-scale-in relative w-full max-w-sm">

        {/* Glow ring behind card */}
        <div className="absolute -inset-px rounded-2xl bg-accent/5" />

        <div className="relative overflow-hidden rounded-2xl border border-default bg-surface-1/80 shadow-[0_32px_80px_rgba(0,0,0,0.6)] backdrop-blur-sm">

          {/* Top accent bar */}
          <div className="h-px w-full bg-accent/20" />

          <div className="px-8 py-8">

            {/* Brand mark */}
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/25 ring-1 ring-accent/30">
                <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                  <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" className="text-accent" />
                  <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" className="text-accent/40" />
                  <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" className="text-accent/40" />
                  <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" className="text-accent/20" />
                </svg>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted">
                  {t("platformName")}
                </p>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-6">
              <h1 className="text-lg font-semibold tracking-tight text-primary">{t("signIn")}</h1>
              <p className="mt-1 text-[11px] leading-relaxed text-tertiary">
                {t("enterEmailHint")}
              </p>
            </div>

            {sent ? (
              <div className="animate-slide-up">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-muted ring-1 ring-accent/25">
                  <Mail className="h-4.5 w-4.5 text-accent" />
                </div>
                <p className="text-sm font-medium text-primary">{t("checkEmail")}</p>
                <p className="mt-1.5 text-[11px] leading-relaxed text-tertiary">
                  {t("emailSentTo")}{" "}
                  <span className="font-medium text-secondary">{email}</span>.{" "}
                  {t("expiresIn15")}
                </p>
                {devLink && (
                  <div className="mt-5 rounded-lg border border-amber-500/15 bg-amber-500/[0.05] p-3">
                    <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-warning/55">
                      {t("devMode")}
                    </p>
                    <a
                      href={devLink}
                      className="break-all text-[11px] text-accent underline-offset-2 hover:text-accent hover:underline transition-colors"
                    >
                      {devLink}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="email" className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-tertiary">
                    {t("emailLabel")}
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoFocus
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder={t("emailPlaceholder")}
                    className="w-full rounded-lg border border-default bg-surface-2 px-3 py-2.5 text-sm text-primary placeholder-tertiary outline-none transition-all focus:bg-accent-muted  focus:ring-1 focus:ring-accent-muted"
                  />
                </div>

                {error && (
                  <p className="text-[11px] text-error/80">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="group flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-primary transition-all hover:bg-accent-hover active:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex gap-1">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-secondary"
                          style={{ animationDelay: `${d * 120}ms` }}
                        />
                      ))}
                    </span>
                  ) : (
                    <>
                      {t("sendLink")}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </button>
              </form>
            )}

            <div className="mt-4 text-center">
              <a
                href="/super-admin/login"
                className="text-[10px] font-medium uppercase tracking-widest text-muted hover:text-accent transition-colors"
              >
                Platform Admin →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
