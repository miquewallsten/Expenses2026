"""Phase 8.7 — routing accuracy harness.

Drives 30+ Spanish prompts through the agent engine and asserts ≥85%
match against the expected tool name. Skipped by default — opt in by
setting ``RUN_AGENT_ROUTING_EVALS=1`` (requires a reachable Ollama).

The CI gate is wired separately via ``pytest -m eval``.
"""

from __future__ import annotations

import os

import pytest


_PROMPTS: list[tuple[str, str]] = [
    # admin / config tools
    ("¿Cómo configuro el archivo documental?",        "how_to"),
    ("Explícame cómo activar el módulo de Amex",      "how_to"),
    ("¿Dónde encuentro la guía de setup?",            "how_to"),
    # finance copilot
    ("Encuentra los gastos sin recibo de este mes",   "find_missing_receipts"),
    ("Lista los gastos aprobados sin documentos",     "find_missing_receipts"),
    ("¿Cuáles gastos están sin factura adjunta?",     "find_missing_receipts"),
    ("Empareja los CFDIs huérfanos con sus gastos",   "match_cfdis_batch"),
    ("Corre el match masivo de CFDIs",                "match_cfdis_batch"),
    ("Vincula facturas pendientes",                   "match_cfdis_batch"),
    ("Genera la póliza para el gasto 42",             "generate_poliza_preview"),
    ("Muéstrame la previsualización contable del 7",  "generate_poliza_preview"),
    ("Simula la póliza del gasto 99",                 "generate_poliza_preview"),
    ("Corre el cierre mensual",                       "run_month_end"),
    ("Quiero un resumen del cierre del mes",          "run_month_end"),
    ("Dame el reporte de fin de mes",                 "run_month_end"),
    # ai policy
    ("Lista las políticas de IA",                     "list_ai_policies"),
    ("¿Qué políticas de IA tenemos?",                 "list_ai_policies"),
    ("Crea una nueva política de IA",                 "create_ai_policy"),
    ("Activa la política X",                          "toggle_ai_policy"),
    ("Borra la política Y",                           "delete_ai_policy"),
    # workflow
    ("Crea una etapa de aprobación nueva",            "upsert_workflow_stage"),
    ("Modifica la transición de submitted a approved","upsert_workflow_transition"),
    ("Elimina la transición rechazada",               "delete_workflow_transition"),
    # storage / archive
    ("Lee la configuración de almacenamiento",        "read_storage_config"),
    ("Actualiza la config de archivado",              "update_archive_config"),
    ("¿Cómo está configurado el archivo?",            "read_archive_config"),
    # rbac (if available)
    ("Lista los usuarios admin",                      "rbac"),
    # memory
    ("Recuerda que prefiero CFDIs por correo",        "memory"),
    # ingestion / search
    ("Busca facturas con el RFC ABCD000101XYZ",       "search"),
    ("Encuentra el gasto del 15 de febrero",          "search"),
    ("Sube este recibo al sistema",                   "ingestion"),
]


@pytest.mark.skipif(
    os.getenv("RUN_AGENT_ROUTING_EVALS") != "1",
    reason="routing accuracy requires a live LLM; opt in via RUN_AGENT_ROUTING_EVALS=1",
)
def test_routing_accuracy_threshold(db_session, test_company):
    """Soft assertion harness — runs only when explicitly enabled.

    Asserts that ≥85% of prompts result in a tool call whose name *contains*
    one of the expected substrings. Loose match keeps the harness stable
    across minor tool renames.
    """
    from packages.modules.agent.core.context import AgentContext
    from packages.modules.agent.core.engine import run_turn
    from packages.modules.agent.tools import registry_all  # noqa: F401

    hits = 0
    total = len(_PROMPTS)
    misses: list[tuple[str, str, list[str]]] = []

    class _U:
        id = 1
        email = "admin@evals.com"
        full_name = "Admin"
        company_id = test_company.id
        role = "admin"

    for prompt, expected in _PROMPTS:
        result = run_turn(
            db=db_session, user=_U(), company_id=test_company.id,
            persona="admin", user_message=prompt,
        )
        called = [tc.get("tool", "") for tc in result.get("tool_calls", [])]
        if any(expected in name for name in called):
            hits += 1
        else:
            misses.append((prompt, expected, called))

    accuracy = hits / total
    assert accuracy >= 0.85, (
        f"routing accuracy {accuracy:.0%} below 85% gate "
        f"({hits}/{total} hits). Misses: {misses[:5]}"
    )


def test_routing_dataset_has_30_plus_prompts():
    """Plan target: ≥30 routing prompts."""
    assert len(_PROMPTS) >= 30
