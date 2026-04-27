"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { X, CheckCircle2, AlertTriangle, XCircle, FileText } from "lucide-react";
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
  full?: boolean; // col-span-2
}

interface SectionDef {
  i18nKey: string;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    i18nKey: "sectionComprobante",
    fields: [
      { i18nKey: "fieldVersion",          key: "version" },
      { i18nKey: "fieldFecha",            key: "fecha" },
      { i18nKey: "fieldTipo",             key: "tipo_comprobante" },
      { i18nKey: "fieldMoneda",           key: "moneda" },
      { i18nKey: "fieldTipoCambio",       key: "tipo_cambio",       mono: true },
      { i18nKey: "fieldFormaPago",        key: "forma_pago" },
      { i18nKey: "fieldMetodoPago",       key: "metodo_pago" },
      { i18nKey: "fieldCondicionesPago",  key: "condiciones_pago",  full: true },
      { i18nKey: "fieldSerie",            key: "serie" },
      { i18nKey: "fieldFolio",            key: "folio" },
      { i18nKey: "fieldLugarExp",         key: "lugar_expedicion" },
      { i18nKey: "fieldExportacion",      key: "exportacion" },
      { i18nKey: "fieldDescuento",        key: "descuento",         mono: true },
    ],
  },
  {
    i18nKey: "sectionEmisor",
    fields: [
      { i18nKey: "fieldNombre",  key: "emisor_nombre",         full: true },
      { i18nKey: "fieldRfc",     key: "emisor_rfc",            mono: true },
      { i18nKey: "fieldRegimen", key: "emisor_regimen_fiscal" },
    ],
  },
  {
    i18nKey: "sectionReceptor",
    fields: [
      { i18nKey: "fieldNombre",     key: "receptor_nombre",            full: true },
      { i18nKey: "fieldRfc",        key: "receptor_rfc",               mono: true },
      { i18nKey: "fieldDomFiscal",  key: "receptor_domicilio_fiscal",  mono: true },
      { i18nKey: "fieldRegimen",    key: "receptor_regimen_fiscal" },
      { i18nKey: "fieldUsoCfdi",    key: "uso_cfdi" },
    ],
  },
  {
    i18nKey: "sectionImportes",
    fields: [
      { i18nKey: "fieldSubtotal",            key: "subtotal",                    mono: true },
      { i18nKey: "fieldDescuento",           key: "descuento",                   mono: true },
      { i18nKey: "fieldTotal",               key: "total",                       mono: true },
      { i18nKey: "fieldIvaTrasladado",       key: "total_impuestos_trasladados", mono: true },
      { i18nKey: "fieldIvaRetenido",         key: "total_impuestos_retenidos",   mono: true },
      { i18nKey: "fieldImpuesto",            key: "impuesto" },
      { i18nKey: "fieldTipoFactor",          key: "tipo_factor" },
      { i18nKey: "fieldTasaCuota",           key: "tasa_o_cuota",                mono: true },
      { i18nKey: "fieldRetencionImpuesto",   key: "retencion_impuesto" },
      { i18nKey: "fieldRetencionImporte",    key: "retencion_importe",           mono: true },
    ],
  },
  {
    i18nKey: "sectionTimbre",
    fields: [
      { i18nKey: "fieldUuid",           key: "uuid",               mono: true, full: true },
      { i18nKey: "fieldFechaTimbrado",  key: "fecha_timbrado" },
      { i18nKey: "fieldVersionTimbre",  key: "version_timbre" },
      { i18nKey: "fieldRfcPac",         key: "rfc_prov_certif",    mono: true },
      { i18nKey: "fieldNoCertSat",      key: "no_certificado_sat", mono: true },
      { i18nKey: "fieldNoCertificado",  key: "no_certificado",     mono: true },
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
  if (!v) return "—";
  const n = parseFloat(v.replace(/,/g, ""));
  if (isNaN(n)) return v;
  return n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

  const uuid = val(extractedData, "uuid");
  const rawConceptos: ConceptoItem[] = Array.isArray(extractedData?.conceptos)
    ? extractedData!.conceptos as ConceptoItem[]
    : [];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cfdi-title"
      >
        <div
          className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-white/[0.09] bg-zinc-900 shadow-[0_32px_80px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-white/[0.04]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-2.5">
            <div className="min-w-0">
              <h2 id="cfdi-title" className="text-[11px] font-bold uppercase tracking-widest text-white/70">
                {t("title")}
              </h2>
              {uuid ? (
                <p className="mt-0.5 truncate font-mono text-[9px] text-white/25">{uuid}</p>
              ) : (
                <p className="mt-0.5 text-[9px] text-white/18">{t("noUuid")}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded p-1 text-white/30 transition-colors hover:bg-white/[0.07] hover:text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Body */}
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {!extractedData ? (
              /* ── Empty state ── */
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
                <FileText className="h-6 w-6 text-white/15" />
                <p className="text-[11px] text-white/25">{t("noData")}</p>
              </div>
            ) : (
              <div className="space-y-3">

                {/* Data sections — 2-col tile grid */}
                {SECTIONS.map((section) => {
                  const hasAny = section.fields.some(({ key }) => val(extractedData, key) !== null);
                  if (!hasAny) return null;
                  return (
                    <div key={section.i18nKey}>
                      <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/22">
                        {t(section.i18nKey)}
                      </p>
                      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.04]">
                        {section.fields.map(({ i18nKey: fieldKey, key, mono, full }) => {
                          const v = val(extractedData, key);
                          if (!v) return null;
                          return (
                            <div
                              key={key}
                              className={`bg-zinc-900/90 px-2.5 py-1.5 ${full ? "col-span-2" : ""}`}
                            >
                              <p className="text-[8px] font-semibold uppercase tracking-wider text-white/25">{t(fieldKey)}</p>
                              <p className={`mt-0.5 break-all text-[10px] text-white/60 ${mono ? "font-mono" : ""}`}>
                                {v}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Conceptos */}
                {rawConceptos.length > 0 && (
                <div>
                  <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/22">
                    {t("conceptos", { count: rawConceptos.length })}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-white/[0.07] bg-black/20">
                    {rawConceptos.map((c, ci) => (
                        <div
                          key={ci}
                          className={`px-2.5 py-2 ${
                            ci < rawConceptos.length - 1 ? "border-b border-white/[0.04]" : ""
                          }`}
                        >
                          {/* description */}
                          <p className="text-[10px] text-white/60">{c.descripcion || "—"}</p>
                          {/* metadata row */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {c.clave_prod_serv && (
                              <span className="font-mono text-[8px] text-white/28">
                                SAT:{c.clave_prod_serv}
                              </span>
                            )}
                            {(c.clave_unidad || c.unidad) && (
                              <span className="text-[8px] text-white/28">
                                {c.unidad ? `${c.unidad}${c.clave_unidad ? ` (${c.clave_unidad})` : ""}` : c.clave_unidad}
                              </span>
                            )}
                            {c.cantidad && (
                              <span className="text-[8px] text-white/28">
                                ×{c.cantidad}
                              </span>
                            )}
                            {c.valor_unitario && (
                              <span className="font-mono text-[8px] text-white/28">
                                @${fmtAmount(c.valor_unitario)}
                              </span>
                            )}
                            {c.objeto_imp && (
                              <span className="font-mono text-[8px] text-white/20">
                                ObjImp:{c.objeto_imp}
                              </span>
                            )}
                            {c.importe && (
                              <span className="ml-auto font-mono text-[9px] text-white/45">
                                ${fmtAmount(c.importe)}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                )}

                {/* SAT */}
                <div>
                  <p className="mb-1 text-[8px] font-bold uppercase tracking-widest text-white/22">{t("satLabel")}</p>
                  <div className="flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5">
                    {satStatus === "valid" ? (
                      <>
                        <p className="text-[9px] text-white/35">{t("satPassed")}</p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-emerald-500/20 bg-emerald-500/[0.07] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-emerald-400/70">
                          <CheckCircle2 className="h-2 w-2" /> {t("badgeVigente")}
                        </span>
                      </>
                    ) : satStatus === "warning" ? (
                      <>
                        <p className="text-[9px] text-white/35">{t("satWarning")}</p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-500/20 bg-amber-500/[0.07] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-amber-400/70">
                          <AlertTriangle className="h-2 w-2" /> {t("badgeWarnings")}
                        </span>
                      </>
                    ) : satStatus === "error" ? (
                      <>
                        <p className="text-[9px] text-white/35">{t("satFailed")}</p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-red-500/20 bg-red-500/[0.07] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-red-400/70">
                          <XCircle className="h-2 w-2" /> {t("badgeNoVigente")}
                        </span>
                      </>
                    ) : (
                      <>
                        <p className="text-[9px] text-white/22">
                          {t("satPending")}
                        </p>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/25">
                          {t("badgePending")}
                        </span>
                      </>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex shrink-0 justify-end border-t border-white/[0.07] px-4 py-2">
            <button
              onClick={onClose}
              className="rounded px-3 py-1 text-[10px] font-medium text-white/30 transition-colors hover:bg-white/[0.05] hover:text-white/50"
            >
              {tc("close")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
