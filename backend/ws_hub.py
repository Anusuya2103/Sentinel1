"""
WebSocket connection manager + broadcast helper.
Single /ws endpoint; all frontend tabs connect here.
"""
import json
import logging
from typing import Any
from fastapi import WebSocket

logger = logging.getLogger("sentinel1.ws_hub")

# Valid event types the frontend understands
EVENT_TYPES = {
    "transcript",
    "telemetry_update",
    "incident_update",
    "conflict_alert",
    "action_dispatched",
    "agent_interrupted",  # Convo AI Engine interrupted the agent mid-response
    "agent_lifecycle",    # join / stop / error events from the Engine
    "state_snapshot",     # sent once on connect
}


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.info("WS client connected. Total: %d", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        self._connections.remove(ws)
        logger.info("WS client disconnected. Total: %d", len(self._connections))

    async def broadcast(self, event_type: str, payload: Any) -> None:
        """Broadcast a typed event to all connected clients."""
        if event_type not in EVENT_TYPES:
            logger.warning("Unknown event type: %s", event_type)

        message = json.dumps({"type": event_type, "payload": payload})
        dead: list[WebSocket] = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self.disconnect(ws)

    @property
    def connection_count(self) -> int:
        return len(self._connections)


# Singleton shared across the app
manager = ConnectionManager()
