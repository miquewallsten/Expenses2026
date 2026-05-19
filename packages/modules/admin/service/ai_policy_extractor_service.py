"""AI policy extractor.

Converts a freeform admin instruction (e.g. "Bloquear gastos sin XML mayores a
$5,000 MXN") into a structured rule_json dict + a short summary that downstream
evaluator code can execute deterministically.

The extractor is forgiving: if the LLM is unavailable or returns malformed
JSON, we surface a clear error instead of silently saving garbage.
"""

from __future__ import annotations

import json
import re
from typing import Any

from apps.api.ai.ollama_client import chat_with_ollama, resolve_model


SUPPORTED_FIELDS: tuple[str, ...] = (
    "amount",
    "currency",
    "category",
    "supplier_name",
    "has_xml",
    "is_international",
    "expense_type",
    "payment_method",
    "expense_date",
    "expense_year",
    "uuid",
    "issuer_rfc",
    "receiver_rfc",
    "uso_cfdi",
    "forma_pago",
    "metodo_pago",
    "tipo_comprobante",
    "issuer_zip",
    "receiver_zip",
    "issuer_regimen",
    "receiver_regimen",
    "description",
    "notes",
    "has_notes",
    # "Now" context fields — evaluated against the current date, not the
    # expense.  Useful for grace-period / time-window rules.
    "today_year",
    "today_month",
    "today_day",
    "today_day_of_year",
)

SUPPORTED_OPS: tuple[str, ...] = (
    "=", "!=", ">", ">=", "<", "<=", "in", "not_in", "contains",
)

SUPPORTED_ACTIONS: tuple[str, ...] = ("block", "warn")


