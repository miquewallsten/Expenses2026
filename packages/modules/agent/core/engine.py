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

from apps.api.ai.ollama_client import chat_with_tools
from packages.core.platform.models_user import User

from ..models import AgentSession
from .audit import record as audit_record
from .context import AgentContext, Persona
from .knowledge import render_for_prompt, search_knowledge
from .memory import list_memories_for_prompt
from .registry import REGISTRY, ToolResult
from .routing import scoped_model, select_model
from .usage import log_usage


_log = logging.getLogger(__name__)

MAX_SESSION_TURNS = 40
MAX_ITERATIONS    = 6


# ── Session persistence ─────────────────────────────────────────────────────

def _load_session(db, company_id: int, session_id: str) -> AgentSession | None:
    return (
        db.query(AgentSession)
        .filter(
            AgentSession.session_id == session_id,
            AgentSession.company_id == company_id,
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
        "\n"
        "DÓNDE ESTÁN LOS DATOS (mapa obligatorio antes de decir 'no sé'):\n"
        " - RFC, razón social, régimen fiscal, país, moneda de emisor → list_legal_entities\n"
        " - Nombre de la empresa, idioma, zona horaria, tamaño → read_company_setup\n"
        " - Política de gastos (XML, tickets, aprobaciones) → read_expense_policy\n"
        " - Configuración contable → read_accounting_setup\n"
        " - Categorías contables → list_accounting_categories\n"
        " - Políticas de IA existentes → list_ai_policies\n"
        " - Usuarios y roles → list_users / list_roles\n"
        " - Si el usuario pregunta por algún dato fiscal o de configuración ya existente,\n"
        "   llama primero a la herramienta de lectura correspondiente y responde con el valor real.\n"
        "\n"
        "CÓMO CREAR COSAS (usa la vía inline por defecto — pide CSV solo si el admin lo menciona):\n"
        " - Una sola categoría contable → create_accounting_category (code, name, cuentas, tax_behavior).\n"
        " - Varias categorías dictadas o pegadas en el chat → bulk_create_accounting_categories con la lista inline.\n"
        " - Archivo (CSV/Excel/PDF) con categorías → ingest_accounting_catalog(file_id) tras /agent/upload.\n"
        " - Usuarios individuales → create_user. Roster completo por archivo → ingest_user_roster.\n"
        " - Proyectos / clientes / centros de costo → tools 'org' inline; archivos vía ingest_*.\n"
        " - Ajustes de política (XML, tickets, etc.) → update_expense_policy; NO crees políticas IA\n"
        "   que dupliquen un ajuste existente: revisa read_expense_policy primero.\n"
        " - Para onboarding paso a paso NUNCA preguntes 'tienes un CSV' como primera opción;\n"
        "   ofrece siempre: (1) dictarlas ahora, (2) subir archivo. La (1) usa bulk_create_accounting_categories.\n"
        "\n"
        "POLÍTICAS DE IA (fully-agentic — sin flujo fijo):\n"
        " - Antes de proponer algo: list_ai_policies + read_expense_policy para no duplicar.\n"
        " - Las instrucciones del admin pueden ser ambiguas, contradictorias (p. ej. 'bloquear\n"
        "   y también advertir la misma factura'), mezclar varias reglas, o usar campos que\n"
        "   necesitan mapeo SAT. En ese caso conversa: haz UNA pregunta corta a la vez hasta\n"
        "   que tú y el admin tengan la misma interpretación. No inventes. No emitas reglas\n"
        "   a medias. No uses formatos JSON visibles — sólo prosa corta.\n"
        " - Cuando la interpretación esté clara, llama a create_ai_policy con una sola frase\n"
        "   final en español formal (que será el source_text guardado). El servicio valida y\n"
        "   genera rule_json; si falla, te devolverá el error y podrás ajustar el texto.\n"
        " - Si el admin quiere editar/eliminar/activar/desactivar: update_ai_policy,\n"
        "   delete_ai_policy, toggle_ai_policy.\n"
        " - Si la regla equivale a un ajuste ya existente (p. ej. xml_required_mode), avisa\n"
        "   al admin y sugiere cambiar el ajuste con update_expense_policy en vez de crear\n"
        "   una política duplicada.\n"
    ),
    "employee": (
        "Eres el asistente del portal de empleado. Ayudas a capturar gastos, consultar estados y reportes.\n"
        "No tienes permiso para modificar configuración del sistema ni datos de otras personas.\n"
        "\n"
        "ESTILO: respuestas muy breves, en español claro. Sin preludios ni resuménes. Una pregunta\n"
        "por turno si falta información. 'Listo.' cuando la tarea termine."
    ),
    "procurement": (
        "Eres el asistente del módulo de solicitudes y compras.\n"
        "Solo puedes consultar y preparar datos; cualquier aprobación requiere confirmación humana.\n"
        "\n"
        "ESTILO: respuestas muy breves en español. Sin preludios ni resuménes. Una pregunta\n"
        "por turno si falta información. 'Listo.' cuando la tarea termine."
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
    parts: list[str] = [
        base,
        (
            f"Contexto del usuario: id={user.id}, email={user.email}, rol={user.role}, "
            f"empresa={company_id}."
        ),
    ]
    # Inject top-k relevant knowledge chunks based on the current user turn.
    chunks = search_knowledge(user_message, k=5) if user_message else []
    if chunks:
        parts.append(render_for_prompt(chunks))
    # Inject recent memories (facts/preferences/decisions) for this company.
    if db is not None:
        mem = list_memories_for_prompt(db, company_id=company_id, user_id=user.id, limit=8)
        if mem:
            parts.append(mem)
    return "\n\n".join(parts)


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
    # ── session row ───────────────────────────────────────────────────────
    session: AgentSession | None = None
    if session_id:
        session = _load_session(db, company_id, session_id)
    if session is None:
        session = _new_session(db, company_id=company_id, persona=persona, user_id=user.id)
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

    ctx = AgentContext(
        db=db,
        company_id=company_id,
        user_id=user.id,
        user_email=user.email,
        user_role=user.role,
        persona=persona,
        locale=locale,
        session_id=session.session_id,
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

    tools = REGISTRY.to_ollama_tools(persona)
    provider, chosen_model = select_model(tool_count=len(tools), hard_mode=hard_mode)

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
    with scoped_model(chosen_model):
        result = chat_with_tools(
            system_prompt=_system_prompt(
                persona, user, company_id, user_message=user_message, db=db,
            ),
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
        provider=provider,
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
