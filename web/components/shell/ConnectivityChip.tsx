"use client";

// Phase 6.2 follow-up — small TopBar chip surfacing offline state and the
// number of receipt uploads queued in IndexedDB. Stays silent (renders
// nothing) when online and queue empty, so the chrome doesn't get noisy
// for the 99% of normal sessions.

import { useEffect, useState } from "react";
import { CloudOff, UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { countQueuedUploads } from "@/lib/offline/uploadQueue";

export default function ConnectivityChip() {
  const t = useTranslations("shell");
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    let cancelled = false;
    const refresh = async () => {
      try {
        const n = await countQueuedUploads();
        if (!cancelled) setQueued(n);
      } catch {
        if (!cancelled) setQueued(0);
      }
    };
    refresh();

    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    const onQueueChanged = () => refresh();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("opsflow:queue-changed", onQueueChanged);
    const interval = window.setInterval(refresh, 15000);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("opsflow:queue-changed", onQueueChanged);
      window.clearInterval(interval);
    };
  }, []);

  if (online && queued === 0) return null;

  if (!online) {
    return (
      <div
        title={t("offline")}
        aria-label={t("offline")}
        className="hidden items-center gap-1 self-center rounded-full border border-rose-500/30 bg-rose-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-rose-300/85 md:flex"
      >
        <CloudOff className="h-2.5 w-2.5" />
        <span>{t("offline")}</span>
        {queued > 0 && (
          <span className="ml-0.5 rounded-full bg-rose-500/20 px-1 tabular-nums text-rose-200/90">
            {queued}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      title={t("queuedUploads", { count: queued })}
      aria-label={t("queuedUploads", { count: queued })}
      className="hidden items-center gap-1 self-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300/85 md:flex"
    >
      <UploadCloud className="h-2.5 w-2.5" />
      <span className="tabular-nums">{queued}</span>
      <span>{t("queuedShort")}</span>
    </div>
  );
}
