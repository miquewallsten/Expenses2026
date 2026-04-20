"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { storeSession } from "@/lib/session";
import { useTranslations } from "next-intl";

const API = process.env.NEXT_PUBLIC_API_BASE_URL;

export default function AuthVerifyPage() {
  const t = useTranslations("auth");
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "error">("verifying");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setStatus("error");
      setMessage(t("invalidToken"));
      return;
    }

    fetch(`${API}/auth/magic-link/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? "Verification failed");
        }
        return res.json();
      })
      .then((data) => {
        storeSession({
          token:     data.token,
          userId:    data.user_id,
          email:     data.email,
          role:      data.role,
          companyId: data.company_id,
          fullName:  data.full_name,
        });
        // All roles use the single MyWork portal at /mywork.
        // Admin also gets /admin as their landing so they see the setup dashboard.
        const dest = data.role === "admin" ? "/admin" : "/mywork";
        router.replace(dest);
      })
      .catch((err: Error) => {
        setStatus("error");
        setMessage(err.message ?? t("linkExpired"));
      });
  }, [searchParams, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm text-center">
        {status === "verifying" ? (
          <>
            <div className="mb-4 flex justify-center">
              <span className="inline-flex gap-1.5">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/60"
                    style={{ animationDelay: `${d * 150}ms` }}
                  />
                ))}
              </span>
            </div>
            <p className="text-sm text-white/40">{t("signingIn")}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-red-400">{t("signInFailed")}</p>
            <p className="mt-1 text-xs text-white/40">{message}</p>
            <a
              href="/login"
              className="mt-4 inline-block text-xs text-indigo-400 hover:underline"
            >
              {t("requestNewLink")}
            </a>
          </>
        )}
      </div>
    </div>
  );
}
