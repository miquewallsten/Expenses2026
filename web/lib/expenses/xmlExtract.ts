/**
 * Shared XML extraction utilities used by both MyExpensesModule (canonical
 * draft-state owner) and EmployeeExpenseDetail (render layer).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExpenseDocument {
  id: number;
  filename: string;
  document_type?: string | null;
  validation_status: string;
  created_at: string;
  extracted_fields?: {
    rfc?: string | null;
    total?: string | null;
    subtotal?: string | null;
    tax?: string | null;
    date?: string | null;
    merchant?: string | null;
    payment_method?: string | null;
    classifier?: {
      label?: string | null;
      confidence?: number | null;
      method?: string | null;
    } | null;
  } | null;
}

export interface ExtractedData {
  uuid?:                          string | null;
  total?:                         string | null;
  subtotal?:                      string | null;
  moneda?:                        string | null;
  tipo_comprobante?:              string | null;
  metodo_pago?:                   string | null;
  forma_pago?:                    string | null;
  fecha?:                         string | null;
  serie?:                         string | null;
  folio?:                         string | null;
  lugar_expedicion?:              string | null;
  version?:                       string | null;
  condiciones_pago?:              string | null;
  descuento?:                     string | null;
  tipo_cambio?:                   string | null;
  exportacion?:                   string | null;
  emisor_rfc?:                    string | null;
  emisor_nombre?:                 string | null;
  emisor_regimen_fiscal?:         string | null;
  receptor_rfc?:                  string | null;
  receptor_nombre?:               string | null;
  receptor_domicilio_fiscal?:     string | null;
  receptor_regimen_fiscal?:       string | null;
  uso_cfdi?:                      string | null;
  descripcion?:                   string | null;
  conceptos_count?:               string | null;
  conceptos_summary?:             string | null;
  conceptos?:                     ConceptoItem[] | null;
  impuesto?:                      string | null;
  tasa_o_cuota?:                  string | null;
  tipo_factor?:                   string | null;
  retencion_impuesto?:            string | null;
  retencion_importe?:             string | null;
  total_impuestos_trasladados?:   string | null;
  total_impuestos_retenidos?:     string | null;
  fecha_timbrado?:                string | null;
  no_certificado_sat?:            string | null;
  rfc_prov_certif?:               string | null;
  version_timbre?:                string | null;
  no_certificado?:                string | null;
}

export interface ConceptoItem {
  clave_prod_serv?: string | null;
  cantidad?:        string | null;
  clave_unidad?:    string | null;
  unidad?:          string | null;
  descripcion?:     string | null;
  valor_unitario?:  string | null;
  importe?:         string | null;
  objeto_imp?:      string | null;
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse the [XML_EXTRACTED] block appended by the backend validation service
 * from a document's content_text field.  Returns undefined when no block is
 * present (e.g. PDF or ticket documents).
 */
export function parseXmlExtracted(contentText: string): ExtractedData | undefined {
  const block = contentText.match(/\[XML_EXTRACTED\]([\s\S]*?)(?:\[|$)/);
  if (!block) return undefined;
  const lines = block[1].trim().split("\n");
  const get = (key: string): string | null => {
    const line = lines.find((l) => l.startsWith(`${key}:`));
    if (!line) return null;
    const val = line.slice(key.length + 1).trim();
    return val === "None" || val === "" ? null : val;
  };
  // conceptos_json is a JSON array on one line
  let conceptos: ConceptoItem[] | null = null;
  const cjLine = lines.find((l) => l.startsWith("conceptos_json:"));
  if (cjLine) {
    try {
      const raw = cjLine.slice("conceptos_json:".length).trim();
      const parsed = JSON.parse(raw);
      conceptos = Array.isArray(parsed) ? parsed : null;
    } catch { conceptos = null; }
  }
  return {
    uuid:                        get("uuid"),
    total:                       get("total"),
    subtotal:                    get("subtotal"),
    moneda:                      get("moneda"),
    tipo_comprobante:            get("tipo_comprobante"),
    metodo_pago:                 get("metodo_pago"),
    forma_pago:                  get("forma_pago"),
    fecha:                       get("fecha"),
    serie:                       get("serie"),
    folio:                       get("folio"),
    lugar_expedicion:            get("lugar_expedicion"),
    version:                     get("version"),
    condiciones_pago:            get("condiciones_pago"),
    descuento:                   get("descuento"),
    tipo_cambio:                 get("tipo_cambio"),
    exportacion:                 get("exportacion"),
    emisor_rfc:                  get("emisor_rfc"),
    emisor_nombre:               get("emisor_nombre"),
    emisor_regimen_fiscal:       get("emisor_regimen_fiscal"),
    receptor_rfc:                get("receptor_rfc"),
    receptor_nombre:             get("receptor_nombre"),
    receptor_domicilio_fiscal:   get("receptor_domicilio_fiscal"),
    receptor_regimen_fiscal:     get("receptor_regimen_fiscal"),
    uso_cfdi:                    get("uso_cfdi"),
    descripcion:                 get("descripcion"),
    conceptos_count:             get("conceptos_count"),
    conceptos_summary:           get("conceptos_summary"),
    conceptos,
    impuesto:                    get("impuesto"),
    tasa_o_cuota:                get("tasa_o_cuota"),
    tipo_factor:                 get("tipo_factor"),
    retencion_impuesto:          get("retencion_impuesto"),
    retencion_importe:           get("retencion_importe"),
    total_impuestos_trasladados: get("total_impuestos_trasladados"),
    total_impuestos_retenidos:   get("total_impuestos_retenidos"),
    fecha_timbrado:              get("fecha_timbrado"),
    no_certificado_sat:          get("no_certificado_sat"),
    rfc_prov_certif:             get("rfc_prov_certif"),
    version_timbre:              get("version_timbre"),
    no_certificado:              get("no_certificado"),
  };
}

// ── Document type helpers ─────────────────────────────────────────────────────

/**
 * Submission-relevant document types shown to employees.
 * Internal/accounting-only types (supporting_document, unknown) are excluded.
 */
export const SUBMISSION_TYPES = new Set([
  "cfdi_xml", "cfdi_pdf", "pdf_unclassified",
  "ticket", "receipt", "receipt_pdf",
  "justification", "proof",
]);
