"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { AgentReceipt } from "@/lib/agent/client";

interface IngestionRow { [key: string]: unknown }

interface Props {
  receipt: AgentReceipt;
  /** Rows derived from receipt.preview.rows or receipt.args.rows. */
  rows?:   IngestionRow[];
  /** Column order; if omitted, derived from first row keys. */
  columns?: string[];
}

/**
 * Read-only grid for ingestion receipts (accounting catalog, user roster, org
 * entities). The applier ultimately uses `args.rows` — preview is capped at
 * 20 rows for UI readability, with a "+N more" indicator.
 */
export default function IngestionGrid({ receipt, rows, columns }: Props) {
  const t = useTranslations("agent.ingestion");

  const { shown, total, cols } = useMemo(() => {
    // Prefer explicit rows; otherwise peek at preview.rows then args.rows.
    const preview = (receipt.preview ?? {}) as Record<string, unknown>;
    const args    = (receipt.args    ?? {}) as Record<string, unknown>;
    const source: IngestionRow[] =
      rows ??
      (Array.isArray(preview.rows)      ? preview.rows as IngestionRow[] :
       Array.isArray(preview.proposed)  ? preview.proposed as IngestionRow[] :
       Array.isArray(args.rows)         ? args.rows as IngestionRow[] :
       []);

    const tot   = typeof preview.total_proposed === "number" ? preview.total_proposed as number : source.length;
    const shownRows = source.slice(0, 20);
    const inferred  = columns ??
      Array.from(shownRows.reduce<Set<string>>((acc, r) => {
        Object.keys(r).forEach((k) => acc.add(k));
        return acc;
      }, new Set<string>()));

    return { shown: shownRows, total: tot, cols: inferred };
  }, [receipt, rows, columns]);

  if (shown.length === 0) {
    return <p className="text-xs text-muted">{t("empty")}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border border-subtle">
        <table className="min-w-full text-xs">
          <thead className="bg-surface-1/70">
            <tr>
              {cols.map((c) => (
                <th key={c} className="px-2 py-1 text-left font-semibold uppercase tracking-wide text-secondary">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr key={i} className="border-t border-subtle even:bg-surface-0/40">
                {cols.map((c) => (
                  <td key={c} className="px-2 py-1 align-top text-tertiary">
                    {renderCell(row[c])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        {t("rowsSummary", { shown: shown.length, total })}
      </p>
    </div>
  );
}

function renderCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
