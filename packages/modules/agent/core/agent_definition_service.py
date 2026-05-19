from __future__ import annotations

import json
import time
from typing import Any

from packages.modules.agent.models_definitions import AgentDefinition, ChannelAgentConfig


_CACHE: dict[str, Any] = {}
_CACHE_TTL = 60  # seconds


_DEFAULTS = [
    {
        "key": "orchestrator",
        "name": "Orchestrator",
        "description": "Routes incoming requests to the appropriate specialist agent.",
        "persona": "admin",
        "is_system": True,
        "allowed_tools": [],
        "system_prompt": (
            "You are the Financial Ops orchestrator. Your ONLY job is to classify which "
            "agent should handle the user's request.\n\n"
            "Available agents:\n{agent_list}\n\n"
            "Respond with ONLY valid JSON on a single line:\n"
            '{{"agent_key": "<key>", "confidence": <0.0-1.0>}}\n\n'
            "No explanation. No other text. If unsure, use agent_key \"config\" with low confidence."
        ),
    },
    {
        "key": "config",
        "name": "Configuration Agent",
        "description": "Company settings, module management, workflows, auth configuration.",
        "persona": "admin",
        "is_system": True,
        "allowed_tools": [
            "read_company_setup", "update_company_setup",
            "read_expense_policy", "update_expense_policy",
            "read_accounting_setup", "update_accounting_setup",
            "update_workflow",
            "list_accounting_categories", "create_accounting_category",
            "bulk_create_accounting_categories", "ingest_accounting_catalog",
            "check_tenant_readiness", "explain_module_requirements",
            "suggest_next_configuration_step",
            "list_users", "list_roles",
            "invite_user", "update_user", "deactivate_user", "reactivate_user",
            "send_announcement",
            "list_ai_policies", "create_ai_policy", "update_ai_policy", "toggle_ai_policy", "delete_ai_policy",
            "trace_workflow", "diagnose_config",
        ],
        "system_prompt": (
            "Eres el copiloto de configuración de la plataforma Financial Ops.\n"
            "Tu trabajo es ayudar al administrador a configurar, diagnosticar y mantener el sistema.\n\n"
            "ESTILO: Sé extremadamente conciso. Sin rodeos. Sin saludos ni cierres.\n"
            "Usa siempre las herramientas disponibles para leer datos o aplicar cambios.\n"
            "Responde siempre en español salvo que el usuario escriba en otro idioma."
        ),
    },
    {
        "key": "expense",
        "name": "Expense Agent",
        "description": "Expense intake, receipt validation, approval workflows, CFDI processing.",
        "persona": "employee",
        "is_system": True,
        "allowed_tools": [
            "create_expense", "check_reimbursement_status",
            "list_pending_approvals",
            "how_to", "search_knowledge",
        ],
        "system_prompt": (
            "Eres el asistente de gastos del portal de empleado.\n"
            "Ayudas a capturar gastos, validar recibos, consultar estados y reportes.\n\n"
            "FLUJO PRINCIPAL:\n"
            " - Crear gasto: create_expense (monto + descripción).\n"
            " - Ver mis gastos: check_reimbursement_status.\n"
            " - Ver pendientes de aprobación: list_pending_approvals.\n\n"
            "ESTILO: respuestas muy breves, en español claro. Sin preludios ni resúmenes.\n"
            "Una pregunta por turno si falta información. 'Listo.' cuando la tarea termine."
        ),
    },
    {
        "key": "accounting",
        "name": "Accounting Agent",
        "description": "Accounting categories, chart of accounts, export bundles, Poliza vouchers.",
        "persona": "accounting",
        "is_system": True,
        "allowed_tools": [
            "list_accounting_categories", "create_accounting_category",
            "bulk_create_accounting_categories",
            "generate_poliza_preview", "run_month_end",
            "find_missing_receipts", "match_cfdis_batch",
            "expense_validation",
            "read_accounting_setup", "read_expense_policy",
            "how_to", "search_knowledge",
            # Report Builder
            "build_expense_reports", "review_expense_report",
            "resolve_report_issue", "list_expense_reports",
            "preview_poliza",
        ],
        "system_prompt": (
            "Eres el copiloto contable de la plataforma Financial Ops.\n"
            "Tu trabajo es gestionar categorías contables, catálogos, exportaciones y pólizas.\n\n"
            "ESTILO: Sé extremadamente conciso. Usa las herramientas antes de responder.\n"
            "Responde siempre en español salvo que el usuario escriba en otro idioma."
        ),
    },
    {
        "key": "compliance",
        "name": "Compliance Agent",
        "description": "AI policies, governance rules, audit compliance, risk assessment.",
        "persona": "admin",
        "is_system": True,
        "allowed_tools": [
            "list_ai_policies", "create_ai_policy", "update_ai_policy",
            "toggle_ai_policy", "delete_ai_policy",
            "diagnose_config", "trace_workflow",
            "how_to", "search_knowledge",
        ],
        "system_prompt": (
            "Eres el agente de cumplimiento de la plataforma Financial Ops.\n"
            "Tu trabajo es gestionar políticas de IA, reglas de cumplimiento y auditorías.\n\n"
            "ESTILO: Sé extremadamente conciso. Una pregunta por turno si hay ambigüedad.\n"
            "Responde siempre en español salvo que el usuario escriba en otro idioma."
        ),
    },
    {
        "key": "email",
        "name": "Email Agent",
        "description": "Processes inbound emails autonomously. Handles expense submissions (attachments/NL), approvals, time tracking, and spend queries.",
        "persona": "employee",
        "is_system": True,
        "allowed_tools": [
            "create_expense", "create_expense_from_receipt", "list_my_expenses",
            "submit_expense", "check_reimbursement_status",
            "list_pending_approvals", "quick_approve", "quick_reject",
            "submit_time_entry", "list_time_projects", "my_week_summary",
            "spend_summary", "spend_by_project",
            "how_to", "search_knowledge",
        ],
        "system_prompt": (
            "Eres el asistente de Financial Ops por email. Ayudas con gastos, aprobaciones, horas y reportes.\n\n"
            "FLUJOS PRINCIPALES:\n"
            "- Gasto con adjunto: create_expense_from_receipt (incluye moneda, proveedor)\n"
            "- Gasto en texto: create_expense (monto + descripción)\n"
            "- Enviar borrador: submit_expense\n"
            "- Consultar mis gastos: list_my_expenses\n"
            "- Consultar reembolso: check_reimbursement_status\n"
            "- Aprobar gasto: quick_approve (solo managers)\n"
            "- Rechazar gasto: quick_reject (solo managers)\n"
            "- Pendientes de aprobación: list_pending_approvals\n"
            "- Registrar horas: submit_time_entry\n"
            "- Reporte de gastos: spend_summary, spend_by_project\n\n"
            "REGLAS:\n"
            "- Respuestas concisas y claras\n"
            "- Si el monto > $10,000 MXN o ambiguo, indica 'ESCALAR'\n"
            "- Idioma: responde en el idioma del remitente"
        ),
    },
    {
        "key": "whatsapp",
        "name": "WhatsApp Agent",
        "description": "Processes inbound WhatsApp messages autonomously. Handles expense submissions (photos/NL), approvals, time tracking, and spend queries.",
        "persona": "employee",
        "is_system": True,
        "allowed_tools": [
            "create_expense", "create_expense_from_receipt", "list_my_expenses",
            "submit_expense", "check_reimbursement_status",
            "list_pending_approvals", "quick_approve", "quick_reject",
            "submit_time_entry", "submit_time_week", "list_time_projects", "my_week_summary",
            "spend_summary", "spend_by_project", "time_report_summary",
            "how_to", "search_knowledge",
        ],
        "system_prompt": (
            "Eres el asistente de Financial Ops por WhatsApp. Responde en el idioma del usuario.\n\n"
            "ROL SEGÚN EL USUARIO:\n"
            "- Empleado: subir gastos (foto o texto), consultar reembolsos, registrar horas\n"
            "- Manager: todo lo anterior + aprobar/rechazar gastos, ver pendientes\n"
            "- Ejecutivo: todo lo anterior + reportes de gastos por proyecto/categoría/período\n\n"
            "HERRAMIENTAS POR ROL:\n"
            "- Todos: create_expense, create_expense_from_receipt, submit_expense, list_my_expenses,\n"
            "  check_reimbursement_status, submit_time_entry, submit_time_week, my_week_summary, how_to\n"
            "- Managers+: list_pending_approvals, quick_approve, quick_reject\n"
            "- Ejecutivos+: spend_summary, spend_by_project, time_report_summary\n\n"
            "REGLAS:\n"
            "- Respuestas MUY breves (máximo 3 líneas)\n"
            "- Monto > $10,000 MXN o ambiguo → indica ESCALAR\n"
            "- Manager con pendientes → muestra resumen proactivo\n"
            "- Ejecutivo pide números → responde con cifras exactas, no texto largo\n"
            "- Nunca inventes datos. Si no sabes, di que no tienes esa información."
        ),
    },
]


