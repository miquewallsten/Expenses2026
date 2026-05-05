"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, Send, CheckSquare } from "lucide-react";
import { executeAction } from "@/lib/mywork/actions";
import { useToast } from "@/components/ui/Toast";

export default function AnnouncementPanel() {
  const t = useTranslations("admin.announcement");
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [channels, setChannels] = useState<Record<string, boolean>>({
    mywork: true,
    email: false,
    whatsapp: false,
  });
  const [sending, setSending] = useState(false);

  const TARGET_OPTIONS = [
    { value: "all", label: t("targetAll") },
    { value: "employees", label: t("targetEmployees") },
    { value: "managers", label: t("targetManagers") },
    { value: "accounting", label: t("targetAccounting") },
    { value: "departments", label: t("targetDepartments") },
  ];

  const CHANNEL_OPTIONS = [
    { value: "mywork", label: t("channelMyWork"), defaultChecked: true },
    { value: "email", label: t("channelEmail"), defaultChecked: false },
    { value: "whatsapp", label: t("channelWhatsApp"), defaultChecked: false },
  ];

  const toggleChannel = (key: string) => {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error(t("errorNoMessage"));
      return;
    }
    const activeChannels = Object.entries(channels)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (activeChannels.length === 0) {
      toast.error(t("errorNoChannel"));
      return;
    }
    setSending(true);
    try {
      const res = await executeAction("announcement:send", "admin", {
        message: message.trim(),
        target,
        channels: activeChannels,
      });
      if (res.success) {
        toast.success(t("successSent"), `${activeChannels.join(", ")}`);
        setMessage("");
      } else {
        toast.error(res.error?.message ?? t("errorSend"));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("errorSend");
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4" data-testid="announcement-panel">
      <header className="mb-4">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-primary">
          {t("title")}
        </h1>
        <p className="mt-0.5 text-[10.5px] text-tertiary">
          {t("subtitle")}
        </p>
      </header>

      <div className="space-y-3">
        <div className="rounded border border-default bg-surface-1 p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("messageLabel")}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder={t("messagePlaceholder")}
            className="w-full rounded border border-default bg-surface-1 px-2.5 py-2 text-[11px] text-secondary placeholder:text-muted focus:outline-none focus:bg-accent-muted resize-none"
          />
        </div>

        <div className="rounded border border-default bg-surface-1 p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("targetLabel")}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTarget(opt.value)}
                className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] transition-colors ${
                  target === opt.value
                    ? "bg-accent-muted bg-accent-muted text-accent"
                    : "border-subtle bg-surface-1 text-tertiary hover:bg-surface-2"
                }`}
              >
                <CheckSquare
                  className={`h-3 w-3 ${target === opt.value ? "text-accent" : "text-muted"}`}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-default bg-surface-1 p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("channelsLabel")}
          </label>
          <div className="flex flex-wrap gap-3">
            {CHANNEL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 text-[11px] text-secondary"
              >
                <input
                  type="checkbox"
                  checked={channels[opt.value]}
                  onChange={() => toggleChannel(opt.value)}
                  className="accent-blue-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded border border-default bg-surface-1 p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-muted">
            {t("previewLabel")}
          </label>
          <div className="rounded border border-subtle bg-surface-1 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-blue-500/25">
                <Megaphone className="h-3 w-3 text-accent" />
              </span>
              <span className="text-[10px] font-medium text-secondary">{t("previewTitle")}</span>
            </div>
            <p className="text-[11px] text-tertiary whitespace-pre-wrap">
              {message.trim() || <span className="italic text-muted">{t("previewPlaceholder")}</span>}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded border bg-accent-muted bg-accent-muted px-3 py-2 text-[11px] font-medium text-accent transition-colors hover:bg-accent-hover/15 disabled:opacity-40"
          data-testid="announcement-send"
        >
          <Send className="h-3 w-3" />
          {sending ? t("sending") : t("sendButton")}
        </button>
      </div>
    </div>
  );
}
