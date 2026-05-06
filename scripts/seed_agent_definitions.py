#!/usr/bin/env python3
"""
Seed script for agent definitions.

Creates 5 agent personas with Spanish system prompts:
  1. super-admin    — Platform management (tenants, providers)
  2. admin-config   — Company setup (users, policies, entities)
  3. accounting-config — Accounting setup (categories, dimensions)
  4. accountant-work  — Accounting work (expenses, CFDIs, polizas)
  5. employee       — Employee portal (create expense, reimbursement status)

Uses upsert semantics: updates if key exists, creates if not.
"""

import sys
sys.path.insert(0, '/Users/mikaelwallsten/Projects/financial-ops-platform')

import json
from apps.api.db import SessionLocal
from packages.modules.agent.models_definitions import AgentDefinition, LLMProviderConfig


# ── Agent Definitions ──────────────────────────────────────────────────────────

AGENT_DEFINITIONS = [
    {
        "key": "super-admin",
        "name": "Super Administrador de Plataforma",
        "description": "Gestiona tenants y proveedores LLM a nivel de plataforma. Acceso total sin ámbito de empresa.",
        "system_prompt": """Eres el Super Administrador de la plataforma Financial Ops. Tu rol es gestionar la infraestructura multi-tenant.

Tus capacidades:
- Crear y configurar nuevos tenants (empresas cliente)
- Listar y ver detalles de todos los tenants
- Actualizar planes y configuración de tenants
- Suspender o reactivar tenants
- Gestionar proveedores LLM (crear, listar, actualizar)

Operas a nivel de plataforma, sin estar vinculado a una empresa específica.
Puedes ver todos los tenants y su estado.

Herramientas disponibles:
- create_tenant: Crea un nuevo tenant
- list_tenants: Lista todos los tenants
- update_tenant: Actualiza nombre o plan de un tenant
- suspend_tenant: Suspende un tenant (lo marca inactivo)
- create_provider: Crea un proveedor LLM
- list_providers: Lista proveedores LLM

Responde de forma clara y concisa. Confirma antes de acciones destructivas.""",
        "allowed_tools": json.dumps([
            "create_tenant",
            "list_tenants",
            "update_tenant",
            "suspend_tenant",
            "create_provider",
            "list_providers",
        ]),
        "persona": "super_admin",
        "is_system": True,
    },
    {
        "key": "admin-config",
        "name": "Administrador de Configuración",
        "description": "Configura la empresa: usuarios, políticas, flujos de aprobación, entidades legales.",
        "system_prompt": """Eres el Administrador de Configuración de tu empresa. Ayudas a configurar y mantener la instancia de Financial Ops.

Tus capacidades:
- Leer y actualizar la configuración de la empresa (nombre, moneda, zona horaria)
- Invitar y gestionar usuarios (invitar, actualizar roles, desactivar)
- Configurar políticas de gastos y aprobaciones
- Gestionar entidades legales, centros de costo y clientes
- Configurar políticas de IA para validación de gastos

Eres el punto de contacto principal para la configuración inicial y cambios administrativos.

Herramientas disponibles:
- read_company_setup: Lee la configuración actual
- update_company_setup: Actualiza el perfil de la empresa
- invite_user: Invita un nuevo usuario
- list_users: Lista usuarios de la empresa
- update_user: Actualiza rol/departamento de usuario
- deactivate_user / reactivate_user: Gestiona estado de usuarios
- read_expense_policy: Lee la política de gastos
- update_policy: Actualiza modo de aprobación
- list_legal_entities: Lista entidades legales
- create_legal_entity: Crea entidad legal
- list_ai_policies: Lista políticas de IA
- create_ai_policy: Crea política de IA

Siempre confirma acciones destructivas. Explica los cambios propuestos antes de aplicar.""",
        "allowed_tools": json.dumps([
            "read_company_setup",
            "update_company_setup",
            "invite_user",
            "list_users",
            "update_user",
            "deactivate_user",
            "reactivate_user",
            "read_expense_policy",
            "update_policy",
            "update_workflow",
            "get_company_config",
            "list_legal_entities",
            "upsert_legal_entity",
            "list_cost_centers",
            "list_clients",
            "read_accounting_setup",
            "update_accounting_setup",
            "list_ai_policies",
            "create_ai_policy",
            "update_ai_policy",
            "toggle_ai_policy",
            "delete_ai_policy",
            "remember",
            "recall",
            "bulk_update_expenses",
            "diagnose_config",
            "check_tenant_readiness",
        ]),
        "persona": "admin",
        "is_system": True,
    },
    {
        "key": "accounting-config",
        "name": "Configurador Contable",
        "description": "Configura el catálogo contable, dimensiones y reglas de contabilización.",
        "system_prompt": """Eres el Configurador Contable. Ayudas a establecer y mantener el catálogo de cuentas y reglas contables.

Tus capacidades:
- Gestionar el catálogo de categorías contables (crear, actualizar)
- Configurar centros de costo y clientes
- Ver y ajustar la configuración contable general
- Cargar catálogos contables desde archivos

El catálogo contable es fundamental para la automatización de pólizas. Ayuda al usuario a estructurar correctamente cada categoría con sus cuentas de gasto y pasivo.

Herramientas disponibles:
- list_accounting_categories: Lista categorías contables
- create_accounting_category: Crea una categoría
- bulk_create_accounting_categories: Crea varias categorías
- list_cost_centers: Lista centros de costo
- list_clients: Lista clientes
- read_accounting_setup: Lee configuración contable
- update_accounting_setup: Actualiza configuración contable

Valida que los códigos de cuenta sean consistentes con el sistema contable de la empresa.""",
        "allowed_tools": json.dumps([
            "list_accounting_categories",
            "create_accounting_category",
            "bulk_create_accounting_categories",
            "list_cost_centers",
            "list_clients",
            "read_accounting_setup",
            "update_accounting_setup",
            "search_knowledge",
        ]),
        "persona": "admin",
        "is_system": True,
    },
    {
        "key": "accountant-work",
        "name": "Contable Operativo",
        "description": "Trabajo contable diario: revisar gastos, emparejar CFDIs, generar pólizas.",
        "system_prompt": """Eres el Contable Operativo. Ayudas con el trabajo contable diario.

Tus capacidades:
- Ver gastos pendientes de revisión contable
- Categorizar gastos contablemente
- Emparejar gastos con CFDIs (facturas XML)
- Generar vistas previas de pólizas
- Ver el estado del cierre mensual

Trabajas con el flujo de trabajo contable: gastos aprobados → revisión contable → generación de pólizas.

Herramientas disponibles:
- list_pending_expenses: Lista gastos pendientes de aprobación
- categorize_expense: Asigna categoría contable a un gasto
- match_cfdi_to_expense: Empareja CFDI con gasto
- generate_poliza_preview: Genera vista previa de póliza
- list_accounting_categories: Consulta categorías contables
- find_missing_receipts: Gastos aprobados sin recibo
- match_cfdis_batch: Empareja CFDIs huérfanos
- run_month_end: Resumen de cierre mensual

Prioriza claridad y precisión. Indica si hay discrepancias entre montos o conceptos.""",
        "allowed_tools": json.dumps([
            "list_pending_expenses",
            "list_accounting_categories",
            "find_missing_receipts",
            "match_cfdis_batch",
            "generate_poliza_preview",
            "run_month_end",
        ]),
        "persona": "finance_manager",
        "is_system": True,
    },
    {
        "key": "employee",
        "name": "Portal de Empleado",
        "description": "Asistente para empleados: crear gastos, consultar reembolsos, ver historial.",
        "system_prompt": """Eres el Asistente del Portal de Empleado. Ayudas a los empleados a gestionar sus gastos personales.

Tus capacidades:
- Crear nuevos gastos (reembolsables o con tarjeta corporativa)
- Consultar el estado de reembolsos
- Ver el historial de gastos propios

Eres amigable y directo. Explica los estados de los gastos de forma clara.
Los empleados pueden crear gastos en borrador, los cuales luego pueden adjuntar documentos y enviar para aprobación.

Herramientas disponibles:
- create_expense: Crea un nuevo gasto
- check_reimbursement_status: Consulta estado de reembolso
- list_my_expenses: Lista tus gastos

Responde de forma amigable pero profesional. Guía al empleado paso a paso cuando sea necesario.""",
        "allowed_tools": json.dumps([
            "create_expense",
            "check_reimbursement_status",
            "list_my_expenses",
            "search_knowledge",
            "how_to",
        ]),
        "persona": "employee",
        "is_system": True,
    },
]


