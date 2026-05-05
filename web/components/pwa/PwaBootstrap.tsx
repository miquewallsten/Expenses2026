"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, X } from "lucide-react";
import { drainUploadQueue, type QueuedUpload } from "@/lib/offline/uploadQueue";
import { apiCall, HttpError } from "@/lib/api/client";

async function uploadOne(row: QueuedUpload): Promise<boolean> {
  try {
    const form = new FormData();
    form.append("company_id", String(row.companyId));
    form.append("file", row.blob, row.filename);
    await apiCall("/expenses/documents/upload", {
      method: "POST",
      body: form,
    });
    return true;
  } catch (e) {
    // 4xx is a permanent failure (auth / validation / wrong company). Drop
    // the row so we don't loop forever; the user can re-capture if needed.
    if (e instanceof HttpError && e.status >= 400 && e.status < 500) return true;
    return false;
  }
}

// PWA install prompt + service worker registrar.
// - Registers /sw.js (production only — dev SW caching makes Turbopack a nightmare).
// - Listens for `beforeinstallprompt`, shows a dismissable banner (admins +
//   employees alike). Stores dismissal in localStorage so we don't nag.

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "opsflow.pwa.installPromptDismissedAt";
const DISMISS_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export default function PwaBootstrap() {
  const t = useTranslations("pwa");
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [visible, setVisible] = useState(false);

  // Register SW.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* swallow: SW registration is best-effort */
    });
  }, []);

  // Capture install prompt.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // Drain the offline upload queue when we boot online and whenever the
  // browser flips back to online. Best-effort, never blocks UI.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const drain = () => {
      void drainUploadQueue(uploadOne);
    };
    drain();
    window.addEventListener("online", drain);
    return () => window.removeEventListener("online", drain);
  }, []);

  const onInstall = async () => {
    if (!evt) return;
    await evt.prompt();
    await evt.userChoice;
    setVisible(false);
    setEvt(null);
  };

  const onDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible || !evt) return null;

  return (
    <div
      role="dialog"
      aria-label={t("installTitle")}
      className="fixed bottom-4 left-1/2 z-40 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-lg border border-default bg-surface-1 p-3 shadow-xl"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-accent-muted text-accent">
          <Download className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-primary">{t("installTitle")}</div>
          <div className="mt-0.5 text-[12px] leading-snug text-secondary">{t("installSubtitle")}</div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={onInstall}
              className="inline-flex h-7 items-center rounded-md bg-blue-500 px-3 text-[12px] font-medium text-primary hover:bg-blue-600"
            >
              {t("install")}
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex h-7 items-center rounded-md border border-default bg-surface-2 px-3 text-[12px] text-secondary hover:bg-surface-3 hover:text-primary"
            >
              {t("notNow")}
            </button>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t("close")}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-secondary hover:bg-surface-2 hover:text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
