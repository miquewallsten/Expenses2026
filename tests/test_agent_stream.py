"""Phase 8.9 — SSE streaming endpoint tests.

We mock ``run_turn`` (referenced from ``agent_router``) so we exercise
the SSE wrapper in isolation: framing, event order, deltas, and final.
"""

from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from packages.core.platform.models_user import User


def _admin(db_session, company):
    u = User(full_name="Admin", email="admin-sse@test.com", role="admin", company_id=company.id)
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def _parse_sse(body: bytes) -> list[tuple[str, dict]]:
    """Parse an SSE byte stream into a list of (event, data) tuples."""
    events: list[tuple[str, dict]] = []
    for block in body.decode().split("\n\n"):
        if not block.strip():
            continue
        event = "message"
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith("event:"):
                event = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_lines.append(line.split(":", 1)[1].strip())
        try:
            data = json.loads("\n".join(data_lines))
        except json.JSONDecodeError:
            data = {"_raw": "\n".join(data_lines)}
        events.append((event, data))
    return events


# ── Tests ───────────────────────────────────────────────────────────────────


def test_stream_emits_text_deltas_and_final(client, db_session, test_company):
    admin = _admin(db_session, test_company)

    fake_result = {
        "ok": True, "error": None, "session_id": "sess-1",
        "content": "Hola, soy tu copiloto financiero. " * 4,
        "tool_calls": [], "pending": [],
    }

    with patch(
        "packages.modules.agent.api.agent_router.run_turn",
        return_value=fake_result,
    ):
        res = client.get(
            f"/agent/stream/{test_company.id}",
            params={"prompt": "hola", "persona": "admin"},
            headers={"X-User-Id": str(admin.id)},
        )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(res.content)
    names = [e for e, _ in events]
    deltas = [data["delta"] for e, data in events if e == "text_delta"]
    finals = [data for e, data in events if e == "final"]

    assert len(deltas) >= 2, f"expected ≥2 deltas, got {names}"
    assert "".join(deltas) == fake_result["content"]
    assert len(finals) == 1
    assert finals[0]["ok"] is True
    assert finals[0]["session_id"] == "sess-1"
    assert names[-1] == "final"


def test_stream_emits_tool_call_events_in_order(client, db_session, test_company):
    admin = _admin(db_session, test_company)

    fake_result = {
        "ok": True, "error": None, "session_id": "sess-2",
        "content": "ok",
        "tool_calls": [
            {"tool": "read_company_setup", "status": "ok", "summary": "loaded", "duration_ms": 12},
            {"tool": "list_users",         "status": "ok", "summary": "5 users", "duration_ms": 9},
        ],
        "pending": [],
    }

    with patch(
        "packages.modules.agent.api.agent_router.run_turn",
        return_value=fake_result,
    ):
        res = client.get(
            f"/agent/stream/{test_company.id}",
            params={"prompt": "do stuff", "persona": "admin"},
            headers={"X-User-Id": str(admin.id)},
        )

    assert res.status_code == 200
    events = _parse_sse(res.content)
    names = [e for e, _ in events]

    # Tool events must appear before text_delta events.
    assert names.count("tool_call_start") == 2
    assert names.count("tool_call_done") == 2
    last_tool = max(i for i, n in enumerate(names) if n.startswith("tool_call_"))
    first_delta = next(i for i, n in enumerate(names) if n == "text_delta")
    assert last_tool < first_delta

    # Pairs are start→done in order.
    tool_pairs = [(e, d) for e, d in events if e.startswith("tool_call_")]
    assert tool_pairs[0][0] == "tool_call_start"
    assert tool_pairs[0][1]["tool"] == "read_company_setup"
    assert tool_pairs[1][0] == "tool_call_done"
    assert tool_pairs[1][1]["tool"] == "read_company_setup"
    assert tool_pairs[2][0] == "tool_call_start"
    assert tool_pairs[3][0] == "tool_call_done"


def test_stream_admin_persona_requires_admin_role(client, test_user, test_company):
    res = client.get(
        f"/agent/stream/{test_company.id}",
        params={"prompt": "hi", "persona": "admin"},
        headers={"X-User-Id": str(test_user.id)},
    )
    assert res.status_code == 403


def test_stream_cross_company_blocked(client, db_session):
    from packages.core.platform.models import Company

    a = Company(name="A", slug="a-co"); b = Company(name="B", slug="b-co")
    db_session.add_all([a, b]); db_session.commit()
    db_session.refresh(a); db_session.refresh(b)
    admin = User(full_name="Admin", email="x@a.com", role="admin", company_id=a.id)
    db_session.add(admin); db_session.commit(); db_session.refresh(admin)

    res = client.get(
        f"/agent/stream/{b.id}",
        params={"prompt": "hi", "persona": "admin"},
        headers={"X-User-Id": str(admin.id)},
    )
    assert res.status_code == 403


def test_chunk_text_helper_forces_two_deltas_on_short_input():
    from packages.modules.agent.api.agent_router import _chunk_text

    assert _chunk_text("") == [""]
    chunks = _chunk_text("hi")
    assert len(chunks) == 2
    assert "".join(chunks) == "hi"

    long = "x" * 250
    chunks = _chunk_text(long, size=60)
    assert len(chunks) >= 2
    assert "".join(chunks) == long
