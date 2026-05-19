"use client";

import { useTranslations } from "next-intl";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import type { PolizaResult } from "./types";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 px-1 text-[9px] font-bold uppercase tracking-widest text-muted">
      {children}
    </p>
  );
}

export function EmptyHint({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-default bg-surface-0 px-3 py-6 text-center">
      <p className="text-[10px] text-tertiary">{message}</p>
    </div>
  );
}

export function BindingRow({
  label, hint, value, options, onChange,
}: {
  label: string;
  hint?: string;
  value: number | null;
  options: { value: number; label: string }[];
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium text-secondary">{label}</p>
        {hint && <p className="text-[10px] text-muted">{hint}</p>}
      </div>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="shrink-0 rounded border border-default bg-surface-1 px-2 py-1 text-[10px] text-secondary outline-none focus:bg-accent-muted max-w-[260px]"
      >
        <option value=""> - </option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function PolizaPreview({ poliza }: { poliza: PolizaResult | null }) {
  const t = useTranslations("admin.coa");
  if (!poliza) {
    return <EmptyHint message={t("preview.empty")} />;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-default bg-surface-1">
      <table className="w-full text-[10.5px]">
        <thead className="bg-surface-1 text-[9px] uppercase tracking-widest text-muted">
          <tr>
            <th className="px-2 py-1 text-left">{t("preview.account")}</th>
            <th className="px-2 py-1 text-right">{t("preview.debit")}</th>
            <th className="px-2 py-1 text-right">{t("preview.credit")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {poliza.lines.map((ln, i) => (
            <tr key={i} className={ln.account_code === "?" ? "bg-amber-950/15" : ""}>
              <td className="px-2 py-1">
                <p className="font-mono tabular-nums text-secondary">{ln.account_code}</p>
                <p className="text-[9.5px] text-muted">{ln.account_name} · {ln.note}</p>
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-emerald-300/85">
                {ln.debit !== "0.00" ? ln.debit : <span className="text-muted"> - </span>}
              </td>
              <td className="px-2 py-1 text-right tabular-nums text-rose-300/85">
                {ln.credit !== "0.00" ? ln.credit : <span className="text-muted"> - </span>}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-default bg-surface-1 text-[10px] font-semibold">
          <tr>
            <td className="px-2 py-1 text-tertiary">
              {poliza.balanced
                ? <span className="inline-flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Balanceado</span>
                : <span className="inline-flex items-center gap-1 text-rose-300"><AlertTriangle className="h-3 w-3" /> Descuadrado</span>}
            </td>
            <td className="px-2 py-1 text-right tabular-nums text-emerald-300/85">{poliza.total_debit}</td>
            <td className="px-2 py-1 text-right tabular-nums text-rose-300/85">{poliza.total_credit}</td>
          </tr>
        </tfoot>
      </table>
      {poliza.warnings.length > 0 && (
        <div className="border-t border-default bg-amber-950/10 px-2 py-1.5">
          {poliza.warnings.map((w, i) => (
            <p key={i} className="text-[10px] text-warning/80">• {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
