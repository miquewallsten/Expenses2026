"""sat_validation_service.py

Provides two functions for SAT CFDI validation:

1. ``check_cfdi_with_sat()`` — Calls the official SAT CFDI consultation SOAP
   service at consultaqr.facturaelectronica.sat.gob.mx.
   Returns a normalised dict with sat_status, is_valid, checked_at.
   Raises nothing — always returns a result (may have sat_status="unavailable").

2. ``run_sat_validation()`` — Backward-compatible wrapper used by the
   POST /validate-sat route and the validation engine.  Falls back to the
   heuristic service when SAT is unavailable so that validation never blocks
   on a network outage.

SAT CFDI Consultation SOAP endpoint:
  WSDL: https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc?wsdl
  Operation: Consulta(expresionImpresa: string) -> ConsultaResult

  expresionImpresa format (CFDI 4.0):
    ?re=<emisor_rfc>&rr=<receptor_rfc>&tt=<total>&id=<uuid>

  Response statuses the SAT returns:
    "Vigente"            — valid and active
    "Cancelado"          — cancelled
    "No Encontrado"      — UUID not found in SAT database
    "No Reconocido"      — receptor RFC not recognised for this UUID

  Docs: https://www.sat.gob.mx/tramitesyservicios/99380/verifica-la-autenticidad-de-tus-facturas
"""

import logging
import urllib.parse
import urllib.request
from datetime import datetime, timezone

_log = logging.getLogger(__name__)

# ── SAT SOAP endpoint ─────────────────────────────────────────────────────────

_SAT_WSDL_URL = (
    "https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc"
)

_SOAP_TEMPLATE = """\
<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:tns="http://tempuri.org/">
  <soap:Body>
    <tns:Consulta>
      <tns:expresionImpresa>{expression}</tns:expresionImpresa>
    </tns:Consulta>
  </soap:Body>
</soap:Envelope>"""

_SOAP_ACTION = "http://tempuri.org/IConsultaCFDIService/Consulta"
_TIMEOUT_SECONDS = 8


def _build_expression(uuid: str, emisor_rfc: str, receptor_rfc: str, total: str) -> str:
    """Build the expresionImpresa query string expected by the SAT service."""
    params = {
        "re": emisor_rfc.upper().strip(),
        "rr": receptor_rfc.upper().strip(),
        "tt": total.strip(),
        "id": uuid.lower().strip(),
    }
    return "?" + urllib.parse.urlencode(params)


def _parse_soap_status(response_body: str) -> str:
    """Extract the Estado value from the SAT SOAP response XML."""
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(response_body)
        # Namespace-agnostic search: walk all descendants looking for "Estado"
        for elem in root.iter():
            if elem.tag.split("}")[-1] == "Estado":
                return (elem.text or "").strip()
    except ET.ParseError:
        _log.warning("SAT response could not be parsed as XML")
    return ""


