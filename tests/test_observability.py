"""Phase 2.5 — Request-ID middleware + structured error responses."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_request_id_header_is_echoed_on_success(client: TestClient) -> None:
    r = client.get("/")  # root is harmless; we just need any 2xx-or-error response
    assert "X-Request-Id" in r.headers
    assert len(r.headers["X-Request-Id"]) >= 8


def test_request_id_uses_inbound_when_provided(client: TestClient) -> None:
    incoming = "req-test-12345"
    r = client.get("/", headers={"X-Request-Id": incoming})
    assert r.headers["X-Request-Id"] == incoming


def test_validation_error_returns_structured_body(client: TestClient) -> None:
    """Hit /auth/magic-link/request with a malformed body to trigger 422."""
    r = client.post("/auth/magic-link/request", json={"not_email": "x"})
    assert r.status_code == 422
    body = r.json()
    assert body.get("ok") is False
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["request_id"]
    assert isinstance(body["error"]["details"], list)
    assert "X-Request-Id" in r.headers