class AgentDefinitionService:

    def seed_defaults(self, db) -> None:
        """Idempotent: only inserts rows that don't exist yet."""
        existing_keys = {r.key for r in db.query(AgentDefinition.key).all()}
        for data in _DEFAULTS:
            if data["key"] not in existing_keys:
                row = AgentDefinition(
                    key=data["key"],
                    name=data["name"],
                    description=data.get("description"),
                    system_prompt=data["system_prompt"],
                    allowed_tools=json.dumps(data.get("allowed_tools", [])),
                    persona=data["persona"],
                    is_system=data["is_system"],
                )
                db.add(row)
        db.commit()

    def get_by_key(self, db, key: str) -> AgentDefinition | None:
        """Returns agent definition by key, using cache."""
        now = time.time()
        if key in _CACHE:
            val, expiry = _CACHE[key]
            if now < expiry:
                return val

        agent = db.query(AgentDefinition).filter_by(key=key).first()
        if agent:
            _CACHE[key] = (agent, now + _CACHE_TTL)
        return agent

    def upsert(self, db, data: dict) -> AgentDefinition:
        """Creates or updates an agent definition. Validates tools."""
        key = data.get("key")
        if not key:
            raise ValueError("Agent key is required")

        # Tool validation
        allowed_tools = data.get("allowed_tools", [])
        if isinstance(allowed_tools, str):
            allowed_tools = json.loads(allowed_tools)
        
        from packages.modules.agent.core.registry import REGISTRY
        for tool in allowed_tools:
            if tool not in REGISTRY._specs:
                raise ValueError(f"unknown tool: {tool}")

        agent = self.get_by_key(db, key)
        if agent:
            for k, v in data.items():
                setattr(agent, k, v)
        else:
            agent = AgentDefinition(
                key=key,
                name=data.get("name", "Unnamed Agent"),
                description=data.get("description"),
                system_prompt=data.get("system_prompt", ""),
                allowed_tools=json.dumps(allowed_tools),
                persona=data.get("persona", "admin"),
                is_system=data.get("is_system", False),
                is_active=data.get("is_active", True),
            )
            db.add(agent)
        
        db.commit_and_refresh(agent) if hasattr(db, "commit_and_refresh") else db.commit()
        # Invalidate cache
        _CACHE.pop(key, None)
        return agent

    def get_all(self, db) -> list[AgentDefinition]:
        """Return every agent definition, ordered by key."""
        return db.query(AgentDefinition).order_by(AgentDefinition.key).all()

    def toggle_active(self, db, key: str, is_active: bool) -> AgentDefinition:
        """Toggle the is_active flag on an agent definition."""
        agent = self.get_by_key(db, key)
        if not agent:
            raise ValueError("agent not found")
        agent.is_active = is_active
        db.commit()
        db.refresh(agent)
        _CACHE.pop(key, None)
        return agent

    def get_tool_list(self) -> list[dict]:
        """Return the names of every tool registered in the agent tool registry."""
        from packages.modules.agent.core.registry import REGISTRY
        return [
            {"name": s.name, "description": s.description, "category": s.category,
             "personas": sorted(list(s.personas)), "destructive": s.destructive}
            for s in REGISTRY._specs.values()
        ]

    def delete(self, db, key: str) -> None:
        """Deletes an agent. Raises ValueError if it's a system agent."""
        agent = self.get_by_key(db, key)
        if not agent:
            return
        if agent.is_system:
            raise ValueError("cannot delete system agent")

        db.delete(agent)
        db.commit()
        _CACHE.pop(key, None)


AGENT_DEF_SERVICE = AgentDefinitionService()
