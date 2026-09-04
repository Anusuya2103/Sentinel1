"""
In-memory shared state — single source of truth for the backend.
All mutations go through the helpers below so the structure stays consistent.
"""
import time
from typing import Any

# ── Core operational state ────────────────────────────────────────────────────
_state: dict[str, Any] = {
    "hazard_level": "MODERATE",          # LOW | MODERATE | HIGH | CRITICAL
    "chemical_threat": None,             # string description or None
    "active_fires": [],                  # list of location strings
    "safe_routes": ["North_Gate", "East_Gate"],

    # Agora Conversational AI agent session
    "agent_session_id": None,            # string once created
    "agent_status": "idle",              # idle | joining | active | stopped | error

    # Latest sensor readings  {sensor_id: {value, unit, timestamp}}
    "sensors": {
        "Sensor_A": {"value": 42.0, "unit": "°C",  "location": "East Warehouse", "timestamp": 0.0},
        "Sensor_B": {"value": 15.0, "unit": "ppm", "location": "Chemical Storage", "timestamp": 0.0},
    },

    # Extracted incidents keyed by incident id
    "incidents": {},

    # Recommended actions keyed by action_id
    "actions": {},

    # Audit log of dispatched actions
    "audit_log": [],

    # Transcript history (last 200 entries, tagged by speaker)
    "transcripts": [],
}


def get_state() -> dict[str, Any]:
    return _state


def update_sensors(sensor_id: str, value: float) -> None:
    if sensor_id in _state["sensors"]:
        _state["sensors"][sensor_id]["value"] = round(value, 2)
        _state["sensors"][sensor_id]["timestamp"] = time.time()


def merge_llm_result(result: dict[str, Any]) -> dict[str, Any]:
    """
    Merge an LLM evaluation result into shared state.
    Returns a delta dict with only the changed keys (for WS broadcast).
    """
    delta: dict[str, Any] = {}

    updates = result.get("state_updates", {})
    if updates.get("chemical_threat") is not None:
        _state["chemical_threat"] = updates["chemical_threat"]
        delta["chemical_threat"] = _state["chemical_threat"]

    if updates.get("active_fires"):
        # union — never remove fires via LLM alone
        existing = set(_state["active_fires"])
        for fire in updates["active_fires"]:
            if isinstance(fire, dict):
                fire = fire.get("location") or fire.get("description") or fire.get("name")
            if fire:
                existing.add(str(fire))
        _state["active_fires"] = list(existing)
        delta["active_fires"] = _state["active_fires"]

    # Derive hazard level from sensor thresholds + incidents
    _recalc_hazard_level()
    delta["hazard_level"] = _state["hazard_level"]

    for incident in result.get("extracted_incidents", []):
        _state["incidents"][incident["id"]] = incident

    if result.get("extracted_incidents"):
        delta["incidents"] = _state["incidents"]

    for action in result.get("recommended_actions", []):
        if action["action_id"] not in _state["actions"]:
            action["status"] = "DRAFT_PENDING_APPROVAL"
            action["created_at"] = time.time()
            _state["actions"][action["action_id"]] = action

    if result.get("recommended_actions"):
        delta["actions"] = _state["actions"]

    return delta


def mark_action_dispatched(action_id: str, approved_by: str) -> bool:
    if action_id not in _state["actions"]:
        return False
    _state["actions"][action_id]["status"] = "DISPATCHED"
    _state["actions"][action_id]["approved_by"] = approved_by
    _state["actions"][action_id]["dispatched_at"] = time.time()

    log_entry = {
        "action_id": action_id,
        "approved_by": approved_by,
        "timestamp": time.time(),
        "action": _state["actions"][action_id],
    }
    _state["audit_log"].append(log_entry)
    return True


def add_transcript(responder_id: str, text: str) -> None:
    entry = {
        "responder_id": responder_id,
        "text": text,
        "timestamp": time.time(),
    }
    _state["transcripts"].append(entry)
    # Keep last 200
    if len(_state["transcripts"]) > 200:
        _state["transcripts"] = _state["transcripts"][-200:]


def set_agent_session(session_id: str | None, status: str) -> None:
    _state["agent_session_id"] = session_id
    _state["agent_status"] = status


def get_recent_transcripts(since: float = 0.0) -> list[dict]:
    """Return transcripts newer than `since` epoch seconds."""
    return [t for t in _state["transcripts"] if t["timestamp"] > since]


def _recalc_hazard_level() -> None:
    thermal = _state["sensors"]["Sensor_A"]["value"]
    toxicity = _state["sensors"]["Sensor_B"]["value"]

    if thermal > 150 or toxicity > 80:
        _state["hazard_level"] = "CRITICAL"
    elif thermal > 100 or toxicity > 50:
        _state["hazard_level"] = "HIGH"
    elif thermal > 60 or toxicity > 25:
        _state["hazard_level"] = "MODERATE"
    else:
        _state["hazard_level"] = "LOW"
