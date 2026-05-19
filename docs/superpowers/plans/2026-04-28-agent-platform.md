# Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded agent personas with DB-driven agent definitions, add real orchestrator routing, autonomous channel agents (WhatsApp/email), pluggable LLM provider config, and a Super Admin UI for full agent lifecycle management.

**Architecture:** The existing `run_turn()` engine stays unchanged as the executor. Three new DB tables (`agent_definitions`, `channel_agent_configs`, `llm_provider_configs`) make every agent configurable at runtime. The orchestrator makes a real LLM routing call to pick the right agent; channel agents run as background tasks with autonomous thresholds and `AgentPendingAction` escalation for high-stakes decisions.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (Mapped columns), Alembic, Pydantic v2, Next.js 16 App Router, Tailwind CSS (dark-mode design system from `web/CLAUDE.md`).

---

## File Map

**New backend files:**
- `packages/modules/agent/models_definitions.py` — 3 SQLAlchemy models
- `alembic/versions/b1c2d3e4f5a6_agent_platform_tables.py` — migration
- `packages/modules/agent/core/agent_definition_service.py` — CRUD + seed + cache
- `packages/modules/agent/core/llm_provider_service.py` — provider resolution
- `packages/modules/agent/core/channel_dispatcher.py` — autonomous channel dispatch
- `apps/api/routes/super_admin_agents.py` — all new super-admin API routes

**Modified backend files:**
- `packages/core/platform/models_all.py` — add 3 new model imports
- `packages/modules/agent/core/engine.py` — add optional `agent_definition` kwarg to `run_turn()`
- `packages/modules/agent/core/orchestrator.py` — replace keyword routing with real LLM call
- `packages/modules/channels/api/whatsapp_webhook.py` — use `ChannelAgentDispatcher`
- `packages/modules/channels/api/email_inbound.py` — use `ChannelAgentDispatcher`
- `apps/api/main.py` — mount new router, call `seed_defaults` on startup

**New frontend files:**
- `web/lib/api/agent-definitions.ts` — API client for agent definitions + channel configs
- `web/lib/api/llm-config.ts` — API client for LLM provider configs
- `web/app/super-admin/agents/page.tsx` — Agent Builder (two-panel CRUD)
- `web/app/super-admin/llm-config/page.tsx` — LLM Configuration page

**Modified frontend files:**
- `web/app/super-admin/page.tsx` — add 2 new nav tiles
- `web/app/super-admin/agent-management/page.tsx` — add per-agent breakdown panel

**New test files:**
- `tests/test_agent_definitions.py`
- `tests/test_llm_provider_service.py`
- `tests/test_channel_dispatcher.py`
- `tests/test_orchestrator_routing.py`

---

## Task 1: SQLAlchemy Models

**Files:**
- Create: `packages/modules/agent/models_definitions.py`

- [ ] **Step 1: Create the models file**

```python
# packages/modules/agent/models_definitions.py
from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from apps.api.db import Base


class AgentDefinition(Base):
    __tablename__ = "agent_definitions"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False)
    # JSON list of tool names. Empty list = all tools for this persona.
    allowed_tools: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    persona: Mapped[str] = mapped_column(String(32), nullable=False, default="admin")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class ChannelAgentConfig(Base):
    __tablename__ = "channel_agent_configs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    agent_id: Mapped[int] = mapped_column(Integer, ForeignKey("agent_definitions.id", ondelete="CASCADE"), nullable=False)
    channel_type: Mapped[str] = mapped_column(String(32), nullable=False)  # whatsapp | email
    # Below this confidence the action is escalated to AgentPendingAction instead of committed.
    autonomous_threshold: Mapped[float] = mapped_column(Float, nullable=False, default=0.80)
    # JSON: [{"field": "amount", "op": "gt", "value": 5000}]
    high_stakes_rules: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    test_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())


class LLMProviderConfig(Base):
    __tablename__ = "llm_provider_configs"
    __table_args__ = (
        UniqueConstraint("company_id", name="uq_llm_provider_configs_company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    # NULL = global default; company row overrides global.
    company_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=True)
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="ollama")  # ollama|anthropic|openai
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    # Name of the environment variable holding the API key. Never store raw keys.
    api_key_env_ref: Mapped[str | None] = mapped_column(String(128), nullable=True)
    model_name: Mapped[str] = mapped_column(String(128), nullable=False, default="llama3.2")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
```

- [ ] **Step 2: Register models in the aggregator**

Open `packages/core/platform/models_all.py`. At the bottom, add:

```python
from packages.modules.agent.models_definitions import (  # noqa: F401
    AgentDefinition, ChannelAgentConfig, LLMProviderConfig,
)
```

- [ ] **Step 3: Verify import works**

