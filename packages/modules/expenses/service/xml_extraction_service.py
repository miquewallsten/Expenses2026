"""
Robust CFDI XML extractor.

Handles any namespace prefix (cfdi:, tfd:, or none) by matching on the
local part of the tag name only.  Uses stdlib xml.etree.ElementTree exclusively.
"""
import xml.etree.ElementTree as ET
from typing import Optional

# ── Namespace-agnostic helpers ────────────────────────────────────────────────

def local_name(tag: str) -> str:
    """Return the local name of a Clark-notation tag, e.g. '{ns}Foo' → 'Foo'."""
    return tag.split("}")[-1] if "}" in tag else tag


def find_first_by_local_name(
    node: Optional[ET.Element], name: str
) -> Optional[ET.Element]:
    """Return the first direct child whose local tag name matches *name*."""
    if node is None:
        return None
    for child in node:
        if local_name(child.tag) == name:
            return child
    return None


def find_all_by_local_name(
    node: Optional[ET.Element], name: str
) -> list[ET.Element]:
    """Return all direct children whose local tag name matches *name*."""
    if node is None:
        return []
    return [child for child in node if local_name(child.tag) == name]


# ── Private helpers ───────────────────────────────────────────────────────────

def _find_recursive(
    parent: Optional[ET.Element], name: str
) -> Optional[ET.Element]:
    """Return the first element at any depth whose local tag name matches *name*."""
    if parent is None:
        return None
    for el in parent.iter():
        if local_name(el.tag) == name:
            return el
    return None


def _attr(el: Optional[ET.Element], attr: str) -> Optional[str]:
    """Return attribute *attr* from *el*, or None if el is None / attr absent."""
    return el.get(attr) if el is not None else None


def _attr_ci(el: Optional[ET.Element], attr: str) -> Optional[str]:
    """Case-insensitive attribute lookup (last-resort for non-standard emitters)."""
    if el is None:
        return None
    lower = attr.lower()
    for k, v in el.attrib.items():
        if k.lower() == lower:
            return v
    return None


# ── Sentinel returned on any parse failure ───────────────────────────────────

def _empty() -> dict:
    return {
        "is_xml":                       False,
        "uuid":                         None,
        "total":                        None,
        "subtotal":                     None,
        "moneda":                       None,
        "tipo_comprobante":             None,
        "metodo_pago":                  None,
        "forma_pago":                   None,
        "fecha":                        None,
        "serie":                        None,
        "folio":                        None,
        "lugar_expedicion":             None,
        "no_certificado":               None,
        "exportacion":                  None,
        "emisor_rfc":                   None,
        "emisor_nombre":                None,
        "emisor_regimen_fiscal":        None,
        "receptor_rfc":                 None,
        "receptor_nombre":              None,
        "receptor_domicilio_fiscal":    None,
        "receptor_regimen_fiscal":      None,
        "uso_cfdi":                     None,
        "descripcion":                  None,
        "conceptos":                    [],
        "conceptos_count":              0,
        "conceptos_summary":            None,
        "objeto_imp":                   None,
        "impuesto":                     None,
        "tasa_o_cuota":                 None,
        "tipo_factor":                  None,
        "retencion_impuesto":           None,
        "retencion_importe":            None,
        "total_impuestos_trasladados":  None,
        "total_impuestos_retenidos":    None,
        # Comprobante extended
        "version":                      None,
        "condiciones_pago":             None,
        "descuento":                    None,
        "tipo_cambio":                  None,
        # TimbreFiscalDigital
        "fecha_timbrado":               None,
        "no_certificado_sat":           None,
        "rfc_prov_certif":              None,
        "version_timbre":               None,
    }


# ── Public API ────────────────────────────────────────────────────────────────

_XML_EXTRACTED_MARKER = "[XML_EXTRACTED]"


