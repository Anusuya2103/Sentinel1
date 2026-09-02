"""
Conflict Engine — background tick (CONFLICT_TICK_SECONDS).
Deep structured JSON analysis. Uses Groq SDK directly.
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

ANALYSIS_PROMPT = """\
You are the Sentinel-1 AI Core. Analyze this emergency context and output ONLY valid JSON.

[STATE]
Hazard Level: {hazard_level}
Safe Evac Routes: {safe_routes}
Sensors: {sensor_readings}

[TRANSCRIPTS]
{transcripts_formatted}

Role authority: Hazmat_Lead=0.9 chemical, Fire_Chief=0.85 fire, Traffic_Control=0.4 hazard.
Confidence: base 70%, +30% if sensor-corroborated, -50% if sensor-contradicted.

Output this exact JSON structure and nothing else:
{{
  "state_updates": {{"chemical_threat": null, "active_fires": []}},
  "extracted_incidents": [
    {{
      "id": "INC-001",
      "description": "description here",
      "priority": "P1_CRITICAL",
      "confidence": 0.85,
      "source": "Fire_Chief",
      "corroborated_by": [],
      "conflict_detected": {{"with_incident_id": "INC-002", "details": "conflict details"}}
    }}
  ],
  "recommended_actions": [
    {{
      "action_id": "ACT-001",
      "type": "EVACUATE",
      "target": "North_Gate",
      "message": "Initiate evacuation via North Gate",
      "critical": true
    }}
  ]
}}"""

_last_flush: float = 0.0


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

    prompt = ANALYSIS_PROMPT.format(
        hazard_level=s["hazard_level"],
        safe_routes=", ".join(s["safe_routes"]),
        sensor_readings=f"Sensor_A(thermal):{sensor_a['value']}{sensor_a['unit']} Sensor_B(toxicity):{sensor_b['value']}{sensor_b['unit']}",
        transcripts_formatted="\n".join(
            f"[{t['responder_id']}]: {t['text']}" for t in new_transcripts
        ),
    )

    result = await _call_analysis_llm(prompt)
    if not result:
        return

    delta = state.merge_llm_result(result)
    if delta:
        delta["sensor_readings"] = {"Sensor_A": sensor_a, "Sensor_B": sensor_b}
        await ws_manager.broadcast("incident_update", delta)

    for incident in result.get("extracted_incidents", []):
        if incident.get("conflict_detected") and incident.get("priority") == "P1_CRITICAL":
            logger.warning("P1 CONFLICT: %s", incident["conflict_detected"]["details"])
            await ws_manager.broadcast("conflict_alert", {
                "incident_id": incident["id"],
                "description": incident["description"],
                "conflict": incident["conflict_detected"],
                "confidence": incident["confidence"],
            })
            await agora_agent.interrupt_agent()


async def _call_analysis_llm(prompt: str) -> dict[str, Any] | None:
    messages = [{"role": "user", "content": prompt}]
    for model in (config.PRIMARY_MODEL, config.FALLBACK_MODEL):
        try:
            resp = await _client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=1200,
                temperature=0.1,
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
    # Strip markdown fences
    cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.MULTILINE)
    cleaned = re.sub(r"\s*```$", "", cleaned.strip(), flags=re.MULTILINE)
    # Find first JSON object
    match = re.search(r"\{.*\}", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(0)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse failed: %s | Raw: %.200s", exc, raw)
        return None
