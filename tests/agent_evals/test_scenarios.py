"""Driver for scenario-based agent evals.

Monkey-patches :func:`packages.modules.agent.core.engine.chat_with_tools` with
a replay that returns the canned tool calls declared in each scenario YAML.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pytest
import yaml
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from apps.api.db import Base
from packages.core.platform.models import Company
from packages.core.platform.models_user import User

from packages.modules.agent.core import engine as engine_mod
from packages.modules.agent.core.engine import run_turn
from packages.modules.agent.tools import registry_all  # noqa: F401


SCENARIOS_DIR = Path(__file__).parent / "scenarios"

# Phrases we ban in agent final content — voice compliance.
_FILLER_PATTERNS = [
    r"\bclaro que sí\b",
    r"\bespero que te sirva\b",
    r"\bcomo asistente\b",
    r"\bcon mucho gusto\b",
    r"\bpor supuesto\b",
    r"\bhe entendido\b",
    r"\ben primer lugar\b",
    r"\ba continuación\b",
]
_FILLER_RE = re.compile("|".join(_FILLER_PATTERNS), re.IGNORECASE)


def _load_scenarios() -> list[dict[str, Any]]:
    scenarios = []
    for path in sorted(SCENARIOS_DIR.glob("*.yaml")):
        with path.open("r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            data["__path__"] = str(path)
            scenarios.append(data)
    return scenarios


SCENARIOS = _load_scenarios()


def _make_session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, expire_on_commit=False)
    s = Session()
    s.add(Company(id=1, name="Evals Inc", slug="evals"))
    s.add(User(id=1, email="admin@evals.com", full_name="Admin", company_id=1, role="admin"))
    s.commit()
    return s


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[s["name"] for s in SCENARIOS])
def test_scenario(scenario: dict[str, Any], monkeypatch: pytest.MonkeyPatch):
    canned = scenario["canned_tool_calls"]
    final_content = scenario.get("final_content", "Listo.")

    # Fake chat_with_tools that calls each canned tool once via the executor
    # then returns final content.
    def fake_chat_with_tools(*, system_prompt, user_prompt, tools, tool_executor,
                             temperature=0.0, max_iterations=6):
        for call in canned:
            tool_executor(call["name"], call.get("arguments", {}))
        return {"content": final_content, "iterations": 1, "tool_calls": canned}

    monkeypatch.setattr(engine_mod, "chat_with_tools", fake_chat_with_tools)

    db = _make_session()
    try:
        user = db.query(User).filter(User.id == 1).one()
        result = run_turn(
            db=db,
            user=user,
            company_id=1,
            persona=scenario["persona"],
            user_message=scenario["prompt"],
        )
    finally:
        db.close()

    called = {tc["tool"] for tc in result["tool_calls"]}
    for expected in scenario.get("expect_tools", []):
        assert expected in called, f"{scenario['name']}: expected tool {expected} not called (called={called})"

    if scenario.get("expect_receipt_for"):
        assert any(p["tool"] == scenario["expect_receipt_for"] for p in result["pending"]), \
            f"{scenario['name']}: expected receipt for {scenario['expect_receipt_for']}"

    if scenario.get("expect_no_filler", True):
        content = result["content"] or ""
        match = _FILLER_RE.search(content)
        assert match is None, f"{scenario['name']}: filler phrase detected: {match and match.group(0)}"
        # Also: final content should be short.
        assert len(content) < 600, f"{scenario['name']}: final content too long ({len(content)} chars)"
