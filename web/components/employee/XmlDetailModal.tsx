"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ExtractedData, ConceptoItem } from "@/lib/expenses/xmlExtract";

interface Props {
  open: boolean;
  onClose: () => void;
  extractedData?: ExtractedData | null;
  satStatus?: "valid" | "warning" | "error" | null;
}

// ── Section definitions ───────────────────────────────────────────────────────

interface FieldDef {
  i18nKey: string;
  key: string;
  mono?: boolean;
  full?: boolean;
}

interface SectionDef {
  i18nKey: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    i18nKey: "sectionComprobante",
    fields: [
      { i18nKey: "fieldVersion", key: "version" },
      { i18nKey: "fieldFecha", key: "fecha" },
      { i18nKey: "fieldTipo", key: "tipo_comprobante" },
      { i18nKey: "fieldMoneda", key: "moneda" },
      { i18nKey: "fieldTipoCambio", key: "tipo_cambio", mono: true },
      { i18nKey: "fieldFormaPago", key: "forma_pago" },
      { i18nKey: "fieldMetodoPago", key: "metodo_pago" },
      { i18nKey: "fieldCondicionesPago", key: "condiciones_pago", full: true },
      { i18nKey: "fieldSerie", key: "serie" },
      { i18nKey: "fieldFolio", key: "folio" },
      { i18nKey: "fieldLugarExp", key: "lugar_expedicion" },
      { i18nKey: "fieldExportacion", key: "exportacion" },
      { i18nKey: "fieldDescuento", key: "descuento", mono: true },
    ],
  },
  {
    i18nKey: "sectionEmisor",
    fields: [
      { i18nKey: "fieldNombre", key: "emisor_nombre", full: true },
      { i18nKey: "fieldRfc", key: "emisor_rfc", mono: true },
      { i18nKey: "fieldRegimen", key: "emisor_regimen_fiscal" },
    ],
  },
  {
    i18nKey: "sectionReceptor",
    fields: [
      { i18nKey: "fieldNombre", key: "receptor_nombre", full: true },
      { i18nKey: "fieldRfc", key: "receptor_rfc", mono: true },
      { i18nKey: "fieldDomFiscal", key: "receptor_domicilio_fiscal", mono: true },
      { i18nKey: "fieldRegimen", key: "receptor_regimen_fiscal" },
      { i18nKey: "fieldUsoCfdi", key: "uso_cfdi" },
    ],
  },
  {
    i18nKey: "sectionImportes",
    fields: [
      { i18nKey: "fieldSubtotal", key: "subtotal", mono: true },
      { i18nKey: "fieldDescuento", key: "descuento", mono: true },
      { i18nKey: "fieldTotal", key: "total", mono: true },
      { i18nKey: "fieldIvaTrasladado", key: "total_impuestos_trasladados", mono: true },
      { i18nKey: "fieldIvaRetenido", key: "total_impuestos_retenidos", mono: true },
      { i18nKey: "fieldImpuesto", key: "impuesto" },
      { i18nKey: "fieldTipoFactor", key: "tipo_factor" },
      { i18nKey: "fieldTasaCuota", key: "tasa_o_cuota", mono: true },
      { i18nKey: "fieldRetencionImpuesto", key: "retencion_impuesto" },
      { i18nKey: "fieldRetencionImporte", key: "retencion_importe", mono: true },
    ],
  },
  {
    i18nKey: "sectionTimbre",
    fields: [
      { i18nKey: "fieldUuid", key: "uuid", mono: true, full: true },
      { i18nKey: "fieldFechaTimbrado", key: "fecha_timbrado" },
      { i18nKey: "fieldVersionTimbre", key: "version_timbre" },
      { i18nKey: "fieldRfcPac", key: "rfc_prov_certif", mono: true },
      { i18nKey: "fieldNoCertSat", key: "no_certificado_sat", mono: true },
      { i18nKey: "fieldNoCertificado", key: "no_certificado", mono: true },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function val(data: ExtractedData | null | undefined, key: string): string | null {
  if (!data) return null;
  const v = (data as Record<string, unknown>)[key];
  if (v === null || v === undefined || String(v).trim() === "" || String(v) === "None") return null;
  return String(v);
}

function fmtAmount(v: string | null): string {
  if (!v) return " - ";
  const n = parseFloat(v.replace(/,/g, ""));
  if (isNaN(n)) return v;
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── SAT badge ──────────────────────────────────────────────────────────────────

function SatBadge({ status }: { status: "valid" | "warning" | "error" | null }) {
  const t = useTranslations("employee.xmlDetail");
  if (status === "valid") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-2">
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        <div>
          <p className="text-[10px] font-medium text-emerald-400">{t("satPassed")}</p>
        </div>
        <span className="ml-auto rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-400">
          {t("badgeVigente")}
        </span>
      </div>
    );
  }
  if (status === "warning") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2">
        <AlertTriangle className="h-4 w-4 text-amber-400" />
        <div>
          <p className="text-[10px] font-medium text-amber-400">{t("satWarning")}</p>
        </div>
        <span className="ml-auto rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
          {t("badgeWarnings")}
        </span>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-500/15 bg-red-500/[0.06] px-3 py-2">
        <XCircle className="h-4 w-4 text-red-400" />
        <div>
          <p className="text-[10px] font-medium text-red-400">{t("satFailed")}</p>
        </div>
        <span className="ml-auto rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-red-400">
          {t("badgeNoVigente")}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-subtle bg-surface-2 px-3 py-2">
      <div className="h-3 w-3 rounded-full bg-surface-2" />
      <p className="text-[10px] text-muted">{t("satPending")}</p>
      <span className="ml-auto rounded-full border border-subtle bg-surface-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted">
        {t("badgePending")}
      </span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function XmlDetailModal({ open, onClose, extractedData, satStatus }: Props) {
  const t = useTranslations("employee.xmlDetail");
  const tc = useTranslations("common");

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const conceptos: ConceptoItem[] = (extractedData as any)?.conceptos ?? [];
  const hasData = extractedData && (extractedData as any).uuid;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 overlay-backdrop-blur" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col bg-surface-0 shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-default px-4 py-3">
          <h2 className="text-[13px] font-semibold text-primary">{t("title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-surface-2 hover:text-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {!hasData ? (
            <div className="flex flex-col items-center justify-center py-16">
              <p className="text-[11px] text-muted">{t("noData")}</p>
            </div>
          ) : (
            <>
              {/* UUID highlight */}
              {val(extractedData, "uuid") && (
                <div className="rounded-lg border border-default bg-surface-1 px-3 py-2">
                  <p className="text-[9px] font-semibold uppercase tracking-widest text-muted">UUID</p>
                  <p className="mt-0.5 font-mono text-[11px] text-primary break-all">{val(extractedData, "uuid")}</p>
                </div>
              )}

              {/* Sections */}
              {SECTIONS.filter((s) => s.fields.some((f) => val(extractedData, f.key) !== null)).map((section) => (
                <div key={section.i18nKey}>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">
                    {t(section.i18nKey)}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-default">
                    {section.fields.map((field, i) => {
                      const v = val(extractedData, field.key);
                      if (v === null) return null;
                      return (
                        <div key={field.key} className={`flex items-center justify-between gap-3 px-3 py-1.5 ${i > 0 ? "border-t border-subtle" : ""}`}>
                          <span className="text-[10px] text-muted shrink-0">{t(field.i18nKey)}</span>
                          <span className={`text-[11px] text-primary text-right ${field.mono ? "font-mono" : ""} ${field.full ? "col-span-2" : ""}`}>
                            {field.mono && v.match(/^\d/)
                              ? fmtAmount(v)
                              : v}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Conceptos */}
              {conceptos.length > 0 && (
                <div>
                  <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">
                    {t("conceptos", { count: conceptos.length })}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-default">
                    {conceptos.map((c, i) => (
                      <div key={i} className={`px-3 py-2 ${i > 0 ? "border-t border-subtle" : ""}`}>
                        <p className="text-[10px] text-secondary">{c.descripcion || " - "}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          {c.clave_prod_serv && (
                            <span className="font-mono text-[8px] text-muted">SAT:{c.clave_prod_serv}</span>
                          )}
                          {(c.clave_unidad || c.unidad) && (
                            <span className="text-[8px] text-muted">
                              {c.unidad ? `${c.unidad}${c.clave_unidad ? ` (${c.clave_unidad})` : ""}` : c.clave_unidad}
                            </span>
                          )}
                          {c.cantidad && <span className="text-[8px] text-muted">x{c.cantidad}</span>}
                          {c.valor_unitario && (
                            <span className="font-mono text-[8px] text-muted">@${fmtAmount(c.valor_unitario)}</span>
                          )}
                          {c.importe && (
                            <span className="ml-auto font-mono text-[9px] text-tertiary">${fmtAmount(c.importe)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SAT */}
              <div>
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-muted">{t("satLabel")}</p>
                <SatBadge status={satStatus ?? null} />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end border-t border-default px-4 py-2">
          <button
            onClick={onClose}
            className="rounded px-3 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
          >
            {tc("close")}
          </button>
        </div>
      </div>
    </>
  );
}