_SYSTEM_PROMPT = (
    "You convert a Spanish or English admin instruction into a single JSON "
    "policy that an expense validator can execute deterministically.\n\n"
    "Output ONLY a single JSON object — no markdown fences, no prose.\n\n"
    "Schema (use ONE of `when` OR `any_of`):\n"
    "{\n"
    '  "rule_json": {\n'
    '    "when":   [ { "field": <field>, "op": <op>, "value": <scalar|list> } ],\n'
    '    "any_of": [ { "all": [ { "field": ..., "op": ..., "value": ... } ] } ],\n'
    '    "then":   { "action": "block"|"warn", "field": <string|null>, "message": <string> }\n'
    "  },\n"
    '  "summary":  <short Spanish phrase, <= 120 chars, describing the rule>,\n'
    '  "severity": "block"|"warn"\n'
    "}\n\n"
    "`when` is an AND of clauses. `any_of` is an OR of AND-groups (use it when the rule has "
    "exceptions or alternatives that AND alone cannot express). Provide exactly one of the two.\n\n"
    f"Allowed fields:  {', '.join(SUPPORTED_FIELDS)}\n"
    f"Allowed ops:     {', '.join(SUPPORTED_OPS)}\n"
    f"Allowed actions: {', '.join(SUPPORTED_ACTIONS)}\n\n"
    "Field meanings:\n"
    "- amount: number, expense total in expense currency\n"
    "- currency: ISO code, e.g. 'MXN', 'USD'\n"
    "- category: accounting category code, e.g. 'meals'\n"
    "- supplier_name: vendor name (use 'contains' for substring matches)\n"
    "- has_xml: boolean — true when a CFDI XML is attached\n"
    "- is_international: boolean — true when expense is foreign\n"
    "Field meanings (values in parentheses come from the attached CFDI XML):\n"
    "- amount: number, expense total (CFDI Comprobante@Total)\n"
    "- currency: ISO code, e.g. 'MXN', 'USD'\n"
    "- category: accounting category code, e.g. 'meals'\n"
    "- supplier_name: vendor name (use 'contains' for substring matches)\n"
    "- has_xml: boolean — true when a CFDI XML is attached\n"
    "- is_international: boolean — true when expense is foreign\n"
    "- expense_type: 'reimbursable' | 'corporate_card' | 'cash_advance'\n"
    "- payment_method: free text, lowercased\n"
    "- expense_date: ISO date 'YYYY-MM-DD' of the invoice (CFDI Comprobante@Fecha)\n"
    "- expense_year: integer year of the invoice date (e.g. 2026)\n"
    "- uuid: CFDI fiscal UUID (TimbreFiscalDigital@UUID), uppercase\n"
    "- issuer_rfc: supplier RFC (CFDI Emisor@Rfc), uppercase\n"
    "- receiver_rfc: recipient RFC (CFDI Receptor@Rfc), uppercase\n"
    "- uso_cfdi: SAT 'Uso del CFDI' catalog code from Receptor@UsoCFDI (e.g. 'G01','G02','G03','P01','D01'…). Compare with the exact code.\n"
    "- forma_pago: SAT payment-form code from Comprobante@FormaPago ('01' efectivo, '02' cheque, '03' transferencia, '04' tarjeta crédito, '28' tarjeta débito…).\n"
    "- metodo_pago: Comprobante@MetodoPago ('PUE' = pago en una exhibición, 'PPD' = pago en parcialidades o diferido).\n"
    "- tipo_comprobante: Comprobante@TipoDeComprobante ('I'=Ingreso, 'E'=Egreso, 'P'=Pago, 'N'=Nómina, 'T'=Traslado).\n"
    "- issuer_zip: CFDI Comprobante@LugarExpedicion — postal code (\"código postal\") of the *issuer* (emisor/proveedor).\n"
    "- receiver_zip: CFDI Receptor@DomicilioFiscalReceptor — postal code (\"código postal\") of the *receiver* (receptor/empresa).\n"
    "- issuer_regimen: CFDI Emisor@RegimenFiscal — SAT régimen fiscal code of the issuer (e.g. '601','612','621').\n"
    "- receiver_regimen: CFDI Receptor@RegimenFiscalReceptor — SAT régimen fiscal code of the receiver.\n"
    "- description: short expense description entered by the employee\n"
    "- notes: free-text clarifying note / 'nota aclaratoria' entered by the employee\n"
    "- has_notes: boolean — true when the employee filled in a note\n"
    "- today_year / today_month / today_day / today_day_of_year: integers describing TODAY — use these for grace-period or time-window exceptions (NOT properties of the expense).\n\n"
    "Conditional-requirement pattern: \"for X, require Y\" is expressed as a SINGLE policy "
    "whose `when` contains the trigger clauses AND the negation of the requirement, and "
    "whose `then.message` names the missing requirement. Example: \"expenses over $5000 "
    "must include a clarifying note\" →\n"
    "    when: [ { field: amount, op: '>', value: 5000 },\n"
    "            { field: has_notes, op: '=', value: false } ]\n"
    "    then: action=block, field='notes', message='Agregue una nota aclaratoria para gastos mayores a $5,000.'\n\n"
    "CFDI-usage pattern: \"all expenses must use UsoCFDI 'Gastos en General' (G03)\" →\n"
    "    when: [ { field: uso_cfdi, op: '!=', value: 'G03' } ]\n"
    "    then: action=block, message='La factura debe emitirse con UsoCFDI G03 (Gastos en general).'\n\n"
    "Common SAT UsoCFDI codes you may map from Spanish phrasing:\n"
    "  G01=Adquisición de mercancías, G02=Devoluciones/descuentos, G03=Gastos en general,\n"
    "  I01-I08=Inversiones, D01-D10=Deducciones personales, P01=Por definir, S01=Sin efectos fiscales.\n\n"
    "Dynamic values: use '$current_year' (integer), '$current_year_minus_1' / "
    "'$current_year_plus_1' (integer prior/next year), '$current_year_start' / "
    "'$current_year_end' / '$current_month_start' / '$current_date' (ISO date strings) "
    "when the admin refers to \"this year / current year / el año presente\" etc. Use "
    "'$legal_entity_rfcs' (list of RFC strings) when the admin refers to \"our registered "
    "legal entities / empresas dadas de alta / entidades legales / entidades autorizadas "
    "para recibir facturas\" — this expands to RFCs of active entities flagged as "
    "*invoice receivers* (is_invoice_receiver_entity=true). Use "
    "'$reimbursement_entity_rfcs' only when the admin explicitly references reimbursement "
    "entities or \"entidades de reembolso\".\n\n"
    "Use '$legal_entity_zips' (list of postal codes) when the admin refers to \"códigos postales "
    "de las entidades fiscales / CP de las entidades legales\" — expands to fiscal_zip_code of "
    "active invoice-receiver entities. '$reimbursement_entity_zips' does the same for "
    "reimbursement entities. '$legal_entity_regimes' (list of SAT régimen codes) expands to "
    "fiscal_regime of active invoice-receiver entities.\n\n"
    "Examples:\n"
    "- \"Sólo aceptar facturas del año en curso\" / \"no aceptar facturas que no sean del año presente\" →\n"
    "    when: [ { field: expense_year, op: '!=', value: '$current_year' } ]\n"
    "    then: action=block, message='La factura debe ser del año en curso.'\n"
    "- \"Bloquear facturas del RFC X\" →\n"
    "    when: [ { field: issuer_rfc, op: '=', value: 'X' } ]\n"
    "- \"Sólo aceptar facturas emitidas a nuestras entidades legales registradas\" / \"solo facturas a las empresas dadas de alta\" →\n"
    "    when: [ { field: receiver_rfc, op: 'not_in', value: '$legal_entity_rfcs' } ]\n"
    "    then: action=block, message='La factura debe emitirse a una de nuestras entidades legales registradas.'\n"
    "- \"Validar que el código postal del CFDI coincida con alguna de las entidades fiscales guardadas\" →\n"
    "    when: [ { field: receiver_zip, op: 'not_in', value: '$legal_entity_zips' } ]\n"
    "    then: action=block, message='El código postal del receptor no coincide con ninguna entidad fiscal registrada.'\n"
    "- \"Sólo facturas del año vigente; en los primeros 30 días del año también se acepta el año anterior\" → use any_of:\n"
    "    any_of: [\n"
    "      { all: [ { field: expense_year, op: '<', value: '$current_year_minus_1' } ] },\n"
    "      { all: [ { field: expense_year, op: '>', value: '$current_year' } ] },\n"
    "      { all: [ { field: expense_year, op: '=', value: '$current_year_minus_1' },\n"
    "               { field: today_day_of_year, op: '>', value: 30 } ] }\n"
    "    ]\n"
    "    then: action=block, message='La factura debe ser del año en curso. Solo se aceptan facturas del año anterior durante los primeros 30 días del año.'\n\n"
    "Conventions:\n"
    "- Multiple `when` clauses are AND-combined.\n"
    "- `any_of` is a list of groups; each group's `all` clauses are AND-combined; the rule fires when ANY group matches.\n"
    "- Prefer `when` for simple AND rules. Use `any_of` ONLY when the rule has true OR / exception logic.\n"
    "- For ops `in`/`not_in`, value MUST be a list.\n"
    "- For ops `contains`, value MUST be a string and field MUST be a string field.\n"
    "- severity MUST equal then.action.\n"
    "- The message MUST be in Spanish (formal usted form), short, and tell the "
    "user what is wrong — never restate the rule mechanically.\n\n"
    "If the instruction is ambiguous or cannot be expressed in this schema, "
    "return: {\"error\": \"<short reason in Spanish>\"} and nothing else.\n\n"
    "Settings-first principle: this company already has an *expense policy settings* "
    "object with deterministic toggles. If the admin instruction can be satisfied by "
    "flipping one of those settings, DO NOT emit a rule — the UI will map your rule to "
    "the toggle deterministically. Known settings keys (full list is in Company context "
    "when provided):\n"
    "  xml_required_mode: 'never' | 'always' | 'mxn_only'\n"
    "  international_expenses_allowed: bool\n"
    "  tickets_allowed: bool\n"
    "  require_justification: bool  (nota aclaratoria en todos los gastos)\n"
    "  require_proof: bool  (comprobante PDF/imagen)\n"
    "  pdf_pair_required_for_cfdi: bool\n"
    "  allow_split_allocations: bool\n"
    "  allow_document_free_expenses: bool\n"
    "Still emit rule_json following the schema above — the server will detect toggle "
    "equivalence and surface it to the admin. But when the Company context shows a "
    "setting is ALREADY at the state the admin wants (e.g. xml_required_mode already "
    "'always' and the admin asks to require XML everywhere), return\n"
    "    {\"error\": \"Este ajuste ya está activo en la configuración actual (<setting_key>=<value>). No se requiere una política adicional.\"}\n"
    "Use the exact current setting_key and value from the context. This prevents "
    "duplicate policies that shadow existing settings."
)


