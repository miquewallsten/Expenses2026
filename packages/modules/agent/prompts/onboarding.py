"""Onboarding-specific prompts for the admin copilot agent.

These prompts are injected into the system prompt when the user is in the
onboarding wizard, helping the AI understand the context and provide
better guidance.
"""

from __future__ import annotations

# Context injected when user is in onboarding wizard
ONBOARDING_CONTEXT_ES = """
CONTEXTO DE ONBOARDING:
El usuario está en el asistente de configuración inicial (onboarding).
Estás ayudando a configurar su empresa por primera vez.

Estados del onboarding:
- welcome: Bienvenida inicial
- company-type: Selección de tipo de empresa
- company-basics: Datos básicos (nombre, moneda, zona horaria)
- recommendations: Módulos recomendados
- smart-config: Resumen de configuración
- ready: Completado

REGLAS ESPECIALES DURANTE ONBOARDING:
1. Sé más amigable y paciente que de costumbre
2. Explica términos técnicos de forma simple
3. Ofrece recomendaciones específicas para el tipo de empresa
4. Una pregunta a la vez, espera respuesta
5. Celebra cuando el usuario completa un paso
6. Si el usuario parece confundido, ofrece ayuda específica

Cuando el usuario termina el onboarding, felicítalo brevemente y menciona
que estás disponible en el panel de administración para cualquier duda.
"""

# Quick help messages for each step
STEP_HELP_ES: dict[str, str] = {
    "welcome": "Dale la bienvenida y explica brevemente qué van a configurar.",
    "company-type": "Explica que elegir el tipo correcto ayuda a preconfigurar módulos relevantes.",
    "company-basics": "Los datos básicos se usan en facturas, reportes y configuraciones.",
    "recommendations": "Explica por qué cada módulo recomendado es útil para su tipo de empresa.",
    "smart-config": "La configuración se puede personalizar más tarde desde el panel de administración.",
    "ready": "Felicita por completar la configuración. Menciona los próximos pasos.",
}

# Module explanations for recommendations step
MODULE_EXPLANATIONS_ES: dict[str, str] = {
    "expenses": (
        "Gastos: Captura y gestión de gastos, reembolsos, aprobaciones. "
        "Soporta CFDI/XML, recibos, WhatsApp y email."
    ),
    "timesheets": (
        "Hojas de tiempo: Registro de horas por proyecto y actividad. "
        "Apropiado para empresas de servicios profesionales."
    ),
    "requests": (
        "Solicitudes de compra: Flujo de aprobación para compras. "
        "Presupuestos y seguimiento de solicitudes."
    ),
    "accounting": (
        "Contabilidad: Categorías contables, exportación a Poliza, "
        "integración con sistemas contables."
    ),
    "ai": (
        "Asistente IA: Categorización automática de gastos, OCR de recibos, "
        "detección de anomalías. Ahorra tiempo en tareas manuales."
    ),
}


def get_onboarding_context(current_step: str | None = None) -> str:
    """Get the onboarding context to inject into the system prompt."""
    base = ONBOARDING_CONTEXT_ES
    if current_step and current_step in STEP_HELP_ES:
        base += f"\n\nPaso actual: {current_step}\n{STEP_HELP_ES[current_step]}"
    return base


def get_module_explanation(module_key: str) -> str | None:
    """Get explanation for a specific module."""
    return MODULE_EXPLANATIONS_ES.get(module_key)