def extract_xml_fields(content_text: str) -> dict:
    """
    Parse a CFDI XML string and return a flat dict of extracted fields.

    Returns _empty() (is_xml=False, all fields None/empty) on any parse error
    or if no Comprobante node is found.
    """
    if not content_text or not content_text.strip():
        return _empty()

    # Strip any appended [XML_EXTRACTED] block so ET.fromstring only sees raw XML.
    _marker_idx = content_text.find(_XML_EXTRACTED_MARKER)
    if _marker_idx != -1:
        content_text = content_text[:_marker_idx].rstrip()

    try:
        root = ET.fromstring(content_text)
    except ET.ParseError:
        return _empty()

    # ── Locate Comprobante ───────────────────────────────────────────────────
    if local_name(root.tag) == "Comprobante":
        comprobante = root
    else:
        comprobante = find_first_by_local_name(root, "Comprobante")
        if comprobante is None:
            comprobante = _find_recursive(root, "Comprobante")
        if comprobante is None:
            return _empty()

    # ── Emisor / Receptor ────────────────────────────────────────────────────
    emisor   = find_first_by_local_name(comprobante, "Emisor")
    receptor = find_first_by_local_name(comprobante, "Receptor")

    # ── Conceptos ────────────────────────────────────────────────────────────
    conceptos_node   = find_first_by_local_name(comprobante, "Conceptos")
    concepto_els     = find_all_by_local_name(conceptos_node, "Concepto")
    primer_concepto  = concepto_els[0] if concepto_els else None

    conceptos: list[dict] = []
    for c in concepto_els:
        conceptos.append({
            "clave_prod_serv": _attr(c, "ClaveProdServ"),
            "cantidad":        _attr(c, "Cantidad"),
            "clave_unidad":    _attr(c, "ClaveUnidad"),
            "unidad":          _attr(c, "Unidad"),
            "descripcion":     _attr(c, "Descripcion"),
            "valor_unitario":  _attr(c, "ValorUnitario"),
            "importe":         _attr(c, "Importe"),
            "objeto_imp":      _attr(c, "ObjetoImp"),
        })

    conceptos_count = len(conceptos)
    descriptions    = [c["descripcion"] for c in conceptos if c["descripcion"]]
    conceptos_summary = " / ".join(descriptions[:3]) if descriptions else None
    descripcion       = descriptions[0] if descriptions else None

    # ── Concepto-level taxes (from first Concepto) ────────────────────────────
    concepto_impuestos = find_first_by_local_name(primer_concepto, "Impuestos")
    traslados_node     = find_first_by_local_name(concepto_impuestos, "Traslados")
    primer_traslado    = find_first_by_local_name(traslados_node, "Traslado")
    retenciones_node   = find_first_by_local_name(concepto_impuestos, "Retenciones")
    primer_retencion   = find_first_by_local_name(retenciones_node, "Retencion")

    # ── Comprobante-level tax summary ─────────────────────────────────────────
    impuestos_node = find_first_by_local_name(comprobante, "Impuestos")

    total_tras = _attr(impuestos_node, "TotalImpuestosTrasladados")
    if total_tras is None:
        total_tras = _attr(primer_traslado, "Importe")

    total_ret = _attr(impuestos_node, "TotalImpuestosRetenidos")
    if total_ret is None:
        total_ret = _attr(primer_retencion, "Importe")

    # ── UUID from TimbreFiscalDigital ─────────────────────────────────────────
    complemento = find_first_by_local_name(comprobante, "Complemento")
    timbre      = find_first_by_local_name(complemento, "TimbreFiscalDigital")
    if timbre is None:
        timbre = _find_recursive(comprobante, "TimbreFiscalDigital")

    # UUID attribute may be non-standard case on some emitters — try exact then CI
    uuid = _attr(timbre, "UUID") or _attr_ci(timbre, "uuid")

    return {
        "is_xml":                       True,
        "uuid":                         uuid,
        "total":                        _attr(comprobante,  "Total"),
        "subtotal":                     _attr(comprobante,  "SubTotal"),
        "moneda":                       _attr(comprobante,  "Moneda"),
        "tipo_comprobante":             _attr(comprobante,  "TipoDeComprobante"),
        "metodo_pago":                  _attr(comprobante,  "MetodoPago"),
        "forma_pago":                   _attr(comprobante,  "FormaPago"),
        "fecha":                        _attr(comprobante,  "Fecha"),
        "serie":                        _attr(comprobante,  "Serie"),
        "folio":                        _attr(comprobante,  "Folio"),
        "lugar_expedicion":             _attr(comprobante,  "LugarExpedicion"),
        "no_certificado":               _attr(comprobante,  "NoCertificado"),
        "exportacion":                  _attr(comprobante,  "Exportacion"),
        "emisor_rfc":                   _attr(emisor,       "Rfc"),
        "emisor_nombre":                _attr(emisor,       "Nombre"),
        "emisor_regimen_fiscal":        _attr(emisor,       "RegimenFiscal"),
        "receptor_rfc":                 _attr(receptor,     "Rfc"),
        "receptor_nombre":              _attr(receptor,     "Nombre"),
        "receptor_domicilio_fiscal":    _attr(receptor,     "DomicilioFiscalReceptor"),
        "receptor_regimen_fiscal":      _attr(receptor,     "RegimenFiscalReceptor"),
        "uso_cfdi":                     _attr(receptor,     "UsoCFDI"),
        "descripcion":                  descripcion,
        "conceptos":                    conceptos,
        "conceptos_count":              conceptos_count,
        "conceptos_summary":            conceptos_summary,
        "objeto_imp":                   _attr(primer_concepto, "ObjetoImp"),
        "impuesto":                     _attr(primer_traslado, "Impuesto"),
        "tasa_o_cuota":                 _attr(primer_traslado, "TasaOCuota"),
        "tipo_factor":                  _attr(primer_traslado, "TipoFactor"),
        "retencion_impuesto":           _attr(primer_retencion, "Impuesto"),
        "retencion_importe":            _attr(primer_retencion, "Importe"),
        "total_impuestos_trasladados":  total_tras,
        "total_impuestos_retenidos":    total_ret,
        # Comprobante extended
        "version":                      _attr(comprobante, "Version"),
        "condiciones_pago":             _attr(comprobante, "CondicionesDePago"),
        "descuento":                    _attr(comprobante, "Descuento"),
        "tipo_cambio":                  _attr(comprobante, "TipoCambio"),
        # TimbreFiscalDigital
        "fecha_timbrado":               _attr(timbre, "FechaTimbrado"),
        "no_certificado_sat":           _attr(timbre, "NoCertificadoSAT"),
        "rfc_prov_certif":              _attr(timbre, "RfcProvCertif"),
        "version_timbre":               _attr(timbre, "Version"),
    }