class PolicyExtractionError(ValueError):
    """Raised when the LLM cannot produce a valid policy."""


def _strip_fences(raw: str) -> str:
    s = (raw or "").strip()
    s = re.sub(r"^```(?:json)?\s*", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _coerce_value(op: str, value: Any) -> Any:
    if op in ("in", "not_in"):
        # Dynamic tokens like "$legal_entity_rfcs" stay as the bare string — the
        # evaluator expands them to the concrete list at runtime.
        if isinstance(value, str) and value.startswith("$"):
            return value
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return [value]
    return value


def _validate_clause(clause: Any) -> dict[str, Any]:
    if not isinstance(clause, dict):
        raise PolicyExtractionError("Cláusula inválida: se esperaba un objeto.")
    field = str(clause.get("field", "")).strip()
    op    = str(clause.get("op", "")).strip()
    if field not in SUPPORTED_FIELDS:
        raise PolicyExtractionError(f"Campo no soportado: {field!r}.")
    if op not in SUPPORTED_OPS:
        raise PolicyExtractionError(f"Operador no soportado: {op!r}.")
    if "value" not in clause:
        raise PolicyExtractionError(f"Cláusula para {field} no tiene 'value'.")
    return {"field": field, "op": op, "value": _coerce_value(op, clause["value"])}


def _validate_then(then: Any) -> dict[str, Any]:
    if not isinstance(then, dict):
        raise PolicyExtractionError("'then' debe ser un objeto.")
    action = str(then.get("action", "")).strip().lower()
    if action not in SUPPORTED_ACTIONS:
        raise PolicyExtractionError(f"Acción no soportada: {action!r}.")
    message = str(then.get("message", "")).strip()
    if not message:
        raise PolicyExtractionError("La política debe incluir un mensaje.")
    field = then.get("field")
    field_clean = str(field).strip() if field else None
    return {
        "action":  action,
        "field":   field_clean if field_clean else None,
        "message": message[:500],
    }


def _validate_rule(rule_json: Any) -> dict[str, Any]:
    if not isinstance(rule_json, dict):
        raise PolicyExtractionError("rule_json debe ser un objeto.")
    then = _validate_then(rule_json.get("then"))

    any_of_raw = rule_json.get("any_of")
    if any_of_raw is not None:
        if not isinstance(any_of_raw, list) or not any_of_raw:
            raise PolicyExtractionError(
                "rule_json.any_of debe ser una lista no vacía de grupos."
            )
        groups: list[dict[str, Any]] = []
        for g in any_of_raw:
            if not isinstance(g, dict):
                raise PolicyExtractionError("Cada grupo de any_of debe ser un objeto.")
            all_raw = g.get("all")
            if not isinstance(all_raw, list) or not all_raw:
                raise PolicyExtractionError(
                    "Cada grupo de any_of debe tener una lista 'all' no vacía."
                )
            groups.append({"all": [_validate_clause(c) for c in all_raw]})
        return {"any_of": groups, "then": then}

    when_raw = rule_json.get("when")
    if not isinstance(when_raw, list) or not when_raw:
        raise PolicyExtractionError(
            "rule_json.when debe ser una lista no vacía (o use any_of)."
        )
    when = [_validate_clause(c) for c in when_raw]
    return {"when": when, "then": then}


def extract_policy_from_text(
    source_text: str,
    company_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Convert *source_text* into a validated policy dict.

    Returns: { rule_json, summary, severity }.
    Raises PolicyExtractionError on any validation failure.
    """
    text = (source_text or "").strip()
    if not text:
        raise PolicyExtractionError("La política no puede estar vacía.")
    if resolve_model() is None:
        raise PolicyExtractionError(
            "El modelo de IA no está disponible. Configure OLLAMA_MODEL."
        )

    ctx_block = ""
    if company_context:
        try:
            ctx_block = (
                "Contexto de la empresa (datos reales; úsalo para detectar redundancia con ajustes existentes):\n"
                + json.dumps(company_context, ensure_ascii=False, default=str, indent=2)[:3000]
                + "\n\n"
            )
        except Exception:
            ctx_block = ""

    user_prompt = f"{ctx_block}Instrucción del administrador:\n{text}"

    result = chat_with_ollama(_SYSTEM_PROMPT, user_prompt, temperature=0.1)
    if not result.get("ok"):
        raise PolicyExtractionError(
            f"Falló la llamada al modelo: {result.get('error') or 'sin detalle'}"
        )

    raw = _strip_fences(result.get("content", ""))
    try:
        parsed = json.loads(raw)
    except Exception as exc:
        raise PolicyExtractionError(
            f"El modelo no devolvió JSON válido: {exc}"
        ) from exc

    if not isinstance(parsed, dict):
        raise PolicyExtractionError("El modelo no devolvió un objeto JSON.")
    if "error" in parsed:
        raise PolicyExtractionError(str(parsed["error"]))

    rule_json = _validate_rule(parsed.get("rule_json"))
    severity_raw = str(parsed.get("severity", rule_json["then"]["action"])).strip().lower()
    severity = severity_raw if severity_raw in SUPPORTED_ACTIONS else rule_json["then"]["action"]
    summary = str(parsed.get("summary", "")).strip()[:500]
    if not summary:
        # Fall back to a deterministic phrasing built from the rule itself.
        if "when" in rule_json and rule_json["when"]:
            first = rule_json["when"][0]
            summary = f"{first['field']} {first['op']} {first['value']} → {severity}"
        else:
            summary = f"any_of {len(rule_json.get('any_of', []))} grupos → {severity}"

    return {
        "rule_json": rule_json,
        "summary":   summary,
        "severity":  severity,
    }
