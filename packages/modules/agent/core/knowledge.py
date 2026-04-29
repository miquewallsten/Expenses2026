"""Knowledge pack loader + keyword retrieval.

Loads the YAML files under ``packages/modules/agent/knowledge/`` once at
import time and exposes two functions:

* :func:`search_knowledge(query, k)` — returns up to ``k`` relevant chunks,
  ranked by simple keyword/synonym match. No embeddings required.
* :func:`render_for_prompt(chunks)` — turns chunks into compact Spanish text
  to inject into the system prompt.

Chunks are dict-shaped::

    {
        "source":  "domain|modules|settings|workflows",
        "key":     "<stable id>",
        "title":   "<short human-readable title>",
        "body":    "<terse text, <300 chars>",
        "tags":    ["word", "phrases", ...],
    }
"""

from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path
from typing import Any, Iterable

import yaml


_KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "knowledge"


# ── Loaders ─────────────────────────────────────────────────────────────────

def _load_yaml(name: str) -> dict[str, Any]:
    path = _KNOWLEDGE_DIR / name
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _chunks_from_domain(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, e in (data.get("entities") or {}).items():
        body_parts = [
            f"{e.get('name_es', key)} — {e.get('purpose', '')}".strip(" —"),
        ]
        if e.get("lifecycle"):
            body_parts.append(f"Ciclo: {e['lifecycle']}")
        if e.get("key_fields"):
            body_parts.append(f"Campos: {', '.join(e['key_fields'])}")
        if e.get("invariants"):
            body_parts.append("Invariantes: " + "; ".join(e["invariants"]))
        if e.get("glossary"):
            body_parts.append(" ".join(e["glossary"]))
        out.append({
            "source": "domain",
            "key": key,
            "title": e.get("name_es", key),
            "body": " · ".join(p for p in body_parts if p),
            "tags": [key, (e.get("name_es") or "").lower(), (e.get("name_en") or "").lower()],
        })
    for r in (data.get("roles_and_capabilities") or []):
        out.append({
            "source": "domain",
            "key": f"role:{r['role']}",
            "title": f"Rol {r['role']}",
            "body": f"{r['role']} puede: {', '.join(r.get('can', []))}.",
            "tags": ["rol", "permisos", r["role"]],
        })
    return out


def _chunks_from_modules(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for flag, m in (data.get("modules") or {}).items():
        body = m.get("description", "")
        if m.get("enables"):
            body += " Habilita: " + ", ".join(m["enables"]) + "."
        if m.get("depends_on"):
            body += f" Depende de: {m['depends_on']}."
        body += f" Por defecto: {m.get('default')}."
        out.append({
            "source": "modules",
            "key": flag,
            "title": m.get("name_es", flag),
            "body": body,
            "tags": [flag, (m.get("name_es") or "").lower(), "módulo", "flag"],
        })
    return out


def _chunks_from_settings(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for s in (data.get("settings") or []):
        bits = [s.get("description") or ""]
        if "valid" in s:
            bits.append(f"Valores: {', '.join(map(str, s['valid']))}.")
        if "valid_range" in s:
            bits.append(f"Rango: {s['valid_range'][0]}–{s['valid_range'][1]}.")
        if "default" in s:
            bits.append(f"Predeterminado: {s['default']}.")
        if s.get("depends_on"):
            bits.append(f"Depende de: {s['depends_on']}.")
        if s.get("notes"):
            bits.append(s["notes"])
        out.append({
            "source": "settings",
            "key": s["key"],
            "title": s.get("name_es", s["key"]),
            "body": " ".join(b for b in bits if b).strip(),
            "tags": [s["key"], (s.get("name_es") or "").lower()],
        })
    return out


def _chunks_from_workflows(data: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, f in (data.get("flows") or {}).items():
        body_parts = []
        if f.get("stages"):
            body_parts.append("Etapas: " + " → ".join(f["stages"]))
        if f.get("steps"):
            body_parts.append("Pasos: " + "; ".join(f["steps"]))
        if f.get("rules"):
            body_parts.append("Reglas: " + "; ".join(f["rules"]))
        if f.get("requires_flag"):
            body_parts.append(f"Requiere flag: {f['requires_flag']}.")
        out.append({
            "source": "workflows",
            "key": key,
            "title": f.get("name_es", key),
            "body": " · ".join(body_parts),
            "tags": [key, (f.get("name_es") or "").lower(), "flujo"],
        })
    return out


@lru_cache(maxsize=1)
def _all_chunks() -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    chunks += _chunks_from_domain(_load_yaml("domain.yaml"))
    chunks += _chunks_from_modules(_load_yaml("modules.yaml"))
    chunks += _chunks_from_settings(_load_yaml("settings-index.yaml"))
    chunks += _chunks_from_workflows(_load_yaml("workflows.yaml"))
    return chunks


# ── Search ──────────────────────────────────────────────────────────────────

_TOKEN_RE = re.compile(r"[a-zA-Z0-9_áéíóúñü]+", re.UNICODE)

# Spanish-English synonym hints. Words on the same row are treated as aliases.
_SYNONYMS: list[set[str]] = [
    {"gasto", "expense", "gastos", "expenses"},
    {"cfdi", "comprobante", "factura", "xml"},
    {"poliza", "póliza", "voucher", "polizas"},
    {"aprobacion", "aprobación", "approval", "aprobar"},
    {"flujo", "workflow", "proceso"},
    {"categoria", "categoría", "category", "cuenta"},
    {"proyecto", "project"},
    {"cliente", "client"},
    {"usuario", "user", "empleado", "employee"},
    {"rol", "role", "permiso", "permission"},
    {"modulo", "módulo", "module", "flag", "activar", "habilitar"},
    {"configurar", "configuración", "configuration", "setting", "ajuste"},
    {"ciclo", "reporte", "cycle", "report"},
    {"archivo", "archive", "storage", "almacenamiento"},
    {"whatsapp", "correo", "email", "canal", "channel"},
    {"auth", "autenticación", "login", "magiclink", "sso"},
]


def _expand_tokens(text: str) -> set[str]:
    base = {m.group(0).lower() for m in _TOKEN_RE.finditer(text)}
    expanded = set(base)
    for group in _SYNONYMS:
        if base & group:
            expanded |= group
    return expanded


def _score(chunk: dict[str, Any], q_tokens: set[str]) -> int:
    hay = set()
    for field in ("title", "body"):
        hay |= {m.group(0).lower() for m in _TOKEN_RE.finditer(chunk.get(field) or "")}
    hay |= {t.lower() for t in (chunk.get("tags") or []) if t}
    score = len(q_tokens & hay)
    # Light boost if the query matches the title directly.
    title_tokens = {m.group(0).lower() for m in _TOKEN_RE.finditer(chunk.get("title") or "")}
    score += len(q_tokens & title_tokens)
    return score


def search_knowledge(query: str, k: int = 5) -> list[dict[str, Any]]:
    if not query or not query.strip():
        return []
    q = _expand_tokens(query)
    scored = [(_score(c, q), c) for c in _all_chunks()]
    scored = [(s, c) for s, c in scored if s > 0]
    scored.sort(key=lambda t: t[0], reverse=True)
    return [c for _, c in scored[:max(1, k)]]


def hybrid_search_knowledge(
    db: Any,
    company_id: int,
    query: str,
    k: int = 5,
) -> list[dict[str, Any]]:
    """Try vector search first; fall back to static YAML keyword matching."""
    if not query or not query.strip():
        return []

    if db is not None:
        try:
            from packages.modules.agent.service.knowledge_service import (
                search_knowledge as _vec_search,
            )
            vec_results = _vec_search(
                db,
                company_id=company_id,
                query_text=query,
                k=k,
                min_score=0.55,
            )
            if vec_results:
                out: list[dict[str, Any]] = []
                for r in vec_results:
                    out.append({
                        "source": r.get("source_type") or "vector",
                        "key": str(r.get("id", "")),
                        "title": r.get("title", ""),
                        "body": r.get("body", ""),
                        "tags": [],
                        "score": r.get("score", 0),
                    })
                return out
        except Exception:
            pass

    return search_knowledge(query, k=k)


def get_chunk(key: str) -> dict[str, Any] | None:
    for c in _all_chunks():
        if c["key"] == key:
            return c
    return None


def list_chunks(source: str | None = None) -> list[dict[str, Any]]:
    if source is None:
        return list(_all_chunks())
    return [c for c in _all_chunks() if c["source"] == source]


def render_for_prompt(chunks: Iterable[dict[str, Any]]) -> str:
    """Compact Spanish block to inject into the system prompt."""
    lines = ["Conocimiento del producto (usa solo lo relevante):"]
    for c in chunks:
        lines.append(f"- {c['title']}: {c['body']}")
    return "\n".join(lines)


def reload_cache() -> None:
    """Drop the cached knowledge — useful for tests after editing YAML."""
    _all_chunks.cache_clear()
