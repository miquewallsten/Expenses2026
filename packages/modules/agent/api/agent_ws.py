"""WebSocket endpoint for agent push notifications.

Replaces the stub endpoint in agent_push_router.py.  Uses FastAPI's
WebSocket support to push real-time notifications to connected clients.

Usage:
    Connect: ws://localhost:8000/push/ws?token=<jwt>
    Receive: JSON events like {"type": "notification", "data": {...}}
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session

from apps.api.auth import get_current_user
from apps.api.deps import get_db
from packages.core.platform.models_user import User

log = logging.getLogger(__name__)

router = APIRouter(tags=["agent-push-ws"])


class ConnectionManager:
    """Manages active WebSocket connections, keyed by user_id."""

    def __init__(self) -> None:
        # user_id -> list of WebSocket connections (a user may have multiple tabs)
        self._connections: dict[int, list[WebSocket]] = {}

    def connect(self, user_id: int, ws: WebSocket) -> None:
        if user_id not in self._connections:
            self._connections[user_id] = []
        self._connections[user_id].append(ws)

    def disconnect(self, user_id: int, ws: WebSocket) -> None:
        if user_id in self._connections:
            self._connections[user_id] = [w for w in self._connections[user_id] if w is not ws]
            if not self._connections[user_id]:
                del self._connections[user_id]

    async def send_to_user(self, user_id: int, data: dict[str, Any]) -> None:
        """Send a JSON message to all connections for a given user."""
        if user_id not in self._connections:
            return
        payload = json.dumps(data, default=str)
        dead: list[WebSocket] = []
        for ws in self._connections[user_id]:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections[user_id].remove(ws)

    async def broadcast(self, data: dict[str, Any]) -> None:
        """Send a JSON message to all connected users."""
        payload = json.dumps(data, default=str)
        for uid, conns in list(self._connections.items()):
            dead: list[WebSocket] = []
            for ws in conns:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                conns.remove(ws)


# Singleton connection manager
manager = ConnectionManager()


def get_manager() -> ConnectionManager:
    return manager


@router.websocket("/push/ws")
async def websocket_endpoint(
    ws: WebSocket,
    db: Session = Depends(get_db),
):
    """WebSocket endpoint for real-time agent push notifications.

    Accepts connections with a JWT token passed as a query parameter.
    The connection stays open and receives push events as JSON messages.
    """
    # Authenticate via query param token
    token = ws.query_params.get("token")
    if not token:
        await ws.close(code=4001, reason="Missing token")
        return

    from apps.api.auth import _user_from_jwt, _SECRET
    import jwt as pyjwt

    try:
        user = _user_from_jwt(token, db)
        if not user:
            await ws.close(code=4003, reason="Invalid token")
            return
    except Exception:
        await ws.close(code=4003, reason="Authentication failed")
        return

    user_id = user.id
    await ws.accept()
    manager.connect(user_id, ws)
    log.info("WebSocket connected for user_id=%s", user_id)

    try:
        while True:
            # Keep connection alive; client can send pings
            data = await ws.receive_text()
            # Ignore incoming messages (could add command handling later)
            if data.strip() == "ping":
                await ws.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        log.warning("WebSocket error for user_id=%s: %s", user_id, exc)
    finally:
        manager.disconnect(user_id, ws)
        log.info("WebSocket disconnected for user_id=%s", user_id)
