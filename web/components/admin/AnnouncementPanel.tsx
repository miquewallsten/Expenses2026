"use client";

import { useState } from "react";
import { Megaphone, Send, CheckSquare } from "lucide-react";
import { executeAction } from "@/lib/mywork/actions";
import { useToast } from "@/components/ui/Toast";

const TARGET_OPTIONS = [
  { value: "all", label: "All Users" },
  { value: "employees", label: "Employees" },
  { value: "managers", label: "Managers" },
  { value: "accounting", label: "Accounting" },
  { value: "departments", label: "Departments" },
];

const CHANNEL_OPTIONS = [
  { value: "mywork", label: "MyWork", defaultChecked: true },
  { value: "email", label: "Email", defaultChecked: false },
  { value: "whatsapp", label: "WhatsApp", defaultChecked: false },
];

export default function AnnouncementPanel() {
  const toast = useToast();
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("all");
  const [channels, setChannels] = useState<Record<string, boolean>>({
    mywork: true,
    email: false,
    whatsapp: false,
  });
  const [sending, setSending] = useState(false);

  const toggleChannel = (key: string) => {
    setChannels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSend = async () => {
    if (!message.trim()) {
      toast.error("Please enter a message");
      return;
    }
    const activeChannels = Object.entries(channels)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (activeChannels.length === 0) {
      toast.error("Select at least one channel");
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
        toast.success("Announcement sent", `${activeChannels.join(", ")}`);
        setMessage("");
      } else {
        toast.error(res.error?.message ?? "Failed to send announcement");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to send announcement";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl p-4" data-testid="announcement-panel">
      <header className="mb-4">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-white/85">
          Announcements
        </h1>
        <p className="mt-0.5 text-[10.5px] text-white/40">
          Send targeted messages to your organization.
        </p>
      </header>

      <div className="space-y-3">
        <div className="rounded border border-white/[0.07] bg-white/[0.02] p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/30">
            Message
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Type your announcement…"
            className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[11px] text-white/80 placeholder:text-white/20 focus:outline-none focus:border-indigo-500/40 resize-none"
          />
        </div>

        <div className="rounded border border-white/[0.07] bg-white/[0.02] p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/30">
            Target Audience
          </label>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTarget(opt.value)}
                className={`flex items-center gap-2 rounded border px-2.5 py-1.5 text-[11px] transition-colors ${
                  target === opt.value
                    ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-300/80"
                    : "border-white/[0.06] bg-white/[0.02] text-white/55 hover:bg-white/[0.04]"
                }`}
              >
                <CheckSquare
                  className={`h-3 w-3 ${target === opt.value ? "text-indigo-300/80" : "text-white/20"}`}
                />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-white/[0.07] bg-white/[0.02] p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/30">
            Channels
          </label>
          <div className="flex flex-wrap gap-3">
            {CHANNEL_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex cursor-pointer items-center gap-2 text-[11px] text-white/60"
              >
                <input
                  type="checkbox"
                  checked={channels[opt.value]}
                  onChange={() => toggleChannel(opt.value)}
                  className="accent-indigo-500"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        <div className="rounded border border-white/[0.07] bg-white/[0.02] p-3">
          <label className="mb-1 block text-[9px] font-bold uppercase tracking-widest text-white/30">
            Preview
          </label>
          <div className="rounded border border-white/[0.06] bg-zinc-900 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-500/25">
                <Megaphone className="h-3 w-3 text-indigo-300/80" />
              </span>
              <span className="text-[10px] font-medium text-white/60">Announcement</span>
            </div>
            <p className="text-[11px] text-white/45 whitespace-pre-wrap">
              {message.trim() || <span className="italic text-white/25">Your message will appear here…</span>}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-[11px] font-medium text-indigo-300/80 transition-colors hover:bg-indigo-500/15 disabled:opacity-40"
          data-testid="announcement-send"
        >
          <Send className="h-3 w-3" />
          {sending ? "Sending…" : "Send Announcement"}
        </button>
      </div>
    </div>
  );
}
