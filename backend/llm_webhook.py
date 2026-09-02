"""
BYO-LLM webhook — Agora Conversational AI Engine calls this each turn.

Agora sends OpenAI-compat chat completions format to /v1/chat/completions.
We route through Groq and return an OpenAI-compat response.
Also handles the raw /llm_webhook path for backwards compat.
"""
import logging
import time
from collections import defaultdict
from typing import Any

from groq import AsyncGroq

import config
import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.llm_webhook")

_client = AsyncGroq(api_key=config.GROQ_API_KEY)
_conversation_history: dict[str, list[dict]] = defaultdict(list)

SYSTEM_PROMPT = """You are Sentinel-1, the AI Incident Commander for a municipal industrial park \
emergency (chemical fire + gas leak). You are a live voice participant with three responders: \
Fire_Chief, Traffic_Control, and Hazmat_Lead.

Rules:
- Acknowledge reports in 1-2 sentences max
- Ask ONE sharp clarifying question if a report is ambiguous
- Flag contradictions verbally: "Hazmat Lead, that conflicts with Sensor B — please confirm"
- Ask named responders for approval before any dispatch action
- Never dispatch anything yourself
- No bullet points, no markdown — you are speaking aloud"""


def _build_context() -> str:
    s = state.get_state()
    sensor_a = s["sensors"]["Sensor_A"]
    sensor_b = s["sensors"]["Sensor_B"]
    fires = ", ".join(s["active_fires"]) or "none reported"
    threat = s["chemical_threat"] or "none confirmed"
    conflicts = [
        inc for inc in s["incidents"].values()
        if inc.get("conflict_detected") and inc.get("priority") == "P1_CRITICAL"
    ]
    conflict_note = ""
    if conflicts:
        c = conflicts[-1]
        conflict_note = f" WARNING CONFLICT: {c['conflict_detected']['details']}"
    return (
        f"[LIVE] Hazard:{s['hazard_level']} "
        f"Thermal:{sensor_a['value']}{sensor_a['unit']} "
        f"Toxicity:{sensor_b['value']}{sensor_b['unit']} "
        f"Fires:{fires} Chemical:{threat}{conflict_note}"
    )


async def handle_openai_compat(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Handle OpenAI-compat /v1/chat/completions request from Agora Engine.
    Agora sends: messages, stream, plus custom fields: turn_id, uid, timestamp, session_id
    """
    # Log full payload once for debugging
    logger.info("LLM webhook payload keys: %s", list(payload.keys()))

    messages: list[dict] = payload.get("messages", [])

    # Agora custom LLM fields
    speaker_uid: str = str(payload.get("uid", "") or payload.get("user_id", "") or "")
    turn_id: int = payload.get("turn_id", 0)

    # Extract the last user message as the utterance
    user_messages = [m for m in messages if m.get("role") == "user"]
    utterance = user_messages[-1]["content"] if user_messages else ""

    if not utterance:
        return _empty_response()

    # Map UID to responder role if possible, else use UID directly
    # Agora sends numeric UIDs — map to friendly names via known UIDs
    # The browser client joins with random UID; we show it as-is
    responder_id = speaker_uid if speaker_uid else "Responder"

    # Log transcript to state + broadcast to dashboard
    state.add_transcript(responder_id, utterance)
    await ws_manager.broadcast("transcript", {
        "responder_id": responder_id,
        "text": utterance,
        "timestamp": time.time(),
        "source": "agora_asr",
    })

    # Build messages with live context injected
    context_msg = {"role": "system", "content": _build_context()}
    full_messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        context_msg,
        *messages,
    ]

    reply = await _call_llm(full_messages)

    # Broadcast agent reply to dashboard
    await ws_manager.broadcast("transcript", {
        "responder_id": "Sentinel-1-AI",
        "text": reply,
        "timestamp": time.time(),
        "source": "agent_tts",
    })

    # Return OpenAI-compat response
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
                max_tokens=120,
                temperature=0.4,
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception as exc:
            logger.warning("LLM call failed on %s: %s", model, exc)
    return "Copy that. Standing by."

