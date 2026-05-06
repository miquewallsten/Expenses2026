"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Megaphone, Send, CheckSquare, Bell } from "lucide-react";
import { executeAction } from "@/lib/mywork/actions";
import { useToast } from "@/components/ui/Toast";
import {
  PremiumHeader,
  SectionPanel,
  SectionLabel,
  inputClasses,
} from "@/components/admin/shared/AdminPatterns";

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
    <div className="space-y-6" data-testid="announcement-panel">
      <PremiumHeader
        section="notifications"
        icon={<Bell className="h-4 w-4" />}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-3">
          <SectionLabel>{t("messageLabel")}</SectionLabel>
          <SectionPanel>
             <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder={t("messagePlaceholder")}
              className={`w-full border-0 bg-transparent ring-0 focus:ring-0 ${inputClasses.textarea}`}
            />
          </SectionPanel>
        </div>

        <div className="space-y-3">
          <SectionLabel>{t("targetLabel")}</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {TARGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTarget(opt.value)}
                className={`flex items-center gap-2 rounded-xl border p-3 text-[11.5px] font-medium transition-all ${
                  target === opt.value
                    ? "border-accent/40 bg-accent/10 text-accent shadow-sm"
                    : "border-white/5 bg-surface-1 text-secondary hover:bg-surface-2"
                }`}
              >
                <CheckSquare
                  className={`h-3.5 w-3.5 ${target === opt.value ? "text-accent" : "text-muted"}`}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <SectionLabel>{t("channelsLabel")}</SectionLabel>
          <SectionPanel>
             <div className="flex flex-wrap gap-6 p-4">
                {CHANNEL_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 text-[11.5px] font-medium text-secondary hover:text-primary transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={channels[opt.value]}
                      onChange={() => toggleChannel(opt.value)}
                      className="h-4 w-4 rounded border-white/10 bg-white/5 text-accent focus:ring-accent/20"
                    />
                    {opt.label}
                  </label>
                ))}
             </div>
          </SectionPanel>
        </div>

        <div className="space-y-3">
          <SectionLabel>{t("previewLabel")}</SectionLabel>
          <div className="rounded-xl border border-dashed border-white/10 bg-black/10 p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/20 text-accent">
                <Megaphone className="h-3.5 w-3.5" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-primary">{t("previewTitle")}</span>
            </div>
            <p className="text-[12px] text-secondary whitespace-pre-wrap leading-relaxed">
              {message.trim() || <span className="italic text-muted/50">{t("previewPlaceholder")}</span>}
            </p>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[12px] font-bold text-white shadow-lg shadow-accent/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:scale-100"
            data-testid="announcement-send"
          >
            <Send className="h-4 w-4" />
            {sending ? t("sending") : t("sendButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
