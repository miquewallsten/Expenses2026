"""Phase 2.5 — Request-ID middleware + structured error handler.

Every inbound request gets a UUID4 ``request_id`` attached to ``request.state``
and echoed back in the ``X-Request-Id`` response header. Unhandled exceptions
and validation errors are returned as structured JSON:

    {"ok": false, "error": {"code": "...", "message": "...", "request_id": "..."}}

Existing handlers (slowapi, magic-link rate-limit) keep their current shapes;
this only catches the long tail of FastAPI / Starlette / unhandled errors.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger(__name__)


REQUEST_ID_HEADER = "X-Request-Id"


async def _request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Attach a request_id to every request and surface it in the response."""
    incoming = request.headers.get(REQUEST_ID_HEADER)
    request_id = incoming or uuid.uuid4().hex
    request.state.request_id = request_id
    try:
        response = await call_next(request)
    except Exception:  # pragma: no cover - bubbles to the handler below
        log.exception("Unhandled error", extra={"request_id": request_id})
        raise
    response.headers[REQUEST_ID_HEADER] = request_id
    return response


def _request_id_for(request: Request) -> str:
    return getattr(request.state, "request_id", uuid.uuid4().hex)


def _structured_payload(
    *, code: str, message: str, request_id: str, extra: Any = None
) -> dict:
    error: dict = {
        "code": code,
        "message": message,
        "request_id": request_id,
    }
    if extra is not None:
        error["details"] = extra
    return {"ok": False, "error": error}


async def http_exception_handler(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    rid = _request_id_for(request)
    body = _structured_payload(
        code=f"http_{exc.status_code}",
        message=str(exc.detail) if exc.detail else "HTTP error",
        request_id=rid,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=body,
        headers={REQUEST_ID_HEADER: rid},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    rid = _request_id_for(request)
    body = _structured_payload(
        code="validation_error",
        message="Request validation failed.",
        request_id=rid,
        extra=exc.errors(),
    )
    return JSONResponse(
        status_code=422,
        content=body,
        headers={REQUEST_ID_HEADER: rid},
    )


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:  # pragma: no cover - exercised only on real failures
    rid = _request_id_for(request)
    log.exception("Unhandled %s: %s", type(exc).__name__, exc, extra={"request_id": rid})
    body = _structured_payload(
        code="internal_error",
        message="An internal error occurred.",
        request_id=rid,
    )
    return JSONResponse(
        status_code=500, content=body, headers={REQUEST_ID_HEADER: rid}
    )


def install(app: FastAPI) -> None:
    """Wire middleware + 500/422 handlers. We deliberately do NOT override
    HTTPException — existing routers depend on the FastAPI default
    ``{"detail": "..."}`` shape, and changing it is a breaking API change
    that belongs to a separate migration.
    """
    app.middleware("http")(_request_id_middleware)
    app.add_exception_handler(
        RequestValidationError, validation_exception_handler
    )
    app.add_exception_handler(Exception, unhandled_exception_handler)
