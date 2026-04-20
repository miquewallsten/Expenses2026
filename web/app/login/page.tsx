"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function LoginPage() {
  const t = useTranslations("auth");
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-1">
            {t("platformName")}
          </p>
          <h1 className="text-xl font-semibold text-white">{t("signIn")}</h1>
          <p className="mt-1 text-xs text-white/35">
            {t("enterEmailHint")}
          </p>
        </div>

        {sent ? (
          <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-4 py-5">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600/20">
              <Mail className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="text-sm font-medium text-white/80">{t("checkEmail")}</p>
            <p className="mt-1 text-xs text-white/40">
              {t("emailSentTo")} <span className="text-white/60">{email}</span>.{" "}
              {t("expiresIn15")}
            </p>
            {devLink && (
              <div className="mt-4 rounded border border-amber-500/20 bg-amber-500/[0.06] p-3">
                <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-amber-400/60">
                  {t("devMode")}
                </p>
                <a
                  href={devLink}
                  className="break-all text-[11px] text-indigo-400 underline-offset-2 hover:underline"
                >
                  {devLink}
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1.5">
                {t("emailLabel")}
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder={t("emailPlaceholder")}
                className="w-full rounded border border-white/[0.1] bg-white/[0.04] px-3 py-2 text-sm text-white placeholder-white/20 outline-none focus:border-indigo-500/50 transition-colors"
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded border border-white/[0.1] bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/[0.11] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? t("sending") : t("sendLink")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