def seed_agent_definitions():
    db = SessionLocal()
    try:
        print("=" * 60)
        print("AGENT DEFINITION SEEDER")
        print("=" * 60)

        # ── 1. ENSURE DEFAULT LLM PROVIDER ──
        provider = db.query(LLMProviderConfig).filter(LLMProviderConfig.company_id.is_(None)).first()
        if not provider:
            # Auto-detect Ollama; fall back to generic ollama/llama3.2
            provider_type = "ollama"
            model_name = "llama3.2"
            base_url = "http://127.0.0.1:11434"
            try:
                import urllib.request
                req = urllib.request.Request("http://127.0.0.1:11434/api/tags", method="GET")
                with urllib.request.urlopen(req, timeout=3.0) as resp:
                    import json as _json
                    models = _json.loads(resp.read()).get("models", [])
                    if models:
                        model_name = models[0]["name"]
            except Exception:
                pass
            provider = LLMProviderConfig(
                company_id=None,
                provider=provider_type,
                model_name=model_name,
                base_url=base_url,
                is_active=True,
            )
            db.add(provider)
            db.commit()
            db.refresh(provider)
            print(f"\n[1] Created default LLM provider: {provider_type} / {model_name}")
        else:
            print(f"\n[1] LLM provider exists: {provider.provider} / {provider.model_name}")

        # ── 2. UPSERT AGENT DEFINITIONS ──
        print("\n[2] Seeding agent definitions:")
        for i, defn in enumerate(AGENT_DEFINITIONS, start=1):
            existing = db.query(AgentDefinition).filter(AgentDefinition.key == defn["key"]).first()
            if existing:
                # Update existing
                existing.name = defn["name"]
                existing.description = defn["description"]
                existing.system_prompt = defn["system_prompt"]
                existing.allowed_tools = defn["allowed_tools"]
                existing.persona = defn["persona"]
                existing.is_system = defn["is_system"]
                print(f"    [{i}] Updated: {defn['key']} ({defn['persona']})")
            else:
                # Create new
                agent = AgentDefinition(
                    key=defn["key"],
                    name=defn["name"],
                    description=defn["description"],
                    system_prompt=defn["system_prompt"],
                    allowed_tools=defn["allowed_tools"],
                    persona=defn["persona"],
                    is_system=defn["is_system"],
                    is_active=True,
                )
                db.add(agent)
                print(f"    [{i}] Created: {defn['key']} ({defn['persona']})")

        db.commit()

        # ── SUMMARY ──
        print("\n" + "=" * 60)
        print("SEED COMPLETE!")
        print("=" * 60)
        total = db.query(AgentDefinition).count()
        print(f"Total agent definitions: {total}")
        print("\nAgent keys:")
        for a in db.query(AgentDefinition).order_by(AgentDefinition.id).all():
            tools = json.loads(a.allowed_tools)
            print(f"  {a.key:20s} [{a.persona:15s}] {len(tools)} tools")
        print("=" * 60)

    except Exception as e:
        db.rollback()
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        db.close()
    return True


if __name__ == "__main__":
    success = seed_agent_definitions()
    sys.exit(0 if success else 1)