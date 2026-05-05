"use client";

/**
 * AnomalyBanner — Phase 5.4 inline anomaly flags for an expense.
 *
 * Fetches POST /expenses/anomalies/check on mount; renders a compact
 * banner listing each flag (alert / warn). Self-contained: drop into
 * any expense detail page.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, Info } from "lucide-react";
import { apiPost } from "@/lib/api/client";

interface AnomalyFlag {
  kind: string;
  severity: string;
  message: string;
  detail: Record<string, unknown>;
}

interface Props {
  expenseId: number;
  amount: number;
  categoryCode: string | null;
  expenseDate: string | null;
}

export default function AnomalyBanner({
  expenseId,
  amount,
  categoryCode,
  expenseDate,
}: Props) {
  const t = useTranslations("expense.anomaly");
  const [flags, setFlags] = useState<AnomalyFlag[]>([]);
  const [hasAlert, setHasAlert] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!expenseId || !amount || amount <= 0) return;
    let cancelled = false;
    apiPost<{ flags: AnomalyFlag[]; has_alert: boolean }>("/expenses/anomalies/check", {
      expense_id: expenseId,
      amount,
      category_code: categoryCode,
      expense_date: expenseDate,
    })
      .then((d) => {
        if (cancelled) return;
        setFlags(d.flags ?? []);
        setHasAlert(Boolean(d.has_alert));
      })
      .catch(() => {
        // non-critical; skip silently
      });
    return () => {
      cancelled = true;
    };
  }, [expenseId, amount, categoryCode, expenseDate]);

  if (dismissed || flags.length === 0) return null;

  const Icon = hasAlert ? AlertTriangle : Info;
  const tone = hasAlert
    ? "border-red-500/25 bg-red-500/[0.07] text-red-200/85"
    : "border-amber-500/25 bg-amber-500/[0.07] text-warning/85";

  return (
    <div className={`rounded-md border px-2.5 py-1.5 text-[10.5px] ${tone}`}>
      <div className="flex items-start gap-1.5">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="font-semibold uppercase tracking-wider">
              {hasAlert ? t("alertTitle") : t("warnTitle")}
            </span>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="text-[9px] text-muted hover:text-secondary"
            >
              {t("dismiss")}
            </button>
          </div>
          <ul className="mt-0.5 space-y-0.5">
            {flags.map((f, i) => (
              <li key={`${f.kind}-${i}`} className="leading-snug">
                <span className="font-mono text-[9px] opacity-60">{f.kind}</span>{" "}
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
