"""
BYO-LLM webhook — Agora Conversational AI Engine calls this each turn.

Agora sends OpenAI-compat chat completions to /v1/chat/completions.
We route through Groq and return a proper OpenAI-compat response.
"""
import logging
import time
from typing import Any

from groq import AsyncGroq

import config
import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.llm_webhook")

_client = AsyncGroq(api_key=config.GROQ_API_KEY)

SYSTEM_PROMPT = """You are Sentinel-1, the AI Incident Commander for a live emergency response operation.

INCIDENT: Municipal Industrial Park — Chemical Fire and Gas Leak
YOUR ROLE: 4th participant in the voice channel. You listen to Fire_Chief, Traffic_Control, and Hazmat_Lead.

STRICT RULES:
1. Keep ALL responses under 2 sentences — you are speaking aloud, not writing
2. Acknowledge what you heard, then ask ONE sharp question OR flag a conflict
3. If two responders contradict each other, say: "[Name], that conflicts with [Name/Sensor] — please confirm"
4. For dispatch actions, say: "[Name], I need your verbal go-ahead to [action]"
5. NEVER dispatch anything yourself. Always get explicit confirmation first
6. No bullet points, no markdown, no lists — natural spoken English only
7. Address responders by role name: Fire Chief, Traffic Control, or Hazmat Lead"""


def _build_context() -> str:
    s = state.get_state()
    sensor_a = s["sensors"]["Sensor_A"]
    sensor_b = s["sensors"]["Sensor_B"]
    fires = ", ".join(s["active_fires"]) or "none reported"
    threat = s["chemical_threat"] or "none confirmed"

    # Check for active conflicts
    active_conflicts = [
        inc for inc in s["incidents"].values()
        if inc.get("conflict_detected") and inc.get("priority") == "P1_CRITICAL"
    ]

    context = (
        f"LIVE SENSOR DATA: Thermal={sensor_a['value']}{sensor_a['unit']} "
        f"| Toxicity={sensor_b['value']}{sensor_b['unit']} "
        f"| Hazard={s['hazard_level']} "
        f"| Active fires={fires} "
        f"| Chemical threat={threat}"
    )

    if active_conflicts:
        c = active_conflicts[-1]
        context += f"\n⚠ ACTIVE CONFLICT REQUIRING RESOLUTION: {c['conflict_detected']['details']}"

    return context


async def handle_openai_compat(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handle OpenAI-compat /v1/chat/completions from Agora ConvoAI Engine.
    Agora sends: {model, messages, stream, uid, turn_id, session_id, timestamp}
    """
    logger.info("LLM turn — uid=%s turn=%s", payload.get("uid", "?"), payload.get("turn_id", "?"))

    messages: list[dict] = payload.get("messages", [])
    speaker_uid: str = str(payload.get("uid", "") or "")

    # Extract the last user utterance
    user_messages = [m for m in messages if m.get("role") == "user"]
    utterance = user_messages[-1]["content"].strip() if user_messages else ""

    if not utterance or len(utterance) < 2:
        return _empty_response()

    # Log to state and broadcast to dashboard
    responder_id = speaker_uid if speaker_uid and speaker_uid != "0" else "Responder"
    state.add_transcript(responder_id, utterance)
    await ws_manager.broadcast("transcript", {
        "responder_id": responder_id,
        "text": utterance,
        "timestamp": time.time(),
        "source": "agora_asr",
    })

    # Build full message context
    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _build_context()},
        *messages,
    ]

    t_start = time.time()
    reply = await _call_llm(full_messages)
    latency_ms = int((time.time() - t_start) * 1000)

    logger.info("LLM reply in %dms: %s", latency_ms, reply[:80])

    # Broadcast AI reply to dashboard
    await ws_manager.broadcast("transcript", {
        "responder_id": "Sentinel-1-AI",
        "text": reply,
        "timestamp": time.time(),
        "source": "agent_tts",
        "latency_ms": latency_ms,
    })

    # Broadcast latency metric for header display
    await ws_manager.broadcast("agent_metric", {
        "latency_ms": latency_ms,
        "turn_id": payload.get("turn_id", 0),
    })

    return {
        "id": f"sentinel-{int(time.time())}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": config.PRIMARY_MODEL,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": reply},
            "finish_reason": "stop",
        }],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


async def handle_llm_turn(payload: dict[str, Any]) -> dict[str, Any]:
    """Legacy handler for raw /llm_webhook path."""
    asr: dict = payload.get("asr_result", {})
    speaker_uid: str = asr.get("uid", "responder")
    utterance: str = asr.get("text", "").strip()

    if not utterance:
        return {"content": "", "end_of_turn": True}

    state.add_transcript(speaker_uid, utterance)
    await ws_manager.broadcast("transcript", {
        "responder_id": speaker_uid,
        "text": utterance,
        "timestamp": time.time(),
        "source": "agora_asr",
    })

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": _build_context()},
        {"role": "user", "content": f"[{speaker_uid}]: {utterance}"},
    ]

    reply = await _call_llm(messages)

    await ws_manager.broadcast("transcript", {
        "responder_id": "Sentinel-1-AI",
        "text": reply,
        "timestamp": time.time(),
        "source": "agent_tts",
    })

    return {"content": reply, "end_of_turn": True}


def _empty_response() -> dict:
    return {
        "id": "sentinel-empty",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": config.PRIMARY_MODEL,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": ""}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


async def _call_llm(messages: list[dict]) -> str:
    for model in (config.PRIMARY_MODEL, config.FALLBACK_MODEL):
        try:
            resp = await _client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=150,
                temperature=0.35,
            )
            content = (resp.choices[0].message.content or "").strip()
            if content:
                return content
        except Exception as exc:
            logger.warning("LLM call failed on %s: %s", model, exc)
    return "Copy that. Standing by."
