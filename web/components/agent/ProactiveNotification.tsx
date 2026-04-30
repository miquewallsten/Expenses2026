"use client";

import { useState } from "react";
import { X, Lightbulb, AlertTriangle, Megaphone } from "lucide-react";

export interface ProactiveNotificationProps {
  id: string;
  type: "suggestion" | "alert" | "announcement";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: (id: string) => void;
}

const TYPE_STYLES = {
  suggestion: {
    icon: Lightbulb,
    bar: "bg-indigo-500/40",
    border: "border-indigo-500/20",
    bg: "bg-indigo-500/[0.06]",
    text: "text-indigo-300/80",
  },
  alert: {
    icon: AlertTriangle,
    bar: "bg-amber-500/40",
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.06]",
    text: "text-amber-300/80",
  },
  announcement: {
    icon: Megaphone,
    bar: "bg-emerald-500/40",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.06]",
    text: "text-emerald-300/80",
  },
};

export default function ProactiveNotification({
  id,
  type,
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
}: ProactiveNotificationProps) {
  const [dismissed, setDismissed] = useState(false);
  const styles = TYPE_STYLES[type];
  const Icon = styles.icon;

  if (dismissed) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-md border ${styles.border} ${styles.bg}`}
      role="alert"
      data-testid={`notification-${id}`}
    >
      <div className={`absolute left-0 top-0 h-full w-[3px] ${styles.bar}`} />
      <div className="flex items-start gap-2 px-3 py-2.5">
        <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${styles.text}`} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold leading-snug text-white/70">{title}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/45">{message}</p>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className={`mt-1.5 inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${styles.bg} ${styles.text} hover:bg-white/[0.06]`}
            >
              {actionLabel}
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              onDismiss(id);
            }}
            className="shrink-0 text-white/25 transition-colors hover:text-white/55"
            aria-label="Dismiss notification"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
