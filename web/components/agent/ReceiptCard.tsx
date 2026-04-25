"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, FileSpreadsheet } from "lucide-react";
import { confirmReceipt, rejectReceipt, type AgentReceipt } from "@/lib/agent/client";
import IngestionGrid from "./IngestionGrid";

interface Props {
  companyId: number;
  receipt:   AgentReceipt;
  onChanged?: (updated: AgentReceipt) => void;
  /** Fires once after a successful confirm — host can refetch affected data. */
  onConfirmed?: (tool: string) => void;
}

const INGESTION_TOOLS = new Set([
  "ingest_accounting_catalog",
  "ingest_user_roster",
  "ingest_org_entities",
]);

/**
 * Single pending-action receipt with confirm/reject controls and a preview
 * (key-value diff or ingestion grid depending on tool family).
 */
export default function ReceiptCard({ companyId, receipt, onChanged, onConfirmed }: Props) {
  const t = useTranslations("agent.receipt");
  const [busy, setBusy] = useState<"" | "confirm" | "reject">("");
  const [err,  setErr]  = useState<string | null>(null);

  const isIngestion = INGESTION_TOOLS.has(receipt.tool_name);
  const pending     = receipt.status === "pending";

  const act = async (kind: "confirm" | "reject") => {
    setBusy(kind);
    setErr(null);
    try {
      const out = kind === "confirm"
        ? await confirmReceipt(companyId, receipt.receipt_id)
        : await rejectReceipt(companyId, receipt.receipt_id);
      onChanged?.(out.receipt);
      if (kind === "confirm" && out.receipt.status === "confirmed") {
        onConfirmed?.(out.receipt.tool_name);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="rounded-md border border-white/10 bg-zinc-950 p-3">
      {/* header */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {isIngestion
              ? <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
              : <AlertTriangle  className="h-4 w-4 text-amber-400" />
            }
            <span className="truncate font-mono text-xs text-zinc-200">{receipt.tool_name}</span>
            <StatusBadge status={receipt.status} />
          </div>
          {typeof receipt.preview?.summary === "string" && (
            <p className="mt-1 line-clamp-3 text-xs text-zinc-400">{receipt.preview.summary as string}</p>
          )}
        </div>
      </div>

      {/* body */}
      {isIngestion ? (
        <IngestionGrid receipt={receipt} />
      ) : (
        <DiffBlock preview={receipt.preview} />
      )}

      {receipt.error && (
        <p className="mt-2 text-xs text-rose-400">{receipt.error}</p>
      )}
      {err && (
        <p className="mt-2 text-xs text-rose-400">{err}</p>
      )}

      {/* actions */}
      {pending && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => act("reject")}
            className="inline-flex items-center gap-1 rounded border border-white/10 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy === "reject" ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            {t("reject")}
          </button>
          <button
            type="button"
            disabled={busy !== ""}
            onClick={() => act("confirm")}
            className="inline-flex items-center gap-1 rounded bg-cyan-500 px-2 py-1 text-xs font-semibold text-zinc-950 hover:bg-cyan-400 disabled:opacity-50"
          >
            {busy === "confirm" ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            {t("confirm")}
          </button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AgentReceipt["status"] }) {
  const t = useTranslations("agent.receipt.status");
  const cls: Record<AgentReceipt["status"], string> = {
    pending:   "bg-amber-500/15 text-amber-300 border-amber-500/30",
    confirmed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    rejected:  "bg-zinc-700/40 text-zinc-400 border-zinc-600/40",
    expired:   "bg-zinc-700/40 text-zinc-400 border-zinc-600/40",
    failed:    "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${cls[status]}`}>
      {t(status)}
    </span>
  );
}

function DiffBlock({ preview }: { preview: Record<string, unknown> }) {
  const t = useTranslations("agent.receipt");
  // Backend emits {before, after}; older code used {from, to}. Support both.
  const diff = preview?.diff as
    | Record<string, { from?: unknown; to?: unknown; before?: unknown; after?: unknown }>
    | undefined;

  if (diff && typeof diff === "object" && Object.keys(diff).length > 0) {
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {Object.entries(diff).map(([k, v]) => {
          const before = v?.before ?? v?.from;
          const after  = v?.after  ?? v?.to;
          const isCreate = before === null || before === undefined || before === "";
          return (
            <div key={k} className="contents">
              <dt className="font-mono text-zinc-500">{k}</dt>
              <dd className="text-zinc-300">
                {isCreate ? (
                  <>
                    <span className="text-zinc-500 italic">{t("empty")}</span>
                    <span className="mx-1 text-zinc-600">→</span>
                    <span className="font-semibold text-emerald-300">{renderVal(after)}</span>
                  </>
                ) : (
                  <>
                    <span className="text-zinc-500 line-through">{renderVal(before)}</span>
                    <span className="mx-1 text-zinc-600">→</span>
                    <span className="font-semibold text-emerald-300">{renderVal(after)}</span>
                  </>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  // Fallback: raw JSON (skip "summary" which is rendered above).
  const cleaned = Object.fromEntries(Object.entries(preview ?? {}).filter(([k]) => k !== "summary"));
  if (Object.keys(cleaned).length === 0) {
    return <p className="text-xs text-zinc-500">{t("noPreview")}</p>;
  }
  return (
    <pre className="max-h-48 overflow-auto rounded bg-black/40 p-2 text-[11px] leading-relaxed text-zinc-300">
      {JSON.stringify(cleaned, null, 2)}
    </pre>
  );
}

function renderVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