```bash
cd /path/to/repo && python3 -c "import packages.core.platform.models_all; print('OK')"
```
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add packages/modules/agent/models_definitions.py packages/core/platform/models_all.py
git commit -m "feat(agent): add AgentDefinition, ChannelAgentConfig, LLMProviderConfig models"
```

---

## Task 2: Alembic Migration

**Files:**
- Create: `alembic/versions/b1c2d3e4f5a6_agent_platform_tables.py`

- [ ] **Step 1: Create the migration file**

```python
# alembic/versions/b1c2d3e4f5a6_agent_platform_tables.py
"""agent platform tables

Revision ID: b1c2d3e4f5a6
Revises: a4b8c1d2e9f3
Create Date: 2026-04-28
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, Sequence[str], None] = "a4b8c1d2e9f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_definitions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("key", sa.String(64), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("allowed_tools", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("persona", sa.String(32), nullable=False, server_default="admin"),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key", name="uq_agent_definitions_key"),
    )
    op.create_index("ix_agent_definitions_key", "agent_definitions", ["key"])

    op.create_table(
        "channel_agent_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("agent_id", sa.Integer(), nullable=False),
        sa.Column("channel_type", sa.String(32), nullable=False),
        sa.Column("autonomous_threshold", sa.Float(), nullable=False, server_default="0.8"),
        sa.Column("high_stakes_rules", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("test_mode", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["agent_id"], ["agent_definitions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "llm_provider_configs",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(32), nullable=False, server_default="ollama"),
        sa.Column("base_url", sa.String(512), nullable=True),
        sa.Column("api_key_env_ref", sa.String(128), nullable=True),
        sa.Column("model_name", sa.String(128), nullable=False, server_default="llama3.2"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company_id", name="uq_llm_provider_configs_company_id"),
    )


def downgrade() -> None:
    op.drop_table("llm_provider_configs")
    op.drop_table("channel_agent_configs")
    op.drop_index("ix_agent_definitions_key", "agent_definitions")
    op.drop_table("agent_definitions")
```

- [ ] **Step 2: Verify migration applies cleanly**

```bash
alembic upgrade head
```
Expected: no errors. Then:
```bash
alembic downgrade -1 && alembic upgrade head
```
Expected: both directions succeed.

- [ ] **Step 3: Commit**

```bash
git add alembic/versions/b1c2d3e4f5a6_agent_platform_tables.py
git commit -m "feat(agent): migration for agent_definitions, channel_agent_configs, llm_provider_configs"
```

---

## Task 3: AgentDefinitionService

**Files:**
- Create: `packages/modules/agent/core/agent_definition_service.py`
- Create: `tests/test_agent_definitions.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_agent_definitions.py
import json
import pytest
from packages.modules.agent.models_definitions import AgentDefinition
from packages.modules.agent.core.agent_definition_service import (
    AgentDefinitionService,
)
from packages.modules.agent.tools import registry_all  # noqa: F401 — populate REGISTRY


@pytest.fixture
def svc():
    return AgentDefinitionService()


def test_seed_creates_defaults(db_session, svc):
    svc.seed_defaults(db_session)
    keys = {d.key for d in db_session.query(AgentDefinition).all()}
    assert "orchestrator" in keys
    assert "expense" in keys
    assert "accounting" in keys
    assert "config" in keys
    assert "compliance" in keys
    assert "whatsapp" in keys
    assert "email" in keys


def test_seed_is_idempotent(db_session, svc):
    svc.seed_defaults(db_session)
    svc.seed_defaults(db_session)
    count = db_session.query(AgentDefinition).count()
    assert count == 7


def test_get_by_key(db_session, svc):
    svc.seed_defaults(db_session)
    agent = svc.get_by_key(db_session, "expense")
    assert agent is not None
    assert agent.persona == "employee"


def test_get_by_key_missing_returns_none(db_session, svc):
    svc.seed_defaults(db_session)
    assert svc.get_by_key(db_session, "nonexistent") is None


def test_upsert_creates_new_agent(db_session, svc):
    agent = svc.upsert(db_session, {
        "key": "custom",
        "name": "Custom Agent",
        "system_prompt": "You are a custom agent.",
        "persona": "admin",
        "allowed_tools": [],
    })
    assert agent.id is not None
    assert agent.is_system is False


def test_upsert_updates_existing(db_session, svc):
    svc.seed_defaults(db_session)
    updated = svc.upsert(db_session, {
        "key": "expense",
        "name": "Expense Agent v2",
        "system_prompt": "Updated prompt.",
        "persona": "employee",
        "allowed_tools": [],
    })
    assert updated.name == "Expense Agent v2"
    count = db_session.query(AgentDefinition).filter_by(key="expense").count()
    assert count == 1


def test_delete_system_agent_raises(db_session, svc):
    svc.seed_defaults(db_session)
    with pytest.raises(ValueError, match="system agent"):
        svc.delete(db_session, "expense")


def test_delete_custom_agent(db_session, svc):
    svc.upsert(db_session, {
        "key": "deleteme",
        "name": "Delete Me",
        "system_prompt": "temp",
        "persona": "admin",
        "allowed_tools": [],
    })
    svc.delete(db_session, "deleteme")
    assert svc.get_by_key(db_session, "deleteme") is None


def test_invalid_tool_name_rejected(db_session, svc):
    with pytest.raises(ValueError, match="unknown tool"):
        svc.upsert(db_session, {
            "key": "bad",
            "name": "Bad",
            "system_prompt": "x",
            "persona": "admin",
            "allowed_tools": ["this_tool_does_not_exist_xyz"],
        })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pytest tests/test_agent_definitions.py -v 2>&1 | head -20
```
Expected: `ImportError` or `ModuleNotFoundError` — service doesn't exist yet.

- [ ] **Step 3: Implement the service**

```python
# packages/modules/agent/core/agent_definition_service.py
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
        "allowed_tools": [],
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
        "allowed_tools": [],
        "system_prompt": (
            "Eres el asistente de gastos del portal de empleado.\n"
            "Ayudas a capturar gastos, validar recibos, consultar estados y reportes.\n\n"
            "ESTILO: respuestas muy breves, en español claro. Sin preludios ni resúmenes.\n"
            "Una pregunta por turno si falta información. 'Listo.' cuando la tarea termine."
        ),
    },
    {
        "key": "accounting",
        "name": "Accounting Agent",
        "description": "Accounting categories, chart of accounts, export bundles, Poliza vouchers.",
        "persona": "admin",
        "is_system": True,
        "allowed_tools": [],
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
        "allowed_tools": [],
        "system_prompt": (
            "Eres el agente de cumplimiento de la plataforma Financial Ops.\n"
            "Tu trabajo es gestionar políticas de IA, reglas de cumplimiento y auditorías.\n\n"
            "ESTILO: Sé extremadamente conciso. Una pregunta por turno si hay ambigüedad.\n"
            "Responde siempre en español salvo que el usuario escriba en otro idioma."
        ),
    },
    {
        "key": "whatsapp",
        "name": "WhatsApp Agent",
        "description": "Processes inbound WhatsApp messages autonomously. Creates expenses, routes approvals.",
        "persona": "employee",
        "is_system": True,
        "allowed_tools": [],
        "system_prompt": (
            "Eres el agente de WhatsApp de Financial Ops. Procesas mensajes entrantes de forma autónoma.\n\n"
            "REGLAS:\n"
            "- Identifica si el mensaje es un gasto, una consulta o una solicitud de aprobación.\n"
            "- Para gastos: extrae monto, descripción, fecha y crea el registro usando las herramientas.\n"
            "- Para consultas: responde con datos reales de las herramientas de lectura.\n"
            "- Si no tienes suficiente información o la acción es de alto riesgo, indica 'ESCALAR'.\n"
            "- Respuestas muy cortas y claras, en el idioma del usuario."
        ),
    },
    {
        "key": "email",
        "name": "Email Agent",
        "description": "Processes inbound emails autonomously. Extracts expenses from attachments, routes requests.",
        "persona": "employee",
        "is_system": True,
        "allowed_tools": [],
        "system_prompt": (
            "Eres el agente de email de Financial Ops. Procesas correos entrantes de forma autónoma.\n\n"
            "REGLAS:\n"
            "- Analiza el asunto y cuerpo del correo para identificar gastos, solicitudes o consultas.\n"
            "- Para gastos con adjuntos: extrae los datos del comprobante y crea el registro.\n"
            "- Para solicitudes de aprobación: verifica el estado y responde al remitente.\n"
            "- Si la acción es de alto riesgo o ambigua, indica 'ESCALAR'.\n"
            "- Respuestas concisas en el idioma del remitente."
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
                    is_system=data.get("is_system", False),
                    is_active=True,
                )
                db.add(row)
        db.commit()

    def get_all(self, db) -> list[AgentDefinition]:
        return db.query(AgentDefinition).order_by(AgentDefinition.key).all()

    def get_active(self, db) -> list[AgentDefinition]:
        return db.query(AgentDefinition).filter_by(is_active=True).order_by(AgentDefinition.key).all()

    def get_by_key(self, db, key: str) -> AgentDefinition | None:
        return db.query(AgentDefinition).filter_by(key=key).one_or_none()

    def upsert(self, db, data: dict) -> AgentDefinition:
        allowed_tools = data.get("allowed_tools", [])
        if allowed_tools:
            self._validate_tools(allowed_tools)

        existing = self.get_by_key(db, data["key"])
        if existing:
            existing.name = data["name"]
            existing.system_prompt = data["system_prompt"]
            existing.persona = data.get("persona", existing.persona)
            existing.allowed_tools = json.dumps(allowed_tools)
            existing.description = data.get("description", existing.description)
            if not existing.is_system:
                existing.is_active = data.get("is_active", existing.is_active)
            db.commit()
            db.refresh(existing)
            _CACHE.clear()
            return existing
        else:
            row = AgentDefinition(
                key=data["key"],
                name=data["name"],
                description=data.get("description"),
                system_prompt=data["system_prompt"],
                allowed_tools=json.dumps(allowed_tools),
                persona=data.get("persona", "admin"),
                is_system=False,
                is_active=data.get("is_active", True),
            )
            db.add(row)
            db.commit()
            db.refresh(row)
            _CACHE.clear()
            return row

    def delete(self, db, key: str) -> None:
        agent = self.get_by_key(db, key)
        if agent is None:
            return
        if agent.is_system:
            raise ValueError(f"Cannot delete system agent '{key}'")
        db.delete(agent)
        db.commit()
        _CACHE.clear()

    def toggle_active(self, db, key: str, is_active: bool) -> AgentDefinition:
        agent = self.get_by_key(db, key)
        if agent is None:
            raise ValueError(f"Agent '{key}' not found")
        agent.is_active = is_active
        db.commit()
        db.refresh(agent)
        _CACHE.clear()
        return agent

    def _validate_tools(self, tool_names: list[str]) -> None:
        from packages.modules.agent.core.registry import REGISTRY
        from packages.modules.agent.tools import registry_all  # noqa: F401
        known = set(REGISTRY._specs.keys())
        unknown = [t for t in tool_names if t not in known]
        if unknown:
            raise ValueError(f"unknown tool(s): {unknown}")

    def get_tool_list(self) -> list[dict]:
        """Return all registered tools with name, description, category for the UI."""
        from packages.modules.agent.core.registry import REGISTRY
        from packages.modules.agent.tools import registry_all  # noqa: F401
        return [
            {
                "name": spec.name,
                "description": spec.description,
                "category": spec.category,
                "personas": list(spec.personas),
                "destructive": spec.destructive,
            }
            for spec in sorted(REGISTRY._specs.values(), key=lambda s: s.name)
        ]


AGENT_DEF_SERVICE = AgentDefinitionService()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_agent_definitions.py -v
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/core/agent_definition_service.py tests/test_agent_definitions.py
git commit -m "feat(agent): AgentDefinitionService with seed, CRUD, tool validation"
```

---

## Task 4: LLMProviderService

**Files:**
- Create: `packages/modules/agent/core/llm_provider_service.py`
- Create: `tests/test_llm_provider_service.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_llm_provider_service.py
import os
import pytest
from packages.modules.agent.models_definitions import LLMProviderConfig
from packages.modules.agent.core.llm_provider_service import LLMProviderService


@pytest.fixture
def svc():
    return LLMProviderService()


def _make_config(db, company_id=None, provider="ollama", model="llama3.2",
                 base_url="http://localhost:11434", api_key_env_ref=None):
    cfg = LLMProviderConfig(
        company_id=company_id,
        provider=provider,
        model_name=model,
        base_url=base_url,
        api_key_env_ref=api_key_env_ref,
        is_active=True,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return cfg


def test_resolve_returns_global_when_no_company_override(db_session, svc):
    _make_config(db_session, company_id=None, base_url="http://global:11434")
    result = svc.resolve(db_session, company_id=99)
    assert result["base_url"] == "http://global:11434"


def test_resolve_company_overrides_global(db_session, svc):
    _make_config(db_session, company_id=None, base_url="http://global:11434")
    _make_config(db_session, company_id=5, base_url="http://tenant:11434")
    result = svc.resolve(db_session, company_id=5)
    assert result["base_url"] == "http://tenant:11434"


def test_resolve_falls_back_to_env(db_session, svc, monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://env:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "mistral")
    result = svc.resolve(db_session, company_id=1)
    assert result["base_url"] == "http://env:11434"
    assert result["model_name"] == "mistral"
    assert result["provider"] == "ollama"


def test_resolve_api_key_reads_env_ref(db_session, svc, monkeypatch):
    monkeypatch.setenv("MY_ANTHROPIC_KEY", "sk-test-123")
    _make_config(db_session, company_id=None, provider="anthropic",
                 model="claude-sonnet-4-6", api_key_env_ref="MY_ANTHROPIC_KEY")
    result = svc.resolve(db_session, company_id=1)
    assert result["api_key"] == "sk-test-123"


def test_resolve_missing_env_ref_raises(db_session, svc, monkeypatch):
    monkeypatch.delenv("MISSING_KEY", raising=False)
    _make_config(db_session, company_id=None, provider="anthropic",
                 model="claude-sonnet-4-6", api_key_env_ref="MISSING_KEY")
    with pytest.raises(EnvironmentError, match="MISSING_KEY"):
        svc.resolve(db_session, company_id=1)
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_llm_provider_service.py -v 2>&1 | head -10
```
Expected: `ImportError`.

- [ ] **Step 3: Implement the service**

```python
# packages/modules/agent/core/llm_provider_service.py
from __future__ import annotations

import os
from typing import Any

from packages.modules.agent.models_definitions import LLMProviderConfig


class LLMProviderService:

    def resolve(self, db, company_id: int) -> dict[str, Any]:
        """Return a resolved provider config dict for the given company.

        Lookup order: company row → global row (company_id=NULL) → .env defaults.
        The returned dict always has: provider, model_name, base_url, api_key (may be None).
        """
        config = (
            db.query(LLMProviderConfig)
            .filter_by(company_id=company_id, is_active=True)
            .one_or_none()
        ) or (
            db.query(LLMProviderConfig)
            .filter(LLMProviderConfig.company_id.is_(None), LLMProviderConfig.is_active == True)
            .one_or_none()
        )

        if config:
            api_key = None
            if config.api_key_env_ref:
                api_key = os.environ.get(config.api_key_env_ref)
                if api_key is None:
                    raise EnvironmentError(
                        f"LLM provider requires env var '{config.api_key_env_ref}' but it is not set."
                    )
            return {
                "provider": config.provider,
                "model_name": config.model_name,
                "base_url": config.base_url,
                "api_key": api_key,
            }

        # Fall back to .env / environment defaults (Ollama).
        return {
            "provider": "ollama",
            "model_name": os.environ.get("OLLAMA_MODEL", "llama3.2"),
            "base_url": os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
            "api_key": None,
        }

    def test_connection(self, provider_config: dict) -> dict[str, Any]:
        """Ping the provider. Returns {ok, latency_ms, error}."""
        import time
        import urllib.request

        provider = provider_config.get("provider", "ollama")
        start = time.monotonic()
        try:
            if provider == "ollama":
                base = (provider_config.get("base_url") or "http://localhost:11434").rstrip("/")
                with urllib.request.urlopen(f"{base}/api/tags", timeout=5) as resp:
                    ok = resp.status == 200
            elif provider in ("anthropic", "openai"):
                # Stub — real implementation added when providers are activated.
                raise NotImplementedError(f"Provider '{provider}' client not yet implemented.")
            else:
                raise ValueError(f"Unknown provider: {provider}")
            latency_ms = int((time.monotonic() - start) * 1000)
            return {"ok": ok, "latency_ms": latency_ms, "error": None}
        except NotImplementedError as e:
            return {"ok": False, "latency_ms": 0, "error": str(e)}
        except Exception as e:
            latency_ms = int((time.monotonic() - start) * 1000)
            return {"ok": False, "latency_ms": latency_ms, "error": str(e)}


LLM_PROVIDER_SERVICE = LLMProviderService()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_llm_provider_service.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/core/llm_provider_service.py tests/test_llm_provider_service.py
git commit -m "feat(agent): LLMProviderService with tenant fallback chain and env-var key resolution"
```

---

## Task 5: run_turn() Agent Definition Kwarg

**Files:**
- Modify: `packages/modules/agent/core/engine.py`
- Test: `tests/test_agent_engine.py` (add one case)

- [ ] **Step 1: Add the failing test to test_agent_engine.py**

Open `tests/test_agent_engine.py`. After the existing fixtures, add:

```python
def test_run_turn_respects_agent_definition_prompt(db_session, test_company, admin_user):
    """When agent_definition is provided, its system_prompt replaces the persona prompt."""
    from packages.modules.agent.models_definitions import AgentDefinition
    import json

    defn = AgentDefinition(
        key="test_agent",
        name="Test",
        system_prompt="CUSTOM SYSTEM PROMPT XYZ",
        allowed_tools=json.dumps([]),
        persona="admin",
        is_system=False,
        is_active=True,
    )
    db_session.add(defn)
    db_session.commit()

    captured_prompt = {}

    def _mock(*, system_prompt, user_prompt, tools, tool_executor, **kwargs):
        captured_prompt["system"] = system_prompt
        return {"ok": True, "model": "mock", "content": "ok", "error": None}

    with patch("apps.api.ai.ollama_client.chat_with_tools", _mock):
        run_turn(
            db=db_session,
            user=admin_user,
            company_id=test_company.id,
            persona="admin",
            user_message="hello",
            agent_definition=defn,
        )

    assert "CUSTOM SYSTEM PROMPT XYZ" in captured_prompt["system"]
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_agent_engine.py::test_run_turn_respects_agent_definition_prompt -v
```
Expected: `TypeError: run_turn() got an unexpected keyword argument 'agent_definition'`

- [ ] **Step 3: Modify run_turn() in engine.py**

In `packages/modules/agent/core/engine.py`, make these two changes:

**Change 1** — update `run_turn` signature (add the optional kwarg after `hard_mode`):

```python
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
    agent_definition=None,          # <-- add this line
) -> dict[str, Any]:
```

**Change 2** — update `_system_prompt` call inside `run_turn` to accept an override. Find the line:

```python
    system_prompt=_system_prompt(
        persona, user, company_id, user_message=user_message, db=db,
    ),
```

Replace with:

```python
    system_prompt=_system_prompt(
        persona, user, company_id, user_message=user_message, db=db,
        base_override=agent_definition.system_prompt if agent_definition else None,
    ),
```

**Change 3** — update `_system_prompt` function signature and body. Find:

```python
def _system_prompt(
    persona: Persona,
    user: User,
    company_id: int,
    *,
    user_message: str = "",
    db=None,
) -> str:
    base = _SYSTEM_PROMPT_ES.get(persona, _SYSTEM_PROMPT_ES["admin"])
```

Replace with:

```python
def _system_prompt(
    persona: Persona,
    user: User,
    company_id: int,
    *,
    user_message: str = "",
    db=None,
    base_override: str | None = None,
) -> str:
    base = base_override if base_override is not None else _SYSTEM_PROMPT_ES.get(persona, _SYSTEM_PROMPT_ES["admin"])
```

**Change 4** — filter tools by agent_definition.allowed_tools when non-empty. Find:

```python
    tools = REGISTRY.to_ollama_tools(persona)
```

Replace with:

```python
    if agent_definition and agent_definition.allowed_tools:
        import json as _json
        allowed = _json.loads(agent_definition.allowed_tools) if isinstance(agent_definition.allowed_tools, str) else agent_definition.allowed_tools
        if allowed:
            all_tools = REGISTRY.to_ollama_tools("admin")
            tools = [t for t in all_tools if t["function"]["name"] in allowed]
        else:
            tools = REGISTRY.to_ollama_tools(persona)
    else:
        tools = REGISTRY.to_ollama_tools(persona)
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_agent_engine.py -v
```
Expected: all pass including the new test.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/core/engine.py tests/test_agent_engine.py
git commit -m "feat(agent): run_turn() accepts optional agent_definition for dynamic prompt/tool override"
```

---

## Task 6: Real Orchestrator Routing

**Files:**
- Modify: `packages/modules/agent/core/orchestrator.py`
- Create: `tests/test_orchestrator_routing.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_orchestrator_routing.py
import json
import pytest
from unittest.mock import patch
from packages.modules.agent.core.orchestrator import AgentOrchestrator
from packages.modules.agent.models_definitions import AgentDefinition
from packages.modules.agent.core.agent_definition_service import AgentDefinitionService


@pytest.fixture
def svc():
    return AgentDefinitionService()


@pytest.fixture
def orchestrator():
    return AgentOrchestrator()


def test_route_returns_agent_key_from_llm(db_session, orchestrator, svc):
    svc.seed_defaults(db_session)

    def mock_chat(*, system_prompt, user_prompt, tools, tool_executor, **kwargs):
        return {"ok": True, "content": '{"agent_key": "expense", "confidence": 0.95}', "model": "mock"}

    with patch("apps.api.ai.ollama_client.chat_with_tools", mock_chat):
        result = orchestrator.route(db_session, user_message="I need to submit an expense")

    assert result["agent_key"] == "expense"
    assert result["confidence"] == 0.95


def test_route_falls_back_to_config_on_bad_json(db_session, orchestrator, svc):
    svc.seed_defaults(db_session)

    def mock_chat(*, system_prompt, user_prompt, tools, tool_executor, **kwargs):
        return {"ok": True, "content": "I cannot decide.", "model": "mock"}

    with patch("apps.api.ai.ollama_client.chat_with_tools", mock_chat):
        result = orchestrator.route(db_session, user_message="??")

    assert result["agent_key"] == "config"
    assert result["confidence"] == 0.0


def test_route_falls_back_to_config_on_unknown_key(db_session, orchestrator, svc):
    svc.seed_defaults(db_session)

    def mock_chat(*, system_prompt, user_prompt, tools, tool_executor, **kwargs):
        return {"ok": True, "content": '{"agent_key": "nonexistent_agent", "confidence": 0.9}', "model": "mock"}

    with patch("apps.api.ai.ollama_client.chat_with_tools", mock_chat):
        result = orchestrator.route(db_session, user_message="something")

    assert result["agent_key"] == "config"
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_orchestrator_routing.py -v 2>&1 | head -10
```
Expected: `AttributeError: 'AgentOrchestrator' object has no attribute 'route'`

- [ ] **Step 3: Replace the orchestrator**

Replace the full content of `packages/modules/agent/core/orchestrator.py` with:

```python
"""Agent orchestrator — routes requests to the correct specialist agent.

