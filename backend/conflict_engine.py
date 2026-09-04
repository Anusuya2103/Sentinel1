"""
Conflict Engine — background tick (CONFLICT_TICK_SECONDS).
Deep structured JSON analysis + verbal HITL approval detection.
"""
import asyncio
import json
import logging
import re
import time
from typing import Any

from groq import AsyncGroq

import agora_manager as agora_agent
import config
import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.conflict_engine")

_client = AsyncGroq(api_key=config.GROQ_API_KEY)

# Keywords that indicate verbal HITL approval
APPROVAL_KEYWORDS = [
    "confirmed", "confirm", "approved", "approve", "go ahead", "go-ahead",
    "affirmative", "roger that", "proceed", "execute", "dispatch", "authorize"
]

ANALYSIS_PROMPT = """\
You are the Sentinel-1 AI Core analyzing an active emergency incident.

CURRENT SITUATION:
- Hazard Level: {hazard_level}
- Safe Evacuation Routes: {safe_routes}
- Sensor_A (East Warehouse Thermal): {sensor_a_val}{sensor_a_unit} [TREND: {sensor_a_trend}]
- Sensor_B (Chemical Storage Toxicity): {sensor_b_val}{sensor_b_unit} [TREND: {sensor_b_trend}]

RECENT VOICE TRANSCRIPTS:
{transcripts_formatted}

ROLE AUTHORITY WEIGHTS:
- Hazmat_Lead: 0.9 on chemical claims, 0.3 on fire claims
- Fire_Chief: 0.85 on fire claims, 0.4 on chemical claims
- Traffic_Control: 0.9 on traffic/route claims, 0.4 on hazard claims

CONFIDENCE SCORING:
- Base: 70%
- +30% if corroborated by sensor telemetry or another authority
- -50% if directly contradicted by sensor readings

CRITICAL: Output ONLY valid JSON. No prose, no markdown, no explanation.
If no incidents, output the schema with empty arrays.

OUTPUT THIS EXACT JSON:
{{
  "state_updates": {{
    "chemical_threat": null,
    "active_fires": []
  }},
  "extracted_incidents": [
    {{
      "id": "INC-001",
      "description": "One clear sentence describing the incident",
      "priority": "P1_CRITICAL",
      "confidence": 0.85,
      "source": "Fire_Chief",
      "corroborated_by": ["Sensor_A"],
      "conflict_detected": {{
        "with_incident_id": "INC-002",
        "details": "Fire Chief says safe but Sensor B reads 85ppm — direct contradiction"
      }}
    }}
  ],
  "recommended_actions": [
    {{
      "action_id": "ACT-001",
      "type": "EVACUATE",
      "target": "North_Gate",
      "message": "Initiate evacuation via North Gate immediately due to toxic chemical levels",
      "critical": true
    }}
  ]
}}"""

_last_flush: float = 0.0
_sensor_history: dict[str, list[float]] = {"Sensor_A": [], "Sensor_B": []}
_pending_verbal_approvals: dict[str, dict] = {}  # action_id -> action info


def _get_trend(sensor_id: str, current: float) -> str:
    history = _sensor_history.get(sensor_id, [])
    if len(history) < 3:
        return "STABLE"
    recent_avg = sum(history[-3:]) / 3
    if current > recent_avg * 1.05:
        return "RISING"
    elif current < recent_avg * 0.95:
        return "FALLING"
    return "STABLE"


def _update_sensor_history(sensor_id: str, value: float) -> None:
    if sensor_id not in _sensor_history:
        _sensor_history[sensor_id] = []
    _sensor_history[sensor_id].append(value)
    if len(_sensor_history[sensor_id]) > 20:
        _sensor_history[sensor_id] = _sensor_history[sensor_id][-20:]


def register_verbal_approval(action_id: str, action_info: dict) -> None:
    """Register an action as awaiting verbal approval from a named responder."""
    _pending_verbal_approvals[action_id] = {
        **action_info,
        "registered_at": time.time(),
    }
    logger.info("Registered verbal approval listener for action: %s", action_id)


async def run_conflict_engine() -> None:
    logger.info("Conflict engine started (tick=%ds)", config.CONFLICT_TICK_SECONDS)
    while True:
        await asyncio.sleep(config.CONFLICT_TICK_SECONDS)
        try:
            await _tick()
        except Exception:
            logger.exception("Conflict engine tick error (continuing)")


