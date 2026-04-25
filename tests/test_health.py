"""Phase 2.6 — Health endpoints."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_200_always(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200
    # Existing endpoint reports `{"status": "healthy"}` — keep that contract;
    # this test just verifies the liveness probe is reachable and 2xx.
    assert r.json()["status"] in ("ok", "healthy")


def test_health_ready_reports_subsystems(client: TestClient) -> None:
    """Readiness should report db/storage/ollama keys.

    The test suite runs against an in-memory engine so DB ping must succeed;
    storage path is created on demand; Ollama is not configured in the
    test environment so it should be reported as not_configured / error
    but never blocks readiness.
    """
    r = client.get("/health/ready")
    # In tests, db ping + storage write should both succeed.
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "ok"
    detail = body["detail"]
    assert detail["db"] == "ok"
    assert detail["storage"] == "ok"
    assert "ollama" in detail