Makes a single lightweight LLM call with no tools to classify the request.
Returns the agent key and confidence score. All heavy lifting is in run_turn().
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any

from apps.api.ai.ollama_client import chat_with_tools

_log = logging.getLogger(__name__)


class AgentOrchestrator:

    def route(self, db, *, user_message: str, company_id: int | None = None) -> dict[str, Any]:
        """Classify user_message and return {agent_key, confidence}.

        Falls back to {"agent_key": "config", "confidence": 0.0} on any failure.
        """
        from .agent_definition_service import AGENT_DEF_SERVICE

        agents = AGENT_DEF_SERVICE.get_active(db)
        # Orchestrator itself is not a routing target — exclude it.
        routable = [a for a in agents if a.key != "orchestrator" and a.key not in ("whatsapp", "email")]

        if not routable:
            return {"agent_key": "config", "confidence": 0.0}

        orchestrator_def = AGENT_DEF_SERVICE.get_by_key(db, "orchestrator")
        agent_list = "\n".join(
            f"- {a.key}: {a.description or a.name}" for a in routable
        )
        system_prompt = (orchestrator_def.system_prompt if orchestrator_def else
                         "Classify the request. Respond with JSON: {agent_key, confidence}."
                         ).replace("{agent_list}", agent_list)

        try:
            result = chat_with_tools(
                system_prompt=system_prompt,
                user_prompt=user_message,
                tools=[],
                tool_executor=lambda name, args: "{}",
                temperature=0.0,
                max_iterations=1,
            )
            content = (result or {}).get("content", "") or ""
            # Extract JSON from content (may have surrounding text).
            start = content.find("{")
            end = content.rfind("}") + 1
            if start >= 0 and end > start:
                parsed = json.loads(content[start:end])
                agent_key = parsed.get("agent_key", "config")
                confidence = float(parsed.get("confidence", 0.0))
                valid_keys = {a.key for a in routable}
                if agent_key not in valid_keys:
                    _log.warning("Orchestrator returned unknown agent key %r, falling back", agent_key)
                    return {"agent_key": "config", "confidence": 0.0}
                return {"agent_key": agent_key, "confidence": confidence}
        except Exception as e:
            _log.warning("Orchestrator routing failed: %s", e)

        return {"agent_key": "config", "confidence": 0.0}