def check_cfdi_with_sat(
    uuid: str,
    emisor_rfc: str,
    receptor_rfc: str,
    total: str,
) -> dict:
    """
    Call the SAT CFDI consultation service and return a normalised result dict.

    Returns:
        {
            "sat_status": str,        # "Vigente" | "Cancelado" | "No Encontrado" | "unavailable" | "error"
            "is_valid": bool,
            "checked_at": str,        # ISO 8601 UTC timestamp
            "source": "sat_cfdi",
            "message": str,
        }

    Never raises — network errors and timeouts are caught and returned as
    sat_status="unavailable" so the intake pipeline is never blocked.
    """
    checked_at = datetime.now(timezone.utc).isoformat()

    if not all([uuid, emisor_rfc, receptor_rfc, total]):
        return {
            "sat_status": "error",
            "is_valid": False,
            "checked_at": checked_at,
            "source": "sat_cfdi",
            "message": "Incomplete CFDI fields — uuid, emisor_rfc, receptor_rfc, and total are required.",
        }

    expression = _build_expression(uuid, emisor_rfc, receptor_rfc, total)
    body = _SOAP_TEMPLATE.format(expression=_escape_xml(expression))
    encoded_body = body.encode("utf-8")

    req = urllib.request.Request(
        _SAT_WSDL_URL,
        data=encoded_body,
        headers={
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{_SOAP_ACTION}"',
            "Content-Length": str(len(encoded_body)),
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as resp:
            response_text = resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        _log.warning("SAT HTTP error %s for UUID %s", exc.code, uuid)
        return {
            "sat_status": "unavailable",
            "is_valid": False,
            "checked_at": checked_at,
            "source": "sat_cfdi",
            "message": f"SAT service returned HTTP {exc.code}",
        }
    except Exception as exc:  # network timeout, DNS failure, etc.
        _log.warning("SAT consultation failed for UUID %s: %s", uuid, exc)
        return {
            "sat_status": "unavailable",
            "is_valid": False,
            "checked_at": checked_at,
            "source": "sat_cfdi",
            "message": f"SAT service unavailable: {exc}",
        }

    raw_status = _parse_soap_status(response_text)

    if raw_status == "Vigente":
        sat_status = "Vigente"
        is_valid = True
        message = "SAT confirms CFDI is valid and active (Vigente)."
    elif raw_status == "Cancelado":
        sat_status = "Cancelado"
        is_valid = False
        message = "SAT reports CFDI has been cancelled (Cancelado)."
    elif raw_status in ("No Encontrado", "No Reconocido"):
        sat_status = raw_status
        is_valid = False
        message = f"SAT could not find/recognise this CFDI ({raw_status})."
    elif raw_status:
        sat_status = raw_status
        is_valid = False
        message = f"SAT returned unexpected status: {raw_status!r}"
    else:
        sat_status = "unavailable"
        is_valid = False
        message = "SAT response did not contain a recognisable status."

    return {
        "sat_status": sat_status,
        "is_valid": is_valid,
        "checked_at": checked_at,
        "source": "sat_cfdi",
        "message": message,
    }


def _escape_xml(text: str) -> str:
    """Escape characters that are special in XML attribute values."""
    return (
        text
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def run_sat_validation(content_text: str) -> dict:
    """
    Backward-compatible entry point used by POST /validate-sat and the
    validation engine.

    Extracts UUID / RFC / total from the document's content_text and calls
    the real SAT service.  Falls back to the heuristic check when any
    required CFDI field is missing or the SAT service is unavailable.

    NOTE: The heuristic fallback is clearly labelled "sat_heuristic" in the
    source field so it can never be mistaken for a real SAT result.
    """
    from packages.modules.expenses.service.xml_extraction_service import extract_xml_fields

    extracted = extract_xml_fields(content_text or "")

    uuid         = extracted.get("uuid") or ""
    emisor_rfc   = extracted.get("emisor_rfc") or ""
    receptor_rfc = extracted.get("receptor_rfc") or ""
    total        = str(extracted.get("total") or "")

    if uuid and emisor_rfc and receptor_rfc and total:
        result = check_cfdi_with_sat(uuid, emisor_rfc, receptor_rfc, total)
        if result["sat_status"] not in ("unavailable", "error"):
            return result
        # SAT unavailable — fall through to heuristic but preserve the real attempt
        heuristic = _heuristic_check(content_text)
        heuristic["sat_service_attempted"] = True
        heuristic["sat_service_message"] = result["message"]
        return heuristic

    # Missing required fields — use heuristic only
    heuristic = _heuristic_check(content_text)
    heuristic["sat_service_attempted"] = False
    heuristic["sat_service_message"] = "Incomplete CFDI fields; real SAT check skipped."
    return heuristic


def _heuristic_check(content_text: str) -> dict:
    """
    Local heuristic check — NOT real SAT validation.

    Used only as a fallback when the real SAT service is unavailable or
    the document lacks the required CFDI fields.  The source field is
    "sat_heuristic" so consumers can distinguish it from a real SAT result.
    """
    text = (content_text or "").lower()

    if "cancelled" in text:
        return {
            "sat_status": "heuristic_cancelled",
            "is_valid": False,
            "source": "sat_heuristic",
            "message": "Heuristic check (not real SAT) — invoice appears cancelled",
        }

    if "uuid" in text or "xml" in text or "factura" in text:
        return {
            "sat_status": "heuristic_likely_valid",
            "is_valid": True,
            "source": "sat_heuristic",
            "message": "Heuristic check (not real SAT) — CFDI-like content detected",
        }

    return {
        "sat_status": "heuristic_unknown",
        "is_valid": False,
        "source": "sat_heuristic",
        "message": "Heuristic check (not real SAT) — could not confirm validity",
    }
