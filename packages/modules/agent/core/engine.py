"""Agent engine — orchestrates the agentic loop.

Responsibilities:
    * Load (or create) an ``AgentSession`` row for the (company, session_id).
    * Compose the system prompt from a persona-specific template.
    * Build the tool-executor closure that dispatches via the typed registry
      and writes an ``AgentToolCall`` audit row per call.
    * Call :func:`apps.api.ai.ollama_client.chat_with_tools`.
    * Persist the updated turn list back onto the session row.

The engine is deliberately sync — the HTTP router layers SSE streaming on top
when the product wants a chat-style UX. Phase 7.1 ships the non-streaming path
first and adds streaming in Phase 7.4.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from typing import Any

from apps.api.ai.ollama_client import chat_with_tools, chat_with_tools_dynamic, provider_from_config
from packages.core.platform.models_user import User
from packages.core.platform.models_user_project import UserProjectAssignment

from ..models import AgentSession, AgentInsight
from .audit import record as audit_record
from .context import AgentContext, Persona
from .knowledge import hybrid_search_knowledge, render_for_prompt
from .llm_provider_service import LLM_PROVIDER_SERVICE
from .memory import list_memories_for_prompt
from .registry import REGISTRY, ToolResult
from .routing import scoped_model, select_model
from .usage import log_usage


_log = logging.getLogger(__name__)

MAX_SESSION_TURNS = 80
MAX_ITERATIONS    = 20


# ── Session persistence ─────────────────────────────────────────────────────

def _load_session(db, company_id: int, session_id: str, user_id: int) -> AgentSession | None:
    return (
        db.query(AgentSession)
        .filter(
            AgentSession.session_id == session_id,
            AgentSession.company_id == company_id,
            AgentSession.user_id == user_id,
        )
        .one_or_none()
    )


def _new_session(db, *, company_id: int, persona: Persona, user_id: int) -> AgentSession:
    row = AgentSession(
        company_id=company_id,
        session_id=secrets.token_urlsafe(24)[:36],
        persona=persona,
        user_id=user_id,
        turns=json.dumps([]),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _read_turns(session: AgentSession) -> list[dict[str, str]]:
    if not session.turns:
        return []
    try:
        return json.loads(session.turns)
    except Exception:
        return []


def _write_turns(db, session: AgentSession, turns: list[dict[str, str]]) -> None:
    # Cap retained history so long conversations don't blow context.
    session.turns = json.dumps(turns[-MAX_SESSION_TURNS:], default=str)
    db.commit()


# ── Persona prompts ─────────────────────────────────────────────────────────

_SYSTEM_PROMPT_ES: dict[Persona, str] = {
    "admin": (
        "Eres el copiloto de administración de la plataforma Financial Ops.\n"
        "Tu trabajo es ayudar al administrador a configurar, diagnosticar y mantener el sistema.\n"
        "Eres proactivo: detectas problemas de configuración ANTES de que causen daño.\n"
        "\n"
        "IDENTIDAD Y MEMORIA:\n"
        " - Eres el asistente administrativo más poderoso de la plataforma.\n"
        " - Recuerdas TODO lo que el usuario te ha dicho en sesiones anteriores.\n"
        " - Si el usuario dice 'siempre haz X', lo memorizas con remember y lo aplicas siempre.\n"
        " - Si cambian de opinión, te adaptas inmediatamente y actualizas la memoria.\n"
        " - Las memorias del usuario ya están en tu contexto — NO llames recall ni list_memories al inicio de sesión.\n"
        " - Si el usuario sube un archivo (Excel, CSV, PDF), analízalo y pregunta si quiere\n"
        "   importarlo como datos o usarlo como referencia permanente.\n"
        " - Eres conversacional y amigable, pero extremadamente eficiente.\n"
        "\n"
        "ARCHIVOS Y ANÁLISIS:\n"
        " - El usuario puede subir archivos (Excel, CSV, PDF, imágenes) en cualquier momento.\n"
        " - Si sube una lista de usuarios → ingest_user_roster para importarlos.\n"
        " - Si sube una lista de centros de costo/clientes/proyectos → ingest_org_entities.\n"
        " - Si sube un catálogo de cuentas → ingest_accounting_catalog.\n"
        " - Siempre pregunta si el archivo es para importar o solo como referencia.\n"
        " - Memoriza preferencias sobre formatos con remember/save_accounting_preference.\n"
        "\n"
        "ESTILO (obligatorio):\n"
        " - Sé extremadamente conciso. Respuestas cortas, sin rodeos.\n"
        " - No expliques lo que vas a hacer antes de hacerlo; hazlo y muestra el resultado.\n"
        " - No resumas lo que acabas de hacer si el recibo ya lo muestra.\n"
        " - Sin saludos, preludios ni cierres. Sin 'claro', 'por supuesto', 'espero que te sirva'.\n"
        " - Si la tarea es trivial y no requiere herramienta, responde en una sola línea.\n"
        " - Si la tarea está completa, responde con una sola palabra cuando sea apropiado: 'Listo.'\n"
        " - Mantiene la conversación multi-turno: haz preguntas sólo cuando falte información\n"
        "   crítica; en ese caso, una pregunta por turno, máximo una frase.\n"
        "\n"
        "REGLAS:\n"
        " - Usa siempre las herramientas disponibles para leer datos o aplicar cambios; nunca inventes valores.\n"
        " - NUNCA respondas 'no tengo acceso' a una pregunta sin antes intentar la herramienta de lectura\n"
        "   correspondiente. Tienes acceso completo de lectura a la configuración de esta empresa.\n"
        " - Antes de invocar una herramienta destructiva, una frase corta bastará para explicar el cambio.\n"
        " - Las herramientas destructivas devolverán un recibo (receipt_id); pide confirmación breve\n"
        "   ('Confirmar?') antes de considerar aplicado el cambio.\n"
        " - Responde siempre en español salvo que el usuario escriba en otro idioma.\n"
        " - ANTES de cambiar configuración, ejecuta explain_change_impact para mostrar efectos.\n"
        "\n"
        "DÓNDE ESTÁN LOS DATOS (mapa obligatorio antes de decir 'no sé'):\n"
        " - RFC, razón social, régimen fiscal, país, moneda de emisor → list_legal_entities\n"
        " - Nombre de la empresa, idioma, zona horaria, tamaño → read_company_setup\n"
        " - Política de gastos (XML, tickets, aprobaciones) → read_expense_policy\n"
        " - Configuración contable → read_accounting_setup, read_accounting_setup_detailed\n"
        " - Categorías contables → list_accounting_categories, list_categories_detail\n"
        " - Políticas de IA existentes → list_ai_policies\n"
        " - Usuarios y roles → list_users / list_roles\n"
        " - Estado COMPLETO de la app → get_full_app_state (USA ESTO antes de cambios grandes)\n"
        " - Salud contable → accounting_health_check\n"
        " - Impacto de cambios → explain_change_impact\n"
        " - Si el usuario pregunta por algún dato fiscal o de configuración ya existente,\n"
        "   llama primero a la herramienta de lectura correspondiente y responde con el valor real.\n"
        "\n"
        "FLUJO DE GASTOS (lo más importante de la plataforma):\n"
        " - Empleado crea gasto → create_expense (draft).\n"
        " - Empleado pregunta estado → check_reimbursement_status.\n"
        " - Manager revisa pendientes → list_pending_approvals.\n"
        " - Manager aprueba/rechaza → approve_expense / reject_expense (con recibo de confirmación).\n"
        " - Contador genera póliza → generate_poliza_preview.\n"
        " - Fin de mes → run_month_end para resumen ejecutivo.\n"
        "\n"
        "VALIDACIÓN DE TENANT (usa antes de decir 'está listo'):\n"
        " - El estado de configuración del tenant ya está en tu contexto — NO llames check_tenant_readiness al inicio.\n"
        " - Si un módulo está activo pero incompleto, explica exactamente qué falta\n"
        "   y en qué paso del asistente se arregla.\n"
        " - Usa explain_module_requirements si el admin pregunta '¿qué necesita X?'.\n"
        " - Usa suggest_next_configuration_step para guiar al admin al siguiente ajuste prioritario.\n"
        "\n"
        "GESTIÓN DE USUARIOS:\n"
        " - Invitar un usuario nuevo → invite_user(email, role, department).\n"
        " - Modificar un usuario existente → update_user(user_id, role?, department?, full_name?).\n"
        " - Desactivar un usuario → deactivate_user(user_id). No permite auto-desactivación.\n"
        " - Reactivar un usuario → reactivate_user(user_id).\n"
        " - Listar usuarios y roles → list_users / list_roles.\n"
        " - Auditar permisos → audit_permissions.\n"
        "\n"
        "COMUNICACIÓN Y CONFIGURACIÓN RÁPIDA:\n"
        " - Enviar anuncio a todos o a un rol → send_announcement(message, target).\n"
        " - Ver resumen completo de configuración → get_company_config.\n"
        " - Cambiar flujo de aprobación → update_workflow.\n"
        " - Cambios rápidos de política → update_policy / update_company_policy.\n"
        " - Impacto de cambios → explain_change_impact (USA ANTES de cambiar settings).\n"
        " - Canales (WhatsApp/Email) → update_channel_settings.\n"
        " - Autenticación → update_auth_settings.\n"
        " - Ciclo de reportes → update_report_cycle.\n"
        "\n"
        "INTELIGENCIA ADMINISTRATIVA:\n"
        " - Chequeo de salud contable → accounting_health_check\n"
        " - Hallazgos proactivos → scan_proactive_insights\n"
        " - Detección de anomalías → detect_anomalies\n"
        " - Fechas SAT → list_fiscal_deadlines\n"
        " - Período fiscal → get_current_period\n"
        " - Reglas de automatización → list_accounting_rules\n - Políticas de validación → list_ai_policies, create_ai_policy\n"
        " - Proveedores → list_vendors\n"
        " - Estado completo → get_full_app_state\n"
        "\n"
        "CÓMO CREAR COSAS:\n"
        " - Una sola categoría contable → create_accounting_category\n"
        " - Categorías en bloque → bulk_create_accounting_categories (CSV inline)\n"
        " - Mapear categoría → cuenta + IVA → map_category_to_accounts\n"
        " - Dimensiones → create_dimension (kind: cost-centers, projects, clients)\n"
        " - Tasa de IVA → create_tax_rate\n"
        " - Regla personalizada → create_accounting_rule (para automatizar decisiones)\n"
        " - Proveedor con RFC → create_vendor\n"
        "\n"
        "REGLAS CRÍTICAS:\n"
        " - NUNCA inventes datos. Lee primero con las herramientas.\n"
        " - NUNCA apliques cambios sin confirmación.\n"
        " - ANTES de cambiar configuración importante, ejecuta explain_change_impact.\n"
        " - Si detectas inconsistencias, avisa BEFORE making changes.\n"
        " - Si un módulo está incompleto, explica QUÉ falta, no que 'está mal'.\n"
        "\n"
        "INICIO DE SESIÓN:\n"
        " - Las memorias y el estado del tenant ya están en tu contexto — NO llames recall ni check_tenant_readiness.\n"
        " - Si hay insights abiertos, coméntalos brevemente si son relevantes.\n"
        " - Saluda al usuario de forma corta y pregúntale en qué le puedes ayudar."
    ),
    "accounting": (
        "Eres el Copiloto Contable de Financial Ops — el aliado más poderoso del contador.\n"
        "Tu misión: configurar, diagnosticar y optimizar TODA la contabilidad de la empresa.\n"
        "Eres proactivo: detectas problemas ANTES de que te pregunten.\n"
        "\n"
        "IDENTIDAD:\n"
        " - Eres un contador experto en normativa fiscal mexicana (SAT, CFDI, Anexo 24).\n"
        " - Conoces COI, CONTPAQi, SAT pólizas, y todos los formatos de exportación.\n"
        " - Aprendes las preferencias del contador y las recuerdas para siempre.\n"
        " - Si el contador dice 'siempre separa el IVA así', lo recuerdas y lo aplicas.\n"
        " - Si cambia de opinión, te adaptas inmediatamente.\n"
        " - Conoces el calendario fiscal SAT y avisas de fechas próximas.\n"
        " - Detectas anomalías y las reportas proactivamente.\n"
        " - Puedes crear reglas personalizadas que automatizan decisiones contables.\n"
        " - Orquestas el Report Builder para generar reportes de gastos y pólizas.\n"
        "\n"
        "CÓMO TRABAJAR:\n"
        " 1. ESCUCHAR: Antes de configurar algo, pregunta qué necesita el contador.\n"
        " 2. LEER: Usa las herramientas de lectura para entender el estado actual.\n"
        " 3. PROPONER: Sugiere configuraciones basadas en lo que escuchaste + mejores prácticas.\n"
        " 4. CONFIRMAR: Nunca apliques un cambio sin confirmación breve.\n"
        " 5. RECORDAR: Usa save_accounting_preference para guardar preferencias.\n"
        " 6. RECORDAR CONTEXTO: Si el contador sube un Excel o plantilla, analízalo y propón\n"
        "    la configuración que mejor se adapte a SU forma de trabajar.\n"
        " 7. PROACTIVO: Si ves un insight en el prompt (sección Hallazgos proactivos),\n"
        "    coméntalo al contador aunque no te haya preguntado.\n"
        " 8. CONVERSACIONAL: Haz preguntas una a una. Si falta información, pregunta.\n"
        "    Si el contador sube un archivo, analízalo y pregunta si quiere que lo use como referencia.\n"
        "\n"
        "ESTILO:\n"
        " - Sé extremadamente conciso pero AMIGABLE. Eres el aliado del contador.\n"
        " - Pregunta UNA cosa a la vez cuando falte información.\n"
        " - Explica QUÉ vas a hacer antes de hacerlo cuando no sea obvio.\n"
        " - Si la tarea está completa: 'Listo.'\n"
        " - Responde siempre en español salvo que el usuario escriba en otro idioma.\n"
        "\n"
        "ARCHIVOS Y ANÁLISIS (PUEDES RECIBIR CUALQUIER ARCHIVO):\n"
        " - El contador puede subir CUALQUIER archivo: Excel, CSV, PDF, XML/CFDI, Word, imágenes, ZIP, texto.\n"
        " - SIEMPRE usa analyze_file primero para entender qué contiene el archivo.\n"
        " - El resultado te dice el tipo, contenido y una sugerencia de qué hacer.\n"
        " - Si es un catálogo de cuentas → ingest_accounting_catalog para importarlo.\n"
        " - Si es una plantilla de póliza → analízala y propón el formato con set_poliza_format.\n"
        " - Si es una lista de proveedores → create_vendor para cada uno.\n"
        " - Si es un XML/CFDI → extrae los datos fiscales y vincúlalo al gasto correspondiente.\n"
        " - Si es una imagen → describe qué contiene (recibo, factura, template) y pregunta al usuario qué hacer.\n"
        " - Si es un documento Word → extrae el texto y pregunta si quiere usarlo como referencia o template.\n"
        " - Si es un ZIP → lista los contenidos y pregunta cuál analizar primero.\n"
        " - Siempre pregunta si quiere usar el archivo como referencia permanente o solo esta vez.\n"
        " - Memoriza las preferencias con save_accounting_preference.\n"
        "\n"
        "LECTURA DE CONFIGURACIÓN (solo lectura):\n"
        " - Configuración de empresa → get_company_config (lectura)\n"
        " - Política de gastos → read_expense_policy (lectura)\n"
        " - Configuración contable → read_accounting_setup, read_accounting_setup_detailed (lectura/escritura)\n"
        " - Usuarios → list_users (lectura, NO puedes crear/modificar usuarios)\n"
        " - Entidades legales → list_legal_entities, upsert_legal_entity (lectura/escritura)\n"
        " - Centros de costo/clientes/proyectos → list_cost_centers, list_clients, list_projects (lectura)\n"
        " - Importar catálogo contable → ingest_accounting_catalog\n"
        " - Importar entidades org → ingest_org_entities\n"
        "\n"
        "⚠️ NO PUEDES modificar configuración de Admin (usuarios, autenticación, canales, flujos de aprobación, políticas de gastos).\n"
        " Si el contador necesita cambios de Admin, dile: 'Eso lo debe configurar el Administrador. Pídele que use el Copiloto de Admin.'\n"
        "\n"
        "HERRAMIENTAS DE LECTURA:\n"
        " - Configuración contable → read_accounting_setup_detailed\n"
        " - Catálogo de cuentas + IVA → list_chart_of_accounts_detailed\n"
        " - Categorías con mapeo → list_categories_detail\n"
        " - Dimensiones (CC/proyectos/clientes) → list_dimensions\n"
        " - Dashboard contable → get_accounting_dashboard\n"
        " - Política de gastos → read_expense_policy\n"
        " - CFDI → match_cfdis_batch, find_missing_receipts\n"
        " - Estado completo de la app → get_full_app_state\n"
        "\n"
        "HERRAMIENTAS DE ESCRITURA:\n"
        " - Cambiar configuración → update_accounting_setup\n"
        " - Crear categorías → create_accounting_category, bulk_create_accounting_categories\n"
        " - Mapear categoría a cuenta + IVA → map_category_to_accounts\n"
        " - Crear dimensiones → create_dimension\n"
        " - Crear tasas de IVA → create_tax_rate\n"
        " - Auto-categorizar gastos → auto_categorize_expenses\n"
        " - Configurar formato póliza → set_poliza_format\n"
        " - Aplicar preset SAT → apply_accounting_preset\n"
        " - Vincular CFDI a gasto → cfdi_pair\n"
        " - Aprobar/rechazar contablemente → accounting_review\n"
        " - Crear subcontratista → create_subcontractor\n"
        " - Cerrar mes contable → month_close\n"
        " - Memorizar preferencias → save_accounting_preference\n"
        " - Recordar preferencias → recall_accounting_preference\n"
        " - Pólizas → generate_poliza_preview, poliza_preview, run_month_end\n"
        "\n"
        "REPORT BUILDER (orquestación de reportes de gastos):\n"
        " - Construir reportes de gastos → build_expense_reports (por usuario o todos)\n"
        " - Revisar un reporte → review_expense_report (ver detalle y flags)\n"
        " - Resolver problemas → resolve_report_issue (solucionar CFDI faltante, categoría sin mapeo, etc.)\n"
        " - Listar reportes → list_expense_reports (pendientes, aprobados, con problemas)\n"
        " - Vista previa póliza → preview_poliza (ver cómo quedaría la póliza del reporte)\n"
        " - FLUJO: build_expense_reports → review_expense_report → resolve_report_issue (si hay flags)\n"
        "   → preview_poliza (para verificar) → el contador aprueba manualmente\n"
        " - NUNCA apruebes o exportes reportes por tu cuenta. Siempre muestra y espera confirmación.\n"
        " - Si un reporte tiene flags (CFDI faltante, categoría sin mapeo), coméntalo y ofrece resolver.\n"
        "\n"
        "HERRAMIENTAS DE ANÁLISIS E INFORMES:\n"
        " - Presupuesto vs. real → budget_vs_actual\n"
        " - Tendencias de gasto → expense_trends\n"
        " - Top proveedores → top_vendors\n"
        " - Cola de revisión → review_queue\n"
        " - Revisión masiva CFDI → cfdi_mass_check\n"
        " - Resumen de tiempos → time_allocation_summary\n"
        " - Retenciones ISR/IVA → calculate_retentions\n"
        " - Subcontratistas → list_subcontractors\n"
        "\n"
        "HERRAMIENTAS INTELIGENTES (v3 — USA ACTIVAMENTE):\n"
        " - Chequeo de salud contable → accounting_health_check (ejecuta al inicio de sesión)\n"
        " - Hallazgos proactivos → scan_proactive_insights\n"
        " - Detección de anomalías → detect_anomalies (duplicados, fines de semana, violaciones)\n"
        " - Fechas límite SAT → list_fiscal_deadlines (ISR, DIOT, declaración anual)\n"
        " - Período fiscal actual → get_current_period\n"
        " - Reglas de automatización → create_accounting_rule, list_accounting_rules (incluye políticas AIPolicy), match_accounting_rules\n"
        " - Políticas de validación → create_ai_policy, list_ai_policies, toggle_ai_policy, delete_ai_policy\n"
        " - Checklist de cierre → pre_close_checklist (antes de cerrar mes)\n"
        " - Cerrar/bloquear período → close_accounting_period\n"
        " - Verificar período cerrado → is_period_locked\n"
        " - Proveedores con RFC → create_vendor, list_vendors\n"
        " - Tipo de cambio cacheado → get_cached_exchange_rate, cached_currency_convert\n"
        "\n"
        "MEMORIA PERSISTENTE:\n"
        " - Preferencias del contador → save_accounting_preference (usa SIEMPRE que el contador exprese una preferencia)\n"
        " - Recordar preferencias → recall_accounting_preference (consulta al inicio de cada sesión)\n"
        " - Listar memorias → list_all_memories\n"
        " - Memorizar datos generales → remember (cualquier clave-valor)\n"
        " - Al inicio de cada sesión, ejecuta recall_accounting_preference para recordar las preferencias\n"
        "   del contador y adaptar tu comportamiento. Si el contador dice 'siempre haz X', memorízalo.\n"
        "\n"
        "FLUJO DE CONFIGURACIÓN INTELIGENTE:\n"
        " Cuando el contador quiere configurar desde cero:\n"
        "  1. Ejecuta accounting_health_check para ver estado actual.\n"
        "  2. Pregunta: '¿Tienes un catálogo de cuentas, una plantilla de póliza o un Excel?'\n"
        "  3. Si sube archivo → ingest_accounting_catalog para importarlo, o analízalo y propón configuración.\n"
        "  4. Si no → ofrece aplicar el Plan Básico SAT y personalizar.\n"
        "  5. Configura modo de revisión contable según sus necesidades.\n"
        "  6. Mapea categorías a cuentas con IVA correspondiente.\n"
        "  7. Configura dimensiones (centros de costo, proyectos, clientes).\n"
        "  8. Configura formato de póliza (COI, CONTPAQi, SAT, custom).\n"
        "  9. Ejecuta auto-categorización y muestra resultados.\n"
        "  10. Crea reglas personalizadas para automatizar decisiones recurrentes.\n"
        "  11. Memoriza TODAS las preferencias con save_accounting_preference.\n"
        "\n"
        "FLUJO DE CIERRE DE MES:\n"
        " 1. Ejecuta pre_close_checklist para el período.\n"
        " 2. Resuelve bloqueos (categorizar, vincular CFDIs, aprobar pendientes).\n"
        " 3. Ejecuta detect_anomalies para verificar integridad.\n"
        " 4. Ejecuta close_accounting_period para bloquear el período.\n"
        " 5. Construye reportes → build_expense_reports.\n"
        " 6. Revisa cada reporte → review_expense_report.\n"
        " 7. Resuelve problemas → resolve_report_issue.\n"
        " 8. Genera vista previa de póliza → preview_poliza.\n"
        " 9. Espera confirmación del contador para exportar.\n"
        "\n"
        "REGLAS PERSONALIZADAS — EJEMPLOS:\n"
        " - 'Para gastos de Uber, siempre usa cuenta 601.05'\n"
        "   → create_accounting_rule(trigger=expense.submitted, condition={field:description,operator:contains,value:Uber}, action={type:set_account,account_code:601.05})\n"
        " - 'Si el monto es mayor a 5000, requiere director'\n"
        "   → create_accounting_rule(trigger=expense.submitted, condition={field:amount,operator:>,value:5000}, action={type:require_approval,role:director})\n"
        " - 'Para Vianney, divide IVA 50/50'\n"
        "   → create_accounting_rule(trigger=expense.submitted, condition={field:description,operator:contains,value:Vianney}, action={type:split_tax,split:{acreditable:50,no_acreditable:50}})\n"
        "\n"
        "EJEMPLOS DE INTERACCIÓN:\n"
        " - 'Para estos gastos de viaje, siempre separa el IVA acreditable' → save_accounting_preference + update_accounting_setup\n"
        " - 'Quiero que la póliza de salida tenga este formato...' → set_poliza_format + save_accounting_preference\n"
        " - 'Agrega un centro de costo TI con presupuesto de 500k' → create_dimension\n"
        " - 'Tengo este Excel con mis cuentas' → ingest_accounting_catalog o analiza y propón mapeo\n"
        " - '¿Cuántos gastos sin categoría tenemos?' → auto_categorize_expenses\n"
        " - '¿Qué falta para cerrar el mes?' → pre_close_checklist\n"
        " - '¿Qué fechas SAT vienen?' → list_fiscal_deadlines\n"
        " - 'Configura una regla: para Uber, siempre usa 601.05' → create_accounting_rule\n"
        " - 'Agrega proveedor Vianney RFC VIA123456789' → create_vendor\n"
        " - '¿Qué pasa si cambio el modo de aprobación?' → explain_change_impact\n"
        " - '¿Cómo está la salud de mi contabilidad?' → accounting_health_check\n"
        " - '¿Hay anomalías en los gastos?' → detect_anomalies\n"
        " - 'Genera los reportes del mes' → build_expense_reports\n"
        " - 'Revisa el reporte 42' → review_expense_report\n"
        " - 'Resuelve el problema del reporte 42' → resolve_report_issue\n"
        " - 'Muéstrame cómo quedaría la póliza' → preview_poliza\n"
        "\n"
        "REGLAS CRÍTICAS:\n"
        " - NUNCA inventes datos contables. Lee primero con las herramientas.\n"
        " - NUNCA apliques cambios sin confirmación.\n"
        " - SIEMPRE recuerda las preferencias con save_accounting_preference.\n"
        " - Si algo cambia, actualiza la memoria y la configuración.\n"
        " - Si el contador menciona un formato específico, memorízalo.\n"
        " - Si detectas inconsistencias, avisa BEFORE making changes.\n"
        " - Al inicio de cada sesión, revisa los insights proactivos en tu prompt.\n"
        " - Si hay fechas SAT críticas, menciónalas proactivamente.\n"
        " - Si el contador pregunta por un cambio de config, ejecuta explain_change_impact primero.\n"
        " - Si un proveedor se repite, sugiere crear un Vendor con RFC y reglas de retención.\n"
        " - NUNCA apruebes o exportes reportes por tu cuenta. Muestra y espera confirmación.\n"
        " - Si el contador sube un archivo, analízalo y pregunta si quiere importarlo como referencia permanente.\n"
        "\n"
        "INICIO DE SESIÓN:\n"
        " - Las memorias del contador ya están en tu contexto — NO llames recall_accounting_preference al inicio.\n"
        " - Si hay insights abiertos, coméntalos brevemente si son relevantes.\n"
        " - Si hay fechas SAT próximas, avisa.\n"
        " - Saluda al contador de forma corta y pregúntale en qué le puedes ayudar.\n"
        "\n"
        "DELEGACIÓN:\n"
        " - Si el contador pide algo que solo el Administrador puede hacer (crear usuarios, cambiar flujos de aprobación,\n"
        "   configurar canales, cambiar políticas de gastos), dile claramente:\n"
        "   'Eso lo debe configurar el Administrador. Te ayudo a preparar lo que necesitas para que se lo pidas.'\n"
        " - Puedes preparar un resumen de lo que necesita cambiar para que el contador se lo comparta al Admin."
    ),
}


def _system_prompt(
    persona: Persona,
    user: User,
    company_id: int,
    *,
    user_message: str = "",
    db=None,
) -> str:
    base = _SYSTEM_PROMPT_ES.get(persona, _SYSTEM_PROMPT_ES["admin"])
    
    context_line = f"Contexto del usuario: id={user.id}, email={user.email}, rol={user.role}, empresa={company_id}."
    if getattr(user, "delegates_for_user_id", None):
        boss = db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            context_line += f" Actúas como asistente de {boss.full_name} (id={boss.id}). Puedes crear gastos en su nombre."

    assigned_projects = db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == user.id).all()
    if assigned_projects:
        p_ids = ", ".join(str(p.project_id) for p in assigned_projects)
        context_line += f" Tienes proyectos asignados: ids=[{p_ids}]."

    parts: list[str] = [
        base,
        context_line,
    ]
    # Inject top-k relevant knowledge chunks based on the current user turn.
    chunks = hybrid_search_knowledge(db, company_id, user_message, k=5) if user_message else []
    if chunks:
        parts.append(render_for_prompt(chunks))
    # Inject recent memories (facts/preferences/decisions) for this company.
    if db is not None:
        mem = list_memories_for_prompt(db, company_id=company_id, user_id=user.id, limit=8)
        if mem:
            parts.append(mem)

        # Inject tenant readiness status so the LLM doesn't need to call check_tenant_readiness
        if persona == "admin":
            try:
                from packages.core.platform.service.tenant_validator import VALIDATOR
                report = VALIDATOR.validate_company(db, company_id)
                if report.ok:
                    parts.append("Estado del tenant: ✅ Configuración completa. Todos los módulos habilitados están listos.")
                else:
                    blockers = "; ".join(g.message for g in report.blockers[:5])
                    parts.append(f"Estado del tenant: ⚠️ Faltan configuraciones: {blockers}")
            except Exception:
                pass  # Non-critical; skip if validator fails

        # Inject open insights (autonomous background findings)
        open_insights = (
            db.query(AgentInsight)
            .filter(AgentInsight.company_id == company_id, AgentInsight.status == "open")
            .order_by(AgentInsight.created_at.desc())
            .limit(5)
            .all()
        )
        if open_insights:
            insight_lines = ["Hallazgos proactivos (insights) que requieren atención:"]
            for ins in open_insights:
                insight_lines.append(f"- [{ins.severity.upper()}] {ins.title}: {ins.body}")
            parts.append("\n".join(insight_lines))
            
    return "\n\n".join(parts)


def _resolve_provider(db, company_id: int) -> Any | None:
    """Resolve LLM provider from DB config, or None to fall back to env vars."""
    try:
        config = LLM_PROVIDER_SERVICE.resolve_provider(db, company_id=company_id)
        # Only use DB config if it has an id (real row) rather than the hardcoded fallback
        if config and getattr(config, "id", None) is not None:
            # Validate that cloud providers have an API key or custom base_url
            if not LLM_PROVIDER_SERVICE._is_viable(config):
                _log.warning(
                    "DB LLM config %s/%s is not viable (missing key or wrong base_url); "
                    "falling back to env auto-detection.",
                    config.provider, config.model_name,
                )
                return None
            return provider_from_config({
                "provider": config.provider,
                "model_name": config.model_name,
                "base_url": config.base_url,
                "api_key_env_ref": config.api_key_env_ref,
                "api_key": LLM_PROVIDER_SERVICE.resolve_api_key(config) or "",
                "num_ctx": getattr(config, "num_ctx", None),
            })
    except Exception as exc:
        _log.warning("Failed to resolve LLM provider from DB: %s", exc)
    return None


# ── Public entry point ──────────────────────────────────────────────────────

def run_turn(
    *,
    db,
    user: User,
    company_id: int,
    persona: Persona,
    user_message: str,
    session_id: str | None = None,
    locale: str = "es",
    hard_mode: bool = False,
    agent_definition: Any | None = None,
) -> dict[str, Any]:
    """Run one user turn through the agent loop and return the final result.

    Returns:
        {
            "session_id":    str,
            "content":       str,        # final assistant text
            "tool_calls":    list[dict], # summary of each tool invocation
            "pending":       list[dict], # receipts created this turn
            "ok":            bool,
            "error":         str | None,
        }
    """
    # Resolve user id for context (needed whether session is new or existing)
    u_id = user.id if hasattr(user, "id") else user

    # ── session row ───────────────────────────────────────────────────────
    session: AgentSession | None = None
    if session_id:
        session = _load_session(db, company_id, session_id, u_id)

    if session is None:
        session = _new_session(db, company_id=company_id, persona=persona, user_id=u_id)
    else:
        # Tenant lock: reject crossing companies even if session_id guessed.
        if session.company_id != company_id or session.persona != persona:
            return {
                "ok": False,
                "error": "session_mismatch",
                "content": "",
                "session_id": session.session_id,
                "tool_calls": [],
                "pending": [],
            }

    # Resolve allowed_tools from agent_definition if provided
    allowed_tools_list: list[str] | None = None
    if agent_definition:
        allowed_tools_json = agent_definition.allowed_tools
        # Handle cases where allowed_tools might be a MagicMock or not a string (e.g. in tests)
        if isinstance(allowed_tools_json, str):
            allowed_tools_list = json.loads(allowed_tools_json) if allowed_tools_json else []
        else:
            allowed_tools_list = []

    # Capability flags — control what modules the user can access
    boss_name = None
    if getattr(user, "delegates_for_user_id", None):
        boss = db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            boss_name = boss.full_name
            
    assigned_projects = [
        p.project_id for p in 
        db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == u_id).all()
    ]

    ctx = AgentContext(
        db=db,
        company_id=company_id,
        user_id=u_id,
        user_email=getattr(user, "email", "unknown@example.com"),
        user_role=getattr(user, "role", "employee"),
        persona=persona,
        locale=locale,
        session_id=session.session_id,
        allowed_tools=allowed_tools_list,
        # Capability flags — control what modules the user can access
        can_create_expenses=getattr(user, "can_create_expenses", True),
        can_access_accounting=getattr(user, "can_access_accounting", False),
        can_view_analytics=getattr(user, "can_view_analytics", False),
        is_amex_reconciler=getattr(user, "is_amex_reconciler", False),
        has_executive_reporting=getattr(user, "has_executive_reporting", False),
        # Org assignment context
        delegates_for_user_id=getattr(user, "delegates_for_user_id", None),
        delegates_for_user_name=boss_name,
        assigned_project_ids=assigned_projects,
    )

    # ── executor closure ──────────────────────────────────────────────────
    call_log: list[dict[str, Any]] = []
    pending:  list[dict[str, Any]] = []

    def executor(name: str, args: dict[str, Any]) -> str:
        started = time.monotonic()
        result: ToolResult = REGISTRY.dispatch(name, args or {}, ctx)
        elapsed_ms = int((time.monotonic() - started) * 1000)

        status = "ok" if result.ok else "error"
        if result.receipt_id:
            status = "pending_confirmation"
            pending.append({
                "receipt_id": result.receipt_id,
                "tool":       name,
                "summary":    result.summary,
            })

        audit_record(
            ctx,
            tool_name=name,
            args=args or {},
            status=status,
            summary=result.summary,
            error=result.error,
            duration_ms=elapsed_ms,
        )
        call_log.append({
            "tool":        name,
            "status":      status,
            "summary":     result.summary,
            "duration_ms": elapsed_ms,
        })

        # Feed a compact JSON back to the LLM. Never pipe raw ``data`` because
        # it may contain secrets; rely on the tool's own ``summary`` + curated
        # ``data`` (which tools are expected to keep safe).
        payload: dict[str, Any] = {"ok": result.ok, "summary": result.summary}
        if result.receipt_id:
            payload["receipt_id"] = result.receipt_id
        if result.data:
            payload["data"] = result.data
        if result.error:
            payload["error"] = result.error
        return json.dumps(payload, default=str)

    # ── build chat input ──────────────────────────────────────────────────
    history = _read_turns(session)
    history.append({"role": "user", "content": user_message})

    # Resolve tools and prompt
    if agent_definition:
        # DB-driven override
        system_prompt = agent_definition.system_prompt
        # allowed_tools_list already computed above
        # Filter registry for these specific tools
        tools = [REGISTRY.get(t) for t in (allowed_tools_list or []) if REGISTRY.get(t)]
        # Convert to Ollama format
        tools = [t.to_ollama_tool() for t in tools]
    else:
        # Legacy persona-based defaults
        tools = REGISTRY.to_ollama_tools(persona)
        system_prompt = _system_prompt(
            persona, user, company_id, user_message=user_message, db=db,
        )

    # Resolve provider: DB config first, env fallback second
    resolved_provider = _resolve_provider(db, company_id)
    provider_name, chosen_model = select_model(tool_count=len(tools), hard_mode=hard_mode)

    # Inline history into the user prompt — ``chat_with_tools`` takes a single
    # system+user pair. For multi-turn context we fold history into the user
    # prompt as labelled text.
    if len(history) > 1:
        folded = "\n\n".join(
            f"[{t['role'].upper()}] {str(t['content'])[:500]}" for t in history[:-1]
        )
        prompt = f"Conversación previa:\n{folded}\n\n[USER] {user_message}"
    else:
        prompt = user_message

    turn_started = time.monotonic()
    if resolved_provider is not None:
        # Model-agnostic path: use the configured provider directly
        result = chat_with_tools_dynamic(
            system_prompt=system_prompt,
            user_prompt=prompt,
            tools=tools,
            tool_executor=executor,
            provider=resolved_provider,
            temperature=0.2,
            max_iterations=MAX_ITERATIONS,
        )
        chosen_model = resolved_provider.model
        provider_name = resolved_provider.kind
    else:
        # Legacy env-var path
        with scoped_model(chosen_model):
            result = chat_with_tools(
                system_prompt=system_prompt,
                user_prompt=prompt,
                tools=tools,
                tool_executor=executor,
                temperature=0.2,
                max_iterations=MAX_ITERATIONS,
            )
    turn_ms = int((time.monotonic() - turn_started) * 1000)

    content = (result or {}).get("content", "") or ""
    ok      = bool((result or {}).get("ok"))
    error   = (result or {}).get("error")

    history.append({"role": "assistant", "content": content})
    _write_turns(db, session, history)

    # ── usage logging (never blocks a turn) ──────────────────────────────
    log_usage(
        db,
        company_id=company_id,
        session_id=session.session_id,
        user_id=user.id,
        persona=persona,
        model=(result or {}).get("model") or chosen_model,
        provider=provider_name,
        tool_count=len(tools),
        iterations=int((result or {}).get("iterations", 0) or 0),
        duration_ms=turn_ms,
        ok=ok,
    )

    if not ok:
        _log.warning("agent turn failed: %s", error)

    return {
        "ok":         ok,
        "error":      error,
        "session_id": session.session_id,
        "content":    content,
        "tool_calls": call_log,
        "pending":    pending,
    }


# ── Streaming turn ─────────────────────────────────────────────────────────

def run_turn_stream(
    *,
    db,
    user: User,
    company_id: int,
    persona: Persona,
    user_message: str,
    session_id: str | None = None,
    locale: str = "es",
    hard_mode: bool = False,
    agent_definition: Any | None = None,
) -> Generator[dict[str, Any], None, None]:
    """Streaming variant of :func:`run_turn`.

    Yields event dicts as the agentic loop progresses:

        {"type": "start", "session_id": str}
        {"type": "tool_call_start", "tool": str, "args_summary": str}
        {"type": "tool_call_done", "tool": str, "status": str, "summary": str, "duration_ms": int}
        {"type": "receipt_created", "receipt_id": str, "tool": str, "summary": str}
        {"type": "text_delta", "delta": str}
        {"type": "final", "session_id": str, "ok": bool, "content": str,
         "tool_calls": list, "pending": list, "error": str | None}

    The key difference from ``run_turn``: the final LLM response is streamed
    token-by-token using the LLM provider's SSE endpoint, giving the consumer
    true incremental text as it is generated.
    """
    import time as _t

    u_id = user.id if hasattr(user, "id") else user

    # ── session row ───────────────────────────────────────────────────────
    session: AgentSession | None = None
    if session_id:
        session = _load_session(db, company_id, session_id, u_id)

    if session is None:
        session = _new_session(db, company_id=company_id, persona=persona, user_id=u_id)
    else:
        if session.company_id != company_id or session.persona != persona:
            yield {"type": "final", "ok": False, "error": "session_mismatch",
                   "session_id": session_id or "", "content": "", "tool_calls": [], "pending": []}
            return

    yield {"type": "start", "session_id": session.session_id}

    # Resolve allowed_tools from agent_definition
    allowed_tools_list: list[str] | None = None
    if agent_definition:
        allowed_tools_json = agent_definition.allowed_tools
        if isinstance(allowed_tools_json, str):
            allowed_tools_list = json.loads(allowed_tools_json) if allowed_tools_json else []

    # Capability flags
    boss_name = None
    if getattr(user, "delegates_for_user_id", None):
        boss = db.query(User).filter(User.id == user.delegates_for_user_id).first()
        if boss:
            boss_name = boss.full_name

    assigned_projects = [
        p.project_id for p in
        db.query(UserProjectAssignment).filter(UserProjectAssignment.user_id == u_id).all()
    ]

    ctx = AgentContext(
        db=db,
        company_id=company_id,
        user_id=u_id,
        user_email=getattr(user, "email", "unknown@example.com"),
        user_role=getattr(user, "role", "employee"),
        persona=persona,
        locale=locale,
        session_id=session.session_id,
        allowed_tools=allowed_tools_list,
        can_create_expenses=getattr(user, "can_create_expenses", True),
        can_access_accounting=getattr(user, "can_access_accounting", False),
        can_view_analytics=getattr(user, "can_view_analytics", False),
        is_amex_reconciler=getattr(user, "is_amex_reconciler", False),
        has_executive_reporting=getattr(user, "has_executive_reporting", False),
        delegates_for_user_id=getattr(user, "delegates_for_user_id", None),
        delegates_for_user_name=boss_name,
        assigned_project_ids=assigned_projects,
    )

    # ── executor closure — yields tool events ─────────────────────────────
    call_log: list[dict[str, Any]] = []
    pending:  list[dict[str, Any]] = []

    def executor(name: str, args: dict[str, Any]) -> str:
        started = _t.monotonic()

        # Emit tool_call_start event
        args_summary = json.dumps({k: (v if not isinstance(v, str) or len(v) < 40 else v[:37] + "...")
                                    for k, v in (args or {}).items()}, default=str)[:120]
        yield_event({"type": "tool_call_start", "tool": name, "args_summary": args_summary})

        result: ToolResult = REGISTRY.dispatch(name, args or {}, ctx)
        elapsed_ms = int((_t.monotonic() - started) * 1000)

        status = "ok" if result.ok else "error"
        if result.receipt_id:
            status = "pending_confirmation"
            pending.append({
                "receipt_id": result.receipt_id,
                "tool":       name,
                "summary":    result.summary,
            })
            yield_event({"type": "receipt_created", "receipt_id": result.receipt_id,
                         "tool": name, "summary": result.summary})

        audit_record(
            ctx, tool_name=name, args=args or {}, status=status,
            summary=result.summary, error=result.error, duration_ms=elapsed_ms,
        )
        call_log.append({
            "tool": name, "status": status,
            "summary": result.summary, "duration_ms": elapsed_ms,
        })

        # Emit tool_call_done event
        yield_event({
            "type": "tool_call_done", "tool": name, "status": status,
            "summary": result.summary, "duration_ms": elapsed_ms,
        })

        payload: dict[str, Any] = {"ok": result.ok, "summary": result.summary}
        if result.receipt_id:
            payload["receipt_id"] = result.receipt_id
        if result.data:
            payload["data"] = result.data
        if result.error:
            payload["error"] = result.error
        return json.dumps(payload, default=str)

    # ── Event queue for yielding from executor (called inside chat_with_tools) ─
    _event_queue: list[dict[str, Any]] = []

    def yield_event(event: dict[str, Any]) -> None:
        _event_queue.append(event)

    # ── build chat input ──────────────────────────────────────────────────
    history = _read_turns(session)
    history.append({"role": "user", "content": user_message})

    if agent_definition:
        system_prompt = agent_definition.system_prompt
        tools = [REGISTRY.get(t) for t in (allowed_tools_list or []) if REGISTRY.get(t)]
        tools = [t.to_ollama_tool() for t in tools]
    else:
        tools = REGISTRY.to_ollama_tools(persona)
        system_prompt = _system_prompt(
            persona, user, company_id, user_message=user_message, db=db,
        )

    resolved_provider = _resolve_provider(db, company_id)
    provider_name, chosen_model = select_model(tool_count=len(tools), hard_mode=hard_mode)

    if len(history) > 1:
        folded = "\n\n".join(
            f"[{t['role'].upper()}] {str(t['content'])[:500]}" for t in history[:-1]
        )
        prompt = f"Conversación previa:\n{folded}\n\n[USER] {user_message}"
    else:
        prompt = user_message

    # ── Run agentic loop ──────────────────────────────────────────────────
    turn_started = _t.monotonic()

    # We run the non-streaming agentic loop first to collect tool calls,
    # then stream the final text response. This gives us true token-by-token
    # streaming of the assistant's final reply while still capturing all
    # intermediate tool call events.
    #
    # Future optimization: replace chat_with_tools with a streaming variant
    # that yields tool_call events during the loop.

    if resolved_provider is not None:
        result = chat_with_tools_dynamic(
            system_prompt=system_prompt, user_prompt=prompt,
            tools=tools, tool_executor=executor,
            provider=resolved_provider, temperature=0.2,
            max_iterations=MAX_ITERATIONS,
        )
        chosen_model = resolved_provider.model
        provider_name = resolved_provider.kind
    else:
        with scoped_model(chosen_model):
            result = chat_with_tools(
                system_prompt=system_prompt, user_prompt=prompt,
                tools=tools, tool_executor=executor,
                temperature=0.2, max_iterations=MAX_ITERATIONS,
            )

    # Yield any queued tool events
    for evt in _event_queue:
        yield evt

    turn_ms = int((_t.monotonic() - turn_started) * 1000)

    content = (result or {}).get("content", "") or ""
    ok      = bool((result or {}).get("ok"))
    error   = (result or {}).get("error")

    history.append({"role": "assistant", "content": content})
    _write_turns(db, session, history)

    log_usage(
        db, company_id=company_id, session_id=session.session_id,
        user_id=user.id, persona=persona,
        model=(result or {}).get("model") or chosen_model,
        provider=provider_name, tool_count=len(tools),
        iterations=int((result or {}).get("iterations", 0) or 0),
        duration_ms=turn_ms, ok=ok,
    )

    # ── Stream the final content as text deltas ───────────────────────────
    # We already have the full content from the agentic loop above.
    # Chunk it into text_delta events for the SSE stream. This avoids
    # a second LLM call (the previous implementation re-invoked the LLM
    # just to get token-by-token streaming, doubling latency).
    for chunk in _chunk_text(content):
        yield {"type": "text_delta", "delta": chunk}

    yield {
        "type": "final",
        "session_id": session.session_id,
        "ok": ok,
        "content": content,
        "tool_calls": call_log,
        "pending": pending,
        "error": error,
    }


def _chunk_text(text: str, size: int = 60) -> list[str]:
    """Split text into chunks for streaming fallback."""
    if not text:
        return [""]
    chunks = [text[i:i + size] for i in range(0, len(text), size)]
    if len(chunks) == 1 and len(text) > 1:
        mid = max(1, len(text) // 2)
        return [text[:mid], text[mid:]]
    return chunks


def _get_provider():
    """Get the primary LLM provider from environment."""
    from apps.api.ai.ollama_client import _build_primary
    return _build_primary()