async def _tick() -> None:
    global _last_flush

    new_transcripts = state.get_recent_transcripts(since=_last_flush)
    if not new_transcripts:
        logger.debug("No new transcripts — skipping LLM call")
        return

    _last_flush = time.time()
    s = state.get_state()
    sensor_a = s["sensors"]["Sensor_A"]
    sensor_b = s["sensors"]["Sensor_B"]

    # Update sensor history
    _update_sensor_history("Sensor_A", sensor_a["value"])
    _update_sensor_history("Sensor_B", sensor_b["value"])

    # Check for verbal HITL approvals in new transcripts
    await _check_verbal_approvals(new_transcripts)

    prompt = ANALYSIS_PROMPT.format(
        hazard_level=s["hazard_level"],
        safe_routes=", ".join(s["safe_routes"]),
        sensor_a_val=sensor_a["value"],
        sensor_a_unit=sensor_a["unit"],
        sensor_a_trend=_get_trend("Sensor_A", sensor_a["value"]),
        sensor_b_val=sensor_b["value"],
        sensor_b_unit=sensor_b["unit"],
        sensor_b_trend=_get_trend("Sensor_B", sensor_b["value"]),
        transcripts_formatted="\n".join(
            f"  [{t['responder_id']}]: {t['text']}" for t in new_transcripts
        ),
    )

    result = await _call_analysis_llm(prompt)
    if not result:
        return

    delta = state.merge_llm_result(result)
    if delta:
        delta["sensor_readings"] = {"Sensor_A": sensor_a, "Sensor_B": sensor_b}
        delta["sensor_trends"] = {
            "Sensor_A": _get_trend("Sensor_A", sensor_a["value"]),
            "Sensor_B": _get_trend("Sensor_B", sensor_b["value"]),
        }
        await ws_manager.broadcast("incident_update", delta)

    # Register new actions for verbal approval listening
    for action in result.get("recommended_actions", []):
        if action.get("critical") and action["action_id"] not in _pending_verbal_approvals:
            register_verbal_approval(action["action_id"], action)

    # Handle P1 critical conflicts
    p1_conflicts = [
        inc for inc in result.get("extracted_incidents", [])
        if inc.get("conflict_detected") and inc.get("priority") == "P1_CRITICAL"
    ]

    for incident in p1_conflicts:
        conflict_details = incident["conflict_detected"]["details"]
        logger.warning("P1 CONFLICT: %s", conflict_details)

        await ws_manager.broadcast("conflict_alert", {
            "incident_id": incident["id"],
            "description": incident["description"],
            "conflict": incident["conflict_detected"],
            "confidence": incident["confidence"],
            "timestamp": time.time(),
        })

        # Step 1: Interrupt the agent mid-response
        await agora_agent.interrupt_agent()

        # Step 2: Inject a think message so the agent says exactly the right thing
        # Build a targeted verbal conflict flag
        role_a = incident["source"].replace("_", " ")
        think_msg = (
            f"URGENT: Flag this conflict immediately in your next response. "
            f"Say: '{role_a}, Sensor B is reading critical levels — "
            f"that contradicts your last report. All teams hold position. "
            f"Hazmat Lead, please confirm current toxicity reading.'"
        )
        await asyncio.sleep(0.5)  # Brief pause after interrupt
        await agora_agent.send_think(think_msg)

        logger.info("Conflict interrupt + think injection sent for incident %s", incident["id"])


async def _check_verbal_approvals(transcripts: list[dict]) -> None:
    """
    Scan new transcripts for verbal approval keywords.
    If found and there are pending actions awaiting approval, auto-dispatch them.
    """
    if not _pending_verbal_approvals:
        return

    for transcript in transcripts:
        text_lower = transcript["text"].lower()
        speaker = transcript["responder_id"]

        # Check for approval keywords
        if any(kw in text_lower for kw in APPROVAL_KEYWORDS):
            # Find the most recent pending action
            pending = sorted(
                _pending_verbal_approvals.items(),
                key=lambda x: x[1].get("registered_at", 0),
                reverse=True
            )

            for action_id, action_info in pending:
                # Check if action still exists and is pending
                current_actions = state.get_state()["actions"]
                if action_id in current_actions and current_actions[action_id]["status"] == "DRAFT_PENDING_APPROVAL":
                    logger.info(
                        "VERBAL APPROVAL DETECTED from %s: '%s' → dispatching %s",
                        speaker, transcript["text"][:50], action_id
                    )

                    # Import actions here to avoid circular imports
                    import actions as actions_module
                    result = await actions_module.approve_and_dispatch(
                        action_id,
                        f"{speaker}_verbal"
                    )

                    if result["ok"]:
                        # Remove from pending
                        _pending_verbal_approvals.pop(action_id, None)

                        # Broadcast the verbal approval event
                        await ws_manager.broadcast("verbal_approval", {
                            "action_id": action_id,
                            "approved_by": speaker,
                            "utterance": transcript["text"],
                            "timestamp": time.time(),
                        })

                        logger.info("Verbal approval dispatched action %s by %s", action_id, speaker)
                    break  # Only dispatch one action per utterance


async def _call_analysis_llm(prompt: str) -> dict[str, Any] | None:
    messages = [{"role": "user", "content": prompt}]
    for model in (config.PRIMARY_MODEL, config.FALLBACK_MODEL):
        try:
            resp = await _client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=1500,
                temperature=0.05,
            )
            raw = resp.choices[0].message.content or ""
            parsed = _parse_json(raw)
            if parsed:
                return parsed
            logger.warning("JSON parse failed on %s", model)
        except Exception as exc:
            logger.warning("LLM call failed on %s: %s", model, exc)
    return None


def _parse_json(raw: str) -> dict[str, Any] | None:
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(0)
    try:
        result = json.loads(cleaned)
        if "extracted_incidents" not in result:
            result["extracted_incidents"] = []
        if "recommended_actions" not in result:
            result["recommended_actions"] = []
        if "state_updates" not in result:
            result["state_updates"] = {"chemical_threat": None, "active_fires": []}
        return result
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed: %s | Raw: %.300s", exc, raw)
        return None
