from sqlalchemy.orm import Session
import json

from packages.modules.expenses.models.document import ExpenseDocument
from packages.modules.expenses.models.validation_result import ValidationResult
from packages.modules.expenses.service.validation_engine import run_validation_pipeline
from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields

_XML_MARKER = "[XML_EXTRACTED]"


def _build_xml_block(extracted: dict) -> str:
    """Return the full [XML_EXTRACTED] block string (marker included)."""
    return (
        f"{_XML_MARKER}\n"
        f"uuid: {extracted['uuid']}\n"
        f"total: {extracted['total']}\n"
        f"subtotal: {extracted['subtotal']}\n"
        f"moneda: {extracted['moneda']}\n"
        f"tipo_comprobante: {extracted['tipo_comprobante']}\n"
        f"metodo_pago: {extracted['metodo_pago']}\n"
        f"forma_pago: {extracted['forma_pago']}\n"
        f"fecha: {extracted['fecha']}\n"
        f"serie: {extracted.get('serie')}\n"
        f"folio: {extracted.get('folio')}\n"
        f"lugar_expedicion: {extracted.get('lugar_expedicion')}\n"
        f"version: {extracted.get('version')}\n"
        f"condiciones_pago: {extracted.get('condiciones_pago')}\n"
        f"descuento: {extracted.get('descuento')}\n"
        f"tipo_cambio: {extracted.get('tipo_cambio')}\n"
        f"exportacion: {extracted.get('exportacion')}\n"
        f"emisor_rfc: {extracted['emisor_rfc']}\n"
        f"emisor_nombre: {extracted['emisor_nombre']}\n"
        f"emisor_regimen_fiscal: {extracted.get('emisor_regimen_fiscal')}\n"
        f"receptor_rfc: {extracted['receptor_rfc']}\n"
        f"receptor_nombre: {extracted['receptor_nombre']}\n"
        f"receptor_domicilio_fiscal: {extracted.get('receptor_domicilio_fiscal')}\n"
        f"receptor_regimen_fiscal: {extracted.get('receptor_regimen_fiscal')}\n"
        f"uso_cfdi: {extracted['uso_cfdi']}\n"
        f"descripcion: {extracted['descripcion']}\n"
        f"conceptos_count: {extracted['conceptos_count']}\n"
        f"conceptos_summary: {extracted['conceptos_summary']}\n"
        f"conceptos_json: {json.dumps(extracted.get('conceptos', []), ensure_ascii=False)}\n"
        f"impuesto: {extracted.get('impuesto')}\n"
        f"tasa_o_cuota: {extracted.get('tasa_o_cuota')}\n"
        f"tipo_factor: {extracted.get('tipo_factor')}\n"
        f"retencion_impuesto: {extracted.get('retencion_impuesto')}\n"
        f"retencion_importe: {extracted.get('retencion_importe')}\n"
        f"total_impuestos_trasladados: {extracted['total_impuestos_trasladados']}\n"
        f"total_impuestos_retenidos: {extracted['total_impuestos_retenidos']}\n"
        f"fecha_timbrado: {extracted.get('fecha_timbrado')}\n"
        f"no_certificado_sat: {extracted.get('no_certificado_sat')}\n"
        f"rfc_prov_certif: {extracted.get('rfc_prov_certif')}\n"
        f"version_timbre: {extracted.get('version_timbre')}\n"
        f"no_certificado: {extracted.get('no_certificado')}"
    )


def _upsert_xml_block(content_text: str, extracted: dict) -> str:
    """
    Insert or replace the [XML_EXTRACTED] block in content_text.

    If the marker already exists, everything from the marker to the end is
    replaced so we never accumulate duplicate blocks across repeated
    validate_document calls.
    """
    new_block = _build_xml_block(extracted)
    idx = content_text.find(_XML_MARKER)
    if idx != -1:
        # Replace from the marker onwards (strip any trailing whitespace first)
        return content_text[:idx].rstrip() + "\n\n" + new_block
    return content_text.rstrip() + "\n\n" + new_block


def validate_document(
    db: Session,
    document_id: int,
    extracted: dict | None = None,
) -> list[ValidationResult] | None:
    # ── 1. Load document ───────────────────────────────────────────────────────
    document = db.query(ExpenseDocument).filter(ExpenseDocument.id == document_id).first()
    if not document:
        return None

    # ── 2. Extract XML fields and upsert extracted block ─────────────────────
    # Use pre-computed dict if provided (avoids a second parse when
    # create_document already called extract_xml_fields for enrichment).
    if extracted is None:
        extracted = extract_xml_fields(document.content_text or "")

    is_xml_declared = document.document_type == "cfdi_xml"
    is_xml_parsed   = bool(extracted.get("is_xml"))

    if is_xml_parsed:
        document.content_text = _upsert_xml_block(document.content_text or "", extracted)

    # ── 3. Run validation pipeline ─────────────────────────────────────────────
    results = run_validation_pipeline(db, document, extracted)

    # ── 4. Persist ValidationResult objects ────────────────────────────────────
    for result in results:
        db.add(result)

    # ── 5. Compute document.validation_status ──────────────────────────────────
    statuses = {r.status for r in results}
    if "failed" in statuses:
        document.validation_status = "failed"
    elif "warning" in statuses:
        document.validation_status = "warning"
    else:
        document.validation_status = "passed"

    # ── 6. Build validation_summary ────────────────────────────────────────────
    _status_label = {"passed": "Ready", "warning": "Review", "failed": "Blocked"}
    _state = _status_label.get(document.validation_status, document.validation_status.title())
    _d = lambda v: (str(v).strip() if v else "-")

    if is_xml_parsed:
        document.validation_summary = " | ".join([
            "XML",
            f"UUID {_d(extracted.get('uuid'))}",
            f"Total {_d(extracted.get('total'))}",
            f"RFC receptor {_d(extracted.get('receptor_rfc'))}",
            _state,
        ])
    elif is_xml_declared:
        # Declared as CFDI XML but parsing failed — report as XML parse failure
        document.validation_summary = f"XML | Parse failed | {_state}"
    else:
        doc_label = "PDF" if (document.document_type or "").endswith("pdf") else "Ticket"
        document.validation_summary = f"{doc_label} | {document.validation_status}"

    # ── 7. Commit and refresh ──────────────────────────────────────────────────
    db.commit()

    for result in results:
        db.refresh(result)

    # ── 8. Return results ──────────────────────────────────────────────────────
    return results