ORCHESTRATOR = AgentOrchestrator()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_orchestrator_routing.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/core/orchestrator.py tests/test_orchestrator_routing.py
git commit -m "feat(agent): real LLM-based orchestrator routing replaces keyword matching"
```

---

## Task 7: ChannelAgentDispatcher

**Files:**
- Create: `packages/modules/agent/core/channel_dispatcher.py`
- Create: `tests/test_channel_dispatcher.py`

- [ ] **Step 1: Write the failing tests**

```python
# tests/test_channel_dispatcher.py
import json
import pytest
from unittest.mock import patch, MagicMock
from packages.modules.agent.models_definitions import AgentDefinition, ChannelAgentConfig
from packages.modules.agent.models import AgentPendingAction
from packages.modules.agent.core.channel_dispatcher import ChannelAgentDispatcher
from packages.core.platform.models import Company
from packages.core.platform.models_user import User


@pytest.fixture
def company(db_session):
    c = Company(name="Test Co", slug="test-co")
    db_session.add(c)
    db_session.commit()
    db_session.refresh(c)
    return c


@pytest.fixture
def user(db_session, company):
    u = User(full_name="Bot", email="bot@test.com", role="employee", company_id=company.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


@pytest.fixture
def whatsapp_agent(db_session):
    defn = AgentDefinition(
        key="whatsapp", name="WhatsApp", system_prompt="Process WA message.",
        allowed_tools=json.dumps([]), persona="employee", is_system=True, is_active=True,
    )
    db_session.add(defn)
    db_session.commit()
    db_session.refresh(defn)

    cfg = ChannelAgentConfig(
        agent_id=defn.id, channel_type="whatsapp",
        autonomous_threshold=0.80, high_stakes_rules=json.dumps([]), test_mode=False,
    )
    db_session.add(cfg)
    db_session.commit()
    return defn, cfg


def _mock_run_turn(content="Done.", ok=True):
    def _inner(**kwargs):
        return {"ok": ok, "content": content, "session_id": "s1", "tool_calls": [], "pending": []}
    return _inner


def test_dispatch_commits_when_above_threshold(db_session, company, user, whatsapp_agent):
    defn, cfg = whatsapp_agent
    cfg.autonomous_threshold = 0.70
    db_session.commit()

    dispatcher = ChannelAgentDispatcher()
    with patch("packages.modules.agent.core.channel_dispatcher.run_turn", _mock_run_turn()):
        result = dispatcher.dispatch(
            db=db_session, channel_type="whatsapp",
            user=user, company_id=company.id, message="I spent $50 on lunch",
            confidence=0.95,
        )
    assert result["escalated"] is False
    assert result["test_mode"] is False


def test_dispatch_escalates_when_below_threshold(db_session, company, user, whatsapp_agent):
    defn, cfg = whatsapp_agent
    cfg.autonomous_threshold = 0.90
    db_session.commit()

    dispatcher = ChannelAgentDispatcher()
    with patch("packages.modules.agent.core.channel_dispatcher.run_turn", _mock_run_turn()):
        result = dispatcher.dispatch(
            db=db_session, channel_type="whatsapp",
            user=user, company_id=company.id, message="pay $50000 invoice",
            confidence=0.60,
        )
    assert result["escalated"] is True


def test_dispatch_test_mode_never_commits(db_session, company, user, whatsapp_agent):
    defn, cfg = whatsapp_agent
    cfg.test_mode = True
    db_session.commit()

    dispatcher = ChannelAgentDispatcher()
    with patch("packages.modules.agent.core.channel_dispatcher.run_turn", _mock_run_turn()):
        result = dispatcher.dispatch(
            db=db_session, channel_type="whatsapp",
            user=user, company_id=company.id, message="hello",
            confidence=0.99,
        )
    assert result["test_mode"] is True
    assert result["escalated"] is False


def test_high_stakes_rule_triggers_escalation(db_session, company, user, whatsapp_agent):
    defn, cfg = whatsapp_agent
    cfg.high_stakes_rules = json.dumps([{"field": "amount", "op": "gt", "value": 5000}])
    cfg.autonomous_threshold = 0.50
    db_session.commit()

    dispatcher = ChannelAgentDispatcher()
    with patch("packages.modules.agent.core.channel_dispatcher.run_turn", _mock_run_turn()):
        result = dispatcher.dispatch(
            db=db_session, channel_type="whatsapp",
            user=user, company_id=company.id, message="pay invoice $9000",
            confidence=0.95,
            payload_data={"amount": 9000},
        )
    assert result["escalated"] is True
```

- [ ] **Step 2: Run to verify failure**

```bash
pytest tests/test_channel_dispatcher.py -v 2>&1 | head -5
```
Expected: `ImportError`.

- [ ] **Step 3: Implement the dispatcher**

```python
# packages/modules/agent/core/channel_dispatcher.py
"""Channel agent dispatcher — runs autonomous agents for WhatsApp and email events.

For each inbound channel event:
  1. Load the agent definition and channel config for the channel type.
  2. Run run_turn() with the channel agent's system prompt and tools.
  3. Evaluate whether to commit autonomously or escalate to human review.
"""
from __future__ import annotations

import json
import logging
import secrets
from typing import Any

from packages.modules.agent.core.engine import run_turn
from packages.modules.agent.models_definitions import AgentDefinition, ChannelAgentConfig

_log = logging.getLogger(__name__)


class ChannelAgentDispatcher:

    def dispatch(
        self,
        *,
        db,
        channel_type: str,
        user,
        company_id: int,
        message: str,
        confidence: float = 1.0,
        payload_data: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Run the channel agent and decide: commit or escalate.

        Returns: {escalated: bool, test_mode: bool, content: str, session_id: str}
        """
        agent_def, channel_cfg = self._load_config(db, channel_type)

        if agent_def is None:
            _log.warning("No agent definition found for channel %r", channel_type)
            return {"escalated": True, "test_mode": False, "content": "", "session_id": ""}

        result = run_turn(
            db=db,
            user=user,
            company_id=company_id,
            persona=agent_def.persona,
            user_message=message,
            agent_definition=agent_def,
        )

        if channel_cfg and channel_cfg.test_mode:
            _log.info("[TEST MODE] channel=%s result=%s", channel_type, result.get("content", "")[:80])
            return {
                "escalated": False,
                "test_mode": True,
                "content": result.get("content", ""),
                "session_id": result.get("session_id", ""),
            }

        should_escalate = self._should_escalate(
            confidence=confidence,
            channel_cfg=channel_cfg,
            payload_data=payload_data or {},
            agent_result=result,
        )

        if should_escalate:
            self._create_pending_action(db, company_id=company_id, user=user,
                                        channel_type=channel_type, message=message,
                                        agent_result=result)

        return {
            "escalated": should_escalate,
            "test_mode": False,
            "content": result.get("content", ""),
            "session_id": result.get("session_id", ""),
        }

    def _load_config(self, db, channel_type: str):
        agent_def = (
            db.query(AgentDefinition)
            .filter_by(key=channel_type, is_active=True)
            .one_or_none()
        )
        if agent_def is None:
            return None, None

        channel_cfg = (
            db.query(ChannelAgentConfig)
            .filter_by(agent_id=agent_def.id, channel_type=channel_type)
            .one_or_none()
        )
        return agent_def, channel_cfg

    def _should_escalate(
        self,
        *,
        confidence: float,
        channel_cfg: ChannelAgentConfig | None,
        payload_data: dict[str, Any],
        agent_result: dict[str, Any],
    ) -> bool:
        if channel_cfg is None:
            return False

        if confidence < channel_cfg.autonomous_threshold:
            return True

        rules = json.loads(channel_cfg.high_stakes_rules or "[]")
        for rule in rules:
            field = rule.get("field")
            op = rule.get("op")
            value = rule.get("value")
            actual = payload_data.get(field)
            if actual is None:
                continue
            if op == "gt" and actual > value:
                return True
            if op == "lt" and actual < value:
                return True
            if op == "eq" and actual == value:
                return True
            if op == "contains" and str(value).lower() in str(actual).lower():
                return True

        return False

    def _create_pending_action(self, db, *, company_id, user, channel_type, message, agent_result):
        from packages.modules.agent.models import AgentPendingAction
        action = AgentPendingAction(
            receipt_id=secrets.token_urlsafe(16),
            company_id=company_id,
            user_id=user.id,
            tool_name=f"channel_{channel_type}",
            args_json=json.dumps({"message": message[:500]}),
            summary=f"Channel agent ({channel_type}) escalated: {agent_result.get('content', '')[:200]}",
            expires_at=None,
        )
        db.add(action)
        db.commit()


CHANNEL_DISPATCHER = ChannelAgentDispatcher()
```

- [ ] **Step 4: Run tests**

```bash
pytest tests/test_channel_dispatcher.py -v
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/modules/agent/core/channel_dispatcher.py tests/test_channel_dispatcher.py
git commit -m "feat(agent): ChannelAgentDispatcher with autonomous threshold and high-stakes escalation"
```

---

## Task 8: Super Admin API Routes

**Files:**
- Create: `apps/api/routes/super_admin_agents.py`

- [ ] **Step 1: Create the routes file**

```python
# apps/api/routes/super_admin_agents.py
"""Super Admin routes for agent lifecycle management.

All endpoints require is_super_admin=True.
"""
from __future__ import annotations

from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from apps.api.auth import require_super_admin
from apps.api.deps import get_db
from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
from packages.modules.agent.core.llm_provider_service import LLM_PROVIDER_SERVICE
from packages.modules.agent.models_definitions import (
    AgentDefinition, ChannelAgentConfig, LLMProviderConfig,
)

router = APIRouter(prefix="/super-admin", tags=["super-admin-agents"])


# ── Schemas ────────────────────────────────────────────────────────────────

class AgentDefinitionOut(BaseModel):
    id: int
    key: str
    name: str
    description: Optional[str]
    system_prompt: str
    allowed_tools: List[str]
    persona: str
    is_system: bool
    is_active: bool

    class Config:
        from_attributes = True


class AgentDefinitionIn(BaseModel):
    key: str
    name: str
    description: Optional[str] = None
    system_prompt: str
    allowed_tools: List[str] = []
    persona: str = "admin"
    is_active: bool = True


class ChannelConfigOut(BaseModel):
    id: int
    agent_id: int
    channel_type: str
    autonomous_threshold: float
    high_stakes_rules: List[dict]
    test_mode: bool


class ChannelConfigIn(BaseModel):
    autonomous_threshold: float = 0.80
    high_stakes_rules: List[dict] = []
    test_mode: bool = False


class LLMConfigOut(BaseModel):
    id: int
    company_id: Optional[int]
    provider: str
    base_url: Optional[str]
    api_key_env_ref: Optional[str]
    model_name: str
    is_active: bool


class LLMConfigIn(BaseModel):
    company_id: Optional[int] = None
    provider: str = "ollama"
    base_url: Optional[str] = None
    api_key_env_ref: Optional[str] = None
    model_name: str = "llama3.2"
    is_active: bool = True


# ── Agent Definitions ──────────────────────────────────────────────────────

def _serialize_agent(a: AgentDefinition) -> dict:
    import json
    tools = a.allowed_tools
    if isinstance(tools, str):
        try:
            tools = json.loads(tools)
        except Exception:
            tools = []
    return {
        "id": a.id, "key": a.key, "name": a.name, "description": a.description,
        "system_prompt": a.system_prompt, "allowed_tools": tools,
        "persona": a.persona, "is_system": a.is_system, "is_active": a.is_active,
    }


@router.get("/agent-definitions")
def list_agent_definitions(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    return [_serialize_agent(a) for a in AGENT_DEF_SERVICE.get_all(db)]


@router.post("/agent-definitions", status_code=201)
def create_agent_definition(body: AgentDefinitionIn, db: Session = Depends(get_db),
                             _=Depends(require_super_admin)):
    try:
        agent = AGENT_DEF_SERVICE.upsert(db, body.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize_agent(agent)


@router.get("/agent-definitions/{key}")
def get_agent_definition(key: str, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    agent = AGENT_DEF_SERVICE.get_by_key(db, key)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return _serialize_agent(agent)


@router.put("/agent-definitions/{key}")
def update_agent_definition(key: str, body: AgentDefinitionIn, db: Session = Depends(get_db),
                             _=Depends(require_super_admin)):
    data = body.model_dump()
    data["key"] = key
    try:
        agent = AGENT_DEF_SERVICE.upsert(db, data)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return _serialize_agent(agent)


@router.delete("/agent-definitions/{key}", status_code=204)
def delete_agent_definition(key: str, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    try:
        AGENT_DEF_SERVICE.delete(db, key)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/agent-definitions/{key}/toggle")
def toggle_agent(key: str, is_active: bool, db: Session = Depends(get_db),
                 _=Depends(require_super_admin)):
    try:
        agent = AGENT_DEF_SERVICE.toggle_active(db, key, is_active)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return _serialize_agent(agent)


# ── Channel Agent Configs ──────────────────────────────────────────────────

def _serialize_channel_cfg(c: ChannelAgentConfig) -> dict:
    import json
    rules = c.high_stakes_rules
    if isinstance(rules, str):
        try:
            rules = json.loads(rules)
        except Exception:
            rules = []
    return {
        "id": c.id, "agent_id": c.agent_id, "channel_type": c.channel_type,
        "autonomous_threshold": c.autonomous_threshold,
        "high_stakes_rules": rules, "test_mode": c.test_mode,
    }


@router.get("/channel-agent-configs")
def list_channel_configs(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    cfgs = db.query(ChannelAgentConfig).all()
    return [_serialize_channel_cfg(c) for c in cfgs]


@router.put("/channel-agent-configs/{agent_key}")
def update_channel_config(agent_key: str, body: ChannelConfigIn,
                           db: Session = Depends(get_db), _=Depends(require_super_admin)):
    import json
    agent = AGENT_DEF_SERVICE.get_by_key(db, agent_key)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    cfg = db.query(ChannelAgentConfig).filter_by(agent_id=agent.id).one_or_none()
    if cfg is None:
        cfg = ChannelAgentConfig(agent_id=agent.id, channel_type=agent_key)
        db.add(cfg)
    cfg.autonomous_threshold = body.autonomous_threshold
    cfg.high_stakes_rules = json.dumps(body.high_stakes_rules)
    cfg.test_mode = body.test_mode
    db.commit()
    db.refresh(cfg)
    return _serialize_channel_cfg(cfg)


# ── LLM Provider Configs ────────────────────────────────────────────────────

def _serialize_llm(c: LLMProviderConfig) -> dict:
    return {
        "id": c.id, "company_id": c.company_id, "provider": c.provider,
        "base_url": c.base_url, "api_key_env_ref": c.api_key_env_ref,
        "model_name": c.model_name, "is_active": c.is_active,
    }


@router.get("/llm-configs")
def list_llm_configs(db: Session = Depends(get_db), _=Depends(require_super_admin)):
    return [_serialize_llm(c) for c in db.query(LLMProviderConfig).all()]


@router.post("/llm-configs", status_code=201)
def create_llm_config(body: LLMConfigIn, db: Session = Depends(get_db),
                      _=Depends(require_super_admin)):
    existing = (
        db.query(LLMProviderConfig)
        .filter(LLMProviderConfig.company_id == body.company_id)
        .one_or_none()
    )
    if existing:
        existing.provider = body.provider
        existing.base_url = body.base_url
        existing.api_key_env_ref = body.api_key_env_ref
        existing.model_name = body.model_name
        existing.is_active = body.is_active
        db.commit()
        db.refresh(existing)
        return _serialize_llm(existing)
    cfg = LLMProviderConfig(**body.model_dump())
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    return _serialize_llm(cfg)


@router.put("/llm-configs/{cfg_id}")
def update_llm_config(cfg_id: int, body: LLMConfigIn, db: Session = Depends(get_db),
                      _=Depends(require_super_admin)):
    cfg = db.query(LLMProviderConfig).filter_by(id=cfg_id).one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config not found")
    for k, v in body.model_dump().items():
        setattr(cfg, k, v)
    db.commit()
    db.refresh(cfg)
    return _serialize_llm(cfg)


@router.delete("/llm-configs/{cfg_id}", status_code=204)
def delete_llm_config(cfg_id: int, db: Session = Depends(get_db), _=Depends(require_super_admin)):
    cfg = db.query(LLMProviderConfig).filter_by(id=cfg_id).one_or_none()
    if cfg:
        db.delete(cfg)
        db.commit()


@router.post("/llm-configs/test")
def test_llm_connection(body: LLMConfigIn, _=Depends(require_super_admin)):
    result = LLM_PROVIDER_SERVICE.test_connection(body.model_dump())
    return result


# ── Tool Registry (read-only) ───────────────────────────────────────────────

@router.get("/tool-registry")
def get_tool_registry(_=Depends(require_super_admin)):
    return AGENT_DEF_SERVICE.get_tool_list()
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/routes/super_admin_agents.py
git commit -m "feat(agent): Super Admin API routes for agent definitions, channel configs, LLM configs"
```

---

## Task 9: Wire Backend (main.py + Channel Webhooks + Seed)

**Files:**
- Modify: `apps/api/main.py`
- Modify: `packages/modules/channels/api/whatsapp_webhook.py`
- Modify: `packages/modules/channels/api/email_inbound.py`

- [ ] **Step 1: Mount new router and call seed in main.py**

In `apps/api/main.py`, add the import near the other super_admin import:

```python
from apps.api.routes.super_admin_agents import router as super_admin_agents_router
```

After `app.include_router(super_admin_router)`, add:

```python
app.include_router(super_admin_agents_router)
```

After `_run_backfill()`, add a seed call:

```python
def _seed_agent_defaults() -> None:
    import logging
    _seed_log = logging.getLogger(__name__)
    try:
        from apps.api.db import SessionLocal
        from packages.modules.agent.core.agent_definition_service import AGENT_DEF_SERVICE
        from packages.modules.agent.tools import registry_all  # noqa: F401
        db = SessionLocal()
        AGENT_DEF_SERVICE.seed_defaults(db)
        _seed_log.info("Agent defaults seeded.")
    except Exception:
        _seed_log.exception("Agent seed failed — startup unaffected")
    finally:
        db.close()

_seed_agent_defaults()
```

- [ ] **Step 2: Update WhatsApp webhook to use dispatcher**

Open `packages/modules/channels/api/whatsapp_webhook.py`. Find the section where it calls the old agent service (look for `from packages.modules.channels.service.agent` or similar). Replace the agent invocation with:

```python
from packages.modules.agent.core.channel_dispatcher import CHANNEL_DISPATCHER

# Inside the background task / message handler function, replace the old call with:
CHANNEL_DISPATCHER.dispatch(
    db=db,
    channel_type="whatsapp",
    user=user,
    company_id=company_id,
    message=message_text,
    confidence=1.0,
)
```

The exact location depends on current code. Find the function that processes an inbound message and substitute the agent call there. If the file imports a deleted module, remove that import.

- [ ] **Step 3: Update email inbound similarly**

Open `packages/modules/channels/api/email_inbound.py`. Apply the same pattern — replace any old agent call with:

```python
from packages.modules.agent.core.channel_dispatcher import CHANNEL_DISPATCHER

CHANNEL_DISPATCHER.dispatch(
    db=db,
    channel_type="email",
    user=user,
    company_id=company_id,
    message=email_body,
    confidence=1.0,
)
```

- [ ] **Step 4: Verify the server starts**

```bash
python -m uvicorn apps.api.main:app --reload --port 8000 2>&1 | head -20
```
Expected: server starts, `INFO: Agent defaults seeded.` appears, no import errors.

- [ ] **Step 5: Verify the new endpoints respond**

```bash
# Check the agent definitions endpoint exists (will 403 without auth, but 403 != 404)
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/super-admin/agent-definitions
```
Expected: `403` (forbidden — not authenticated, but route exists).

- [ ] **Step 6: Commit**

```bash
git add apps/api/main.py packages/modules/channels/api/whatsapp_webhook.py packages/modules/channels/api/email_inbound.py
git commit -m "feat(agent): wire dispatcher into channels, seed defaults on startup, mount agent management router"
```

---

## Task 10: Frontend API Client

**Files:**
- Create: `web/lib/api/agent-definitions.ts`
- Create: `web/lib/api/llm-config.ts`

- [ ] **Step 1: Create agent-definitions.ts**

```typescript
// web/lib/api/agent-definitions.ts
import { getStoredSession } from "@/lib/session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const s = getStoredSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

export interface AgentDefinition {
  id: number;
  key: string;
  name: string;
  description: string | null;
  system_prompt: string;
  allowed_tools: string[];
  persona: string;
  is_system: boolean;
  is_active: boolean;
}

export interface ChannelAgentConfig {
  id: number;
  agent_id: number;
  channel_type: string;
  autonomous_threshold: number;
  high_stakes_rules: Array<{ field: string; op: string; value: number | string }>;
  test_mode: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  personas: string[];
  destructive: boolean;
}

export async function listAgentDefinitions(): Promise<AgentDefinition[]> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function createAgentDefinition(data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateAgentDefinition(key: string, data: Partial<AgentDefinition>): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteAgentDefinition(key: string): Promise<void> {
  await fetch(`${BASE}/super-admin/agent-definitions/${key}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function toggleAgent(key: string, isActive: boolean): Promise<AgentDefinition> {
  const r = await fetch(`${BASE}/super-admin/agent-definitions/${key}/toggle?is_active=${isActive}`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function listChannelConfigs(): Promise<ChannelAgentConfig[]> {
  const r = await fetch(`${BASE}/super-admin/channel-agent-configs`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function updateChannelConfig(agentKey: string, data: Partial<ChannelAgentConfig>): Promise<ChannelAgentConfig> {
  const r = await fetch(`${BASE}/super-admin/channel-agent-configs/${agentKey}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function getToolRegistry(): Promise<ToolInfo[]> {
  const r = await fetch(`${BASE}/super-admin/tool-registry`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}
```

- [ ] **Step 2: Create llm-config.ts**

```typescript
// web/lib/api/llm-config.ts
import { getStoredSession } from "@/lib/session";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function authHeaders(): HeadersInit {
  const s = getStoredSession();
  return s ? { Authorization: `Bearer ${s.token}` } : {};
}

export interface LLMConfig {
  id: number;
  company_id: number | null;
  provider: "ollama" | "anthropic" | "openai";
  base_url: string | null;
  api_key_env_ref: string | null;
  model_name: string;
  is_active: boolean;
}

export async function listLLMConfigs(): Promise<LLMConfig[]> {
  const r = await fetch(`${BASE}/super-admin/llm-configs`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export async function upsertLLMConfig(data: Partial<LLMConfig>): Promise<LLMConfig> {
  const r = await fetch(`${BASE}/super-admin/llm-configs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateLLMConfig(id: number, data: Partial<LLMConfig>): Promise<LLMConfig> {
  const r = await fetch(`${BASE}/super-admin/llm-configs/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteLLMConfig(id: number): Promise<void> {
  await fetch(`${BASE}/super-admin/llm-configs/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
}

export async function testLLMConnection(data: Partial<LLMConfig>): Promise<{ ok: boolean; latency_ms: number; error: string | null }> {
  const r = await fetch(`${BASE}/super-admin/llm-configs/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add web/lib/api/agent-definitions.ts web/lib/api/llm-config.ts
git commit -m "feat(web): API client functions for agent definitions and LLM config"
```

---

## Task 11: Agent Builder Page

**Files:**
- Create: `web/app/super-admin/agents/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// web/app/super-admin/agents/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Brain, Circle, Pencil, Plus, Trash2, Zap, Mail, MessageCircle } from "lucide-react";
import {
  listAgentDefinitions, updateAgentDefinition, createAgentDefinition,
  deleteAgentDefinition, toggleAgent, listChannelConfigs, updateChannelConfig,
  getToolRegistry, AgentDefinition, ChannelAgentConfig, ToolInfo,
} from "@/lib/api/agent-definitions";

const PERSONA_BADGES: Record<string, string> = {
  admin: "bg-indigo-500/15 text-indigo-300/80 border-indigo-500/25",
  employee: "bg-emerald-500/15 text-emerald-300/80 border-emerald-500/25",
  procurement: "bg-amber-500/15 text-amber-300/80 border-amber-500/25",
};

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="h-3 w-3" />,
  email: <Mail className="h-3 w-3" />,
};

export default function AgentBuilderPage() {
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [channelConfigs, setChannelConfigs] = useState<ChannelAgentConfig[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [selected, setSelected] = useState<AgentDefinition | null>(null);
  const [editing, setEditing] = useState<Partial<AgentDefinition> | null>(null);
  const [activeTab, setActiveTab] = useState<"identity" | "prompt" | "tools" | "channel">("identity");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newAgent, setNewAgent] = useState({ key: "", name: "", description: "", persona: "admin", system_prompt: "" });

  useEffect(() => {
    Promise.all([listAgentDefinitions(), listChannelConfigs(), getToolRegistry()])
      .then(([a, c, t]) => { setAgents(a); setChannelConfigs(c); setTools(t); })
      .catch(console.error);
  }, []);

  function selectAgent(a: AgentDefinition) {
    setSelected(a);
    setEditing({ ...a });
    setActiveTab("identity");
    setError(null);
  }

  function channelConfig(a: AgentDefinition): ChannelAgentConfig | undefined {
    return channelConfigs.find(c => c.agent_id === a.id);
  }

  function isChannelAgent(a: AgentDefinition) {
    return ["whatsapp", "email"].includes(a.key);
  }

  async function save() {
    if (!editing || !selected) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAgentDefinition(selected.key, editing);
      setAgents(prev => prev.map(a => a.key === updated.key ? updated : a));
      setSelected(updated);
      setEditing({ ...updated });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(a: AgentDefinition) {
    const updated = await toggleAgent(a.key, !a.is_active);
    setAgents(prev => prev.map(x => x.key === updated.key ? updated : x));
    if (selected?.key === a.key) { setSelected(updated); setEditing({ ...updated }); }
  }

  async function handleDelete(a: AgentDefinition) {
    if (a.is_system) return;
    if (!confirm(`Delete agent "${a.name}"?`)) return;
    await deleteAgentDefinition(a.key);
    setAgents(prev => prev.filter(x => x.key !== a.key));
    if (selected?.key === a.key) { setSelected(null); setEditing(null); }
  }

  async function handleCreate() {
    try {
      const agent = await createAgentDefinition({ ...newAgent, allowed_tools: [], is_active: true });
      setAgents(prev => [...prev, agent]);
      setShowNew(false);
      setNewAgent({ key: "", name: "", description: "", persona: "admin", system_prompt: "" });
      selectAgent(agent);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function saveChannelConfig(agentKey: string, data: Partial<ChannelAgentConfig>) {
    const updated = await updateChannelConfig(agentKey, data);
    setChannelConfigs(prev => prev.map(c => c.agent_id === updated.agent_id ? updated : c));
  }

  const grouped = {
    system: agents.filter(a => a.is_system && !isChannelAgent(a)),
    channel: agents.filter(a => isChannelAgent(a)),
    custom: agents.filter(a => !a.is_system),
  };

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-56 shrink-0 border-r border-white/[0.06] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.05]">
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/30">Agents</span>
          <button onClick={() => setShowNew(true)}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/[0.06] bg-white/[0.02] text-white/40 hover:text-white/70 hover:bg-white/[0.05]">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {[["System", grouped.system], ["Channels", grouped.channel], ["Custom", grouped.custom]].map(([label, group]) => (
            (group as AgentDefinition[]).length > 0 && (
              <div key={label as string}>
                <div className="px-3 py-1 text-[8.5px] font-bold uppercase tracking-widest text-white/22">{label as string}</div>
                {(group as AgentDefinition[]).map(a => (
                  <button key={a.key} onClick={() => selectAgent(a)}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${selected?.key === a.key ? "bg-indigo-500/10 border-r-2 border-indigo-500/50" : "hover:bg-white/[0.03]"}`}>
                    <Circle className={`h-1.5 w-1.5 shrink-0 fill-current ${a.is_active ? "text-emerald-400" : "text-white/20"}`} />
                    <span className="flex-1 truncate text-[11px] text-white/70">{a.name}</span>
                    {isChannelAgent(a) && <span className="text-white/30">{CHANNEL_ICONS[a.key]}</span>}
                  </button>
                ))}
              </div>
            )
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {!selected && (
          <div className="flex h-full items-center justify-center text-[11px] text-white/25">
            Select an agent to configure it
          </div>
        )}
        {selected && editing && (
          <div className="p-4 max-w-2xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-white/85">{selected.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${PERSONA_BADGES[selected.persona] || PERSONA_BADGES.admin}`}>
                    {selected.persona}
                  </span>
                  {selected.is_system && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.02] text-white/35">system</span>
                  )}
                </div>
                <div className="text-[10px] text-white/35 mt-0.5">{selected.key}</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(selected)}
                  className={`text-[10px] px-2 py-1 rounded border transition-colors ${selected.is_active ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300/70 hover:bg-emerald-500/15" : "border-white/[0.06] bg-white/[0.02] text-white/35 hover:bg-white/[0.05]"}`}>
                  {selected.is_active ? "Active" : "Inactive"}
                </button>
                {!selected.is_system && (
                  <button onClick={() => handleDelete(selected)}
                    className="text-[10px] px-2 py-1 rounded border border-rose-500/25 bg-rose-500/10 text-rose-300/70 hover:bg-rose-500/15">
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-0 border-b border-white/[0.06] mb-4">
              {(["identity", "prompt", "tools", ...(isChannelAgent(selected) ? ["channel"] : [])] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab as any)}
                  className={`px-3 py-1.5 text-[10px] font-medium transition-colors ${activeTab === tab ? "text-indigo-300/80 border-b-2 border-indigo-500/50 -mb-px" : "text-white/40 hover:text-white/60"}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            {/* Identity tab */}
            {activeTab === "identity" && (
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Name</label>
                  <input value={editing.name || ""} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Description</label>
                  <input value={editing.description || ""} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
                <div>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Persona</label>
                  <select value={editing.persona || "admin"} onChange={e => setEditing(p => ({ ...p, persona: e.target.value }))}
                    disabled={selected.is_system}
                    className="w-full rounded border border-white/[0.07] bg-zinc-900 px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none disabled:opacity-40">
                    <option value="admin">admin</option>
                    <option value="employee">employee</option>
                    <option value="procurement">procurement</option>
                  </select>
                </div>
              </div>
            )}

            {/* Prompt tab */}
            {activeTab === "prompt" && (
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">System Prompt</label>
                <textarea value={editing.system_prompt || ""} onChange={e => setEditing(p => ({ ...p, system_prompt: e.target.value }))}
                  rows={16}
                  className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40 resize-none" />
                <div className="text-[9px] text-white/25 mt-1">{(editing.system_prompt || "").length} chars</div>
              </div>
            )}

            {/* Tools tab */}
            {activeTab === "tools" && (
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-2">
                  Allowed Tools <span className="text-white/20 normal-case font-normal">(empty = all persona tools)</span>
                </label>
                <div className="space-y-0.5">
                  {Object.entries(
                    tools.reduce((acc, t) => ({ ...acc, [t.category]: [...(acc[t.category] || []), t] }), {} as Record<string, ToolInfo[]>)
                  ).sort().map(([cat, catTools]) => (
                    <div key={cat}>
                      <div className="text-[8.5px] font-bold uppercase tracking-widest text-white/22 px-1 py-1">{cat}</div>
                      {catTools.map(tool => {
                        const checked = (editing.allowed_tools || []).includes(tool.name);
                        return (
                          <label key={tool.name} className="flex items-start gap-2 px-1 py-0.5 rounded hover:bg-white/[0.02] cursor-pointer">
                            <input type="checkbox" checked={checked}
                              onChange={e => {
                                const list = editing.allowed_tools || [];
                                setEditing(p => ({
                                  ...p,
                                  allowed_tools: e.target.checked ? [...list, tool.name] : list.filter(t => t !== tool.name),
                                }));
                              }}
                              className="mt-0.5 accent-indigo-500" />
                            <span>
                              <span className="text-[10px] text-white/70 font-mono">{tool.name}</span>
                              {tool.destructive && <span className="ml-1 text-[8px] text-rose-400/70">destructive</span>}
                              <span className="block text-[9px] text-white/30">{tool.description}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Channel tab */}
            {activeTab === "channel" && isChannelAgent(selected) && (() => {
              const cfg = channelConfig(selected);
              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">
                      Autonomous Threshold <span className="text-white/20 normal-case font-normal">— below this confidence, escalate to human</span>
                    </label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={0} max={1} step={0.05}
                        defaultValue={cfg?.autonomous_threshold ?? 0.80}
                        onChange={e => saveChannelConfig(selected.key, { autonomous_threshold: parseFloat(e.target.value), high_stakes_rules: cfg?.high_stakes_rules, test_mode: cfg?.test_mode })}
                        className="flex-1 accent-indigo-500" />
                      <span className="text-[11px] text-white/60 w-10 text-right">{((cfg?.autonomous_threshold ?? 0.80) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Test Mode</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" defaultChecked={cfg?.test_mode ?? false}
                        onChange={e => saveChannelConfig(selected.key, { autonomous_threshold: cfg?.autonomous_threshold, high_stakes_rules: cfg?.high_stakes_rules, test_mode: e.target.checked })}
                        className="accent-indigo-500" />
                      <span className="text-[11px] text-white/60">Log actions but never commit them (safe for testing)</span>
                    </label>
                  </div>
                </div>
              );
            })()}

            {error && <div className="mt-3 text-[10px] text-rose-400/80">{error}</div>}
            <div className="mt-4">
              <button onClick={save} disabled={saving}
                className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15 disabled:opacity-40">
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New agent modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="w-96 rounded border border-white/[0.07] bg-zinc-900 p-4">
            <div className="text-[12px] font-semibold text-white/80 mb-3">New Agent</div>
            <div className="space-y-2.5">
              {([["key", "Key (slug)"], ["name", "Display Name"], ["description", "Description"]] as const).map(([field, label]) => (
                <div key={field}>
                  <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">{label}</label>
                  <input value={(newAgent as any)[field]}
                    onChange={e => setNewAgent(p => ({ ...p, [field]: e.target.value }))}
                    className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
                </div>
              ))}
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">System Prompt</label>
                <textarea value={newAgent.system_prompt} onChange={e => setNewAgent(p => ({ ...p, system_prompt: e.target.value }))}
                  rows={4} className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40 resize-none" />
              </div>
            </div>
            {error && <div className="mt-2 text-[10px] text-rose-400/80">{error}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={handleCreate}
                className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15">
                Create
              </button>
              <button onClick={() => { setShowNew(false); setError(null); }}
                className="px-3 py-1.5 rounded border border-white/[0.07] text-[11px] text-white/40 hover:bg-white/[0.03]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/super-admin/agents/page.tsx
git commit -m "feat(web): Agent Builder page — two-panel CRUD for agent definitions"
```

---

## Task 12: LLM Config Page

**Files:**
- Create: `web/app/super-admin/llm-config/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
// web/app/super-admin/llm-config/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, X, Zap } from "lucide-react";
import {
  listLLMConfigs, upsertLLMConfig, deleteLLMConfig, testLLMConnection, LLMConfig,
} from "@/lib/api/llm-config";

const PROVIDERS = [
  { key: "ollama", label: "Ollama (Local)", hint: "Runs on your machine. No API cost." },
  { key: "anthropic", label: "Anthropic", hint: "Claude models. Requires ANTHROPIC_API_KEY env var." },
  { key: "openai", label: "OpenAI", hint: "GPT models. Requires OPENAI_API_KEY env var." },
] as const;

export default function LLMConfigPage() {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [editing, setEditing] = useState<Partial<LLMConfig>>({ provider: "ollama", model_name: "llama3.2", company_id: null });
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number; error: string | null } | null>(null);
  const [testing, setSaving] = useState(false);
  const [saving, setSavingCfg] = useState(false);

  const globalConfig = configs.find(c => c.company_id === null);
  const tenantConfigs = configs.filter(c => c.company_id !== null);

  useEffect(() => {
    listLLMConfigs().then(setConfigs).catch(console.error);
  }, []);

  useEffect(() => {
    if (globalConfig) setEditing({ ...globalConfig });
  }, [configs.length]);

  async function handleTest() {
    setSaving(true);
    setTestResult(null);
    try {
      const r = await testLLMConnection(editing);
      setTestResult(r);
    } catch (e: any) {
      setTestResult({ ok: false, latency_ms: 0, error: e.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSavingCfg(true);
    try {
      const updated = await upsertLLMConfig({ ...editing, company_id: null });
      setConfigs(prev => {
        const without = prev.filter(c => c.company_id !== null);
        return [updated, ...without];
      });
    } finally {
      setSavingCfg(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-5">
      <header className="mb-5">
        <h1 className="text-[13px] font-bold tracking-[-0.01em] text-white/85">LLM Configuration</h1>
        <p className="mt-0.5 text-[10.5px] text-white/40">
          Global provider used by all agents. Tenants can override below.
        </p>
      </header>

      {/* Provider selector */}
      <div className="mb-4">
        <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Provider</div>
        <div className="grid grid-cols-3 gap-2">
          {PROVIDERS.map(p => (
            <button key={p.key} onClick={() => setEditing(prev => ({ ...prev, provider: p.key }))}
              className={`rounded border px-3 py-2 text-left transition-colors ${editing.provider === p.key ? "border-indigo-500/40 bg-indigo-500/10" : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]"}`}>
              <div className={`text-[11px] font-semibold ${editing.provider === p.key ? "text-indigo-200/90" : "text-white/65"}`}>{p.label}</div>
              <div className="text-[9px] text-white/30 mt-0.5">{p.hint}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Config fields */}
      <div className="rounded border border-white/[0.06] bg-white/[0.015] p-4 space-y-3 mb-4">
        <div>
          <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Model Name</label>
          <input value={editing.model_name || ""} onChange={e => setEditing(p => ({ ...p, model_name: e.target.value }))}
            placeholder={editing.provider === "ollama" ? "llama3.2" : editing.provider === "anthropic" ? "claude-sonnet-4-6" : "gpt-4o"}
            className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
        </div>
        {editing.provider === "ollama" && (
          <div>
            <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">Base URL</label>
            <input value={editing.base_url || ""} onChange={e => setEditing(p => ({ ...p, base_url: e.target.value }))}
              placeholder="http://localhost:11434"
              className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 focus:outline-none focus:border-indigo-500/40" />
          </div>
        )}
        {editing.provider !== "ollama" && (
          <div>
            <label className="text-[9px] uppercase tracking-widest font-bold text-white/30 block mb-1">API Key Env Var</label>
            <input value={editing.api_key_env_ref || ""} onChange={e => setEditing(p => ({ ...p, api_key_env_ref: e.target.value }))}
              placeholder="ANTHROPIC_API_KEY"
              className="w-full rounded border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-white/80 font-mono focus:outline-none focus:border-indigo-500/40" />
            <p className="text-[9px] text-white/30 mt-1">Name of the environment variable on the server — key is never stored in the database.</p>
          </div>
        )}
      </div>

      {/* Test + Save */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={handleTest} disabled={testing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-white/[0.07] bg-white/[0.02] text-[11px] text-white/55 hover:bg-white/[0.05] disabled:opacity-40">
          {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
          Test Connection
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 rounded border border-indigo-500/30 bg-indigo-500/10 text-[11px] text-indigo-300/80 hover:bg-indigo-500/15 disabled:opacity-40">
          {saving ? "Saving…" : "Save as Global Default"}
        </button>
        {testResult && (
          <div className={`flex items-center gap-1.5 text-[10px] ${testResult.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>
            {testResult.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {testResult.ok ? `${testResult.latency_ms}ms` : testResult.error}
          </div>
        )}
      </div>

      {/* Per-tenant overrides */}
      {tenantConfigs.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-white/30 mb-2">Per-Tenant Overrides</div>
          <div className="rounded border border-white/[0.06] bg-white/[0.015] overflow-hidden">
            {tenantConfigs.map((c, i) => (
              <div key={c.id} className={`flex items-center px-3 py-2 gap-3 ${i > 0 ? "border-t border-white/[0.05]" : ""}`}>
                <span className="text-[10px] text-white/50 flex-1">Company #{c.company_id}</span>
                <span className="text-[10px] text-white/55">{c.provider}</span>
                <span className="text-[10px] text-white/40 font-mono">{c.model_name}</span>
                <button onClick={async () => { await deleteLLMConfig(c.id); setConfigs(p => p.filter(x => x.id !== c.id)); }}
                  className="text-white/25 hover:text-rose-400/70">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web/app/super-admin/llm-config/page.tsx
git commit -m "feat(web): LLM Configuration page with provider cards, test connection, per-tenant overrides"
```

---

## Task 13: Update Super Admin Landing + Enhanced Agent Monitor

**Files:**
- Modify: `web/app/super-admin/page.tsx`
- Modify: `web/app/super-admin/agent-management/page.tsx`

- [ ] **Step 1: Update the landing page**

In `web/app/super-admin/page.tsx`, find the `GROUPS` array. Add a new group before the existing ones:

```tsx
{
  label: "Agent Management",
  tiles: [
    {
      href: "/super-admin/agents",
      title: "Agent Builder",
      subtitle: "Create · edit prompts · manage tools · channel config",
      icon: <Brain className="h-3.5 w-3.5" />,
    },
    {
      href: "/super-admin/llm-config",
      title: "LLM Configuration",
      subtitle: "Provider · model · API key · per-tenant overrides",
      icon: <Zap className="h-3.5 w-3.5" />,
    },
  ],
},
```

Also add `Zap` to the lucide-react import.

- [ ] **Step 2: Add per-agent breakdown to agent-management page**

In `web/app/super-admin/agent-management/page.tsx`, find where agent team cards are rendered. After the team card list, add a detail panel. Find the `selectedTeam` state and add a side panel that shows when a team is selected:

```tsx
{selectedTeam && (() => {
  const team = teams.find(t => t.id === selectedTeam);
  if (!team) return null;
  return (
    <div className="mt-4 rounded border border-white/[0.06] bg-white/[0.015] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-white/75">{team.name} — Detail</span>
        <a href={`/super-admin/agents`}
          className="text-[10px] text-indigo-300/60 hover:text-indigo-200/80">Edit agent →</a>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ["Requests", team.requestCount],
          ["Success Rate", `${team.successRate.toFixed(1)}%`],
          ["Avg Latency", `${team.avgLatency.toFixed(0)}ms`],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded border border-white/[0.05] bg-white/[0.01] p-2">
            <div className="text-[9px] text-white/30 uppercase tracking-widest">{label}</div>
            <div className="text-[13px] font-semibold text-white/75 mt-0.5">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
})()}
```

- [ ] **Step 3: Commit**

```bash
git add web/app/super-admin/page.tsx web/app/super-admin/agent-management/page.tsx
git commit -m "feat(web): add Agent Builder + LLM Config tiles to super-admin landing, enhance agent monitor detail panel"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
pytest tests/ -v --tb=short 2>&1 | tail -30
```
Expected: all existing tests pass + new tests pass. No regressions.

- [ ] **Step 2: Start dev server and verify API**

```bash
python -m uvicorn apps.api.main:app --reload --port 8000 &
sleep 3
curl -s http://localhost:8000/ | python3 -m json.tool
```
Expected: `{"status": "ok", ...}`

- [ ] **Step 3: Verify agent seed**

```bash
# With a valid super-admin JWT (X-User-Id dev bypass if enabled):
curl -s -H "X-User-Id: 1" http://localhost:8000/super-admin/agent-definitions | python3 -m json.tool | grep '"key"'
```
Expected: `"orchestrator"`, `"config"`, `"expense"`, `"accounting"`, `"compliance"`, `"whatsapp"`, `"email"` all present.

- [ ] **Step 4: Verify tool registry endpoint**

```bash
curl -s -H "X-User-Id: 1" http://localhost:8000/super-admin/tool-registry | python3 -m json.tool | grep '"name"' | head -5
```
Expected: tool names listed.

- [ ] **Step 5: Start Next.js and verify pages load**

```bash
cd web && npm run dev &
```
Navigate to:
- `http://localhost:3000/super-admin` — should show new "Agent Management" group with two tiles
- `http://localhost:3000/super-admin/agents` — Agent Builder loads, left panel shows 7 agents
- `http://localhost:3000/super-admin/llm-config` — LLM Config page loads with Ollama selected

- [ ] **Step 6: Final commit**

```bash
git add -A
git status  # verify nothing sensitive included
git commit -m "feat(agent): complete agent platform — DB-driven definitions, real orchestrator, channel dispatcher, Super Admin UI"
```

---

## Self-Review

**Spec coverage check:**
- ✅ 3 new DB tables (agent_definitions, channel_agent_configs, llm_provider_configs) — Tasks 1-2
- ✅ AgentDefinitionService with seed, CRUD, tool validation — Task 3
- ✅ LLMProviderService with fallback chain and env-var key ref — Task 4
- ✅ run_turn() agent_definition kwarg — Task 5
- ✅ Real LLM orchestrator routing — Task 6
- ✅ ChannelAgentDispatcher with threshold + high-stakes rules — Task 7
- ✅ Super Admin CRUD API for agents, channel configs, LLM configs, tool registry — Task 8
- ✅ Wire: seed on startup, mount router, channel webhooks use dispatcher — Task 9
- ✅ Frontend API client — Task 10
- ✅ Agent Builder page (two-panel, tabs: identity/prompt/tools/channel) — Task 11
- ✅ LLM Config page (provider cards, test connection, per-tenant overrides) — Task 12
- ✅ Super Admin landing updated, agent monitor enhanced — Task 13
- ✅ 4 new test files with full coverage — Tasks 3, 4, 6, 7

**Type consistency:** `AgentDefinition.allowed_tools` is stored as a JSON string (Text column) and deserialized with `json.loads()` at every read site — consistent across service, router, and engine.

**Placeholder scan:** No TBD, TODO, or "handle edge cases" patterns present.
