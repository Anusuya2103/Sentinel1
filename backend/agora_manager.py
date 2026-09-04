"""
Agora Conversational AI Engine — agent session management.

STT:  AresSTT    — Agora-managed, no key needed
LLM:  CustomLLM  — BYO webhook to our Groq-powered /v1/chat/completions
TTS:  OpenAITTS(model="tts-1") — Agora-managed preset, no key needed
"""
import asyncio
import logging
import time

from agora_agent import Agent, Agora, Area, DeepgramSTT, CustomLLM, OpenAITTS
from agora_agent.core.api_error import ApiError

import config
import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.agora_manager")

_active_session_id: str | None = None

SYSTEM_PROMPT = (
    "You are Sentinel-1, the AI Incident Commander for a municipal industrial park "
    "emergency (chemical fire + gas leak). You are a live voice participant with "
    "Fire_Chief, Traffic_Control, and Hazmat_Lead. Keep replies under 2 sentences. "
    "Never dispatch actions yourself — ask a named responder for approval first."
)


def _make_client() -> Agora:
    return Agora(
        area=Area.US,
        app_id=config.AGORA_APP_ID,
        app_certificate=config.AGORA_APP_CERTIFICATE,
        customer_id=config.AGORA_CUSTOMER_ID,
        customer_secret=config.AGORA_CUSTOMER_SECRET,
    )


async def create_agent_session() -> str | None:
    global _active_session_id

    if _active_session_id:
        logger.info("Agent session already active: %s", _active_session_id)
        return _active_session_id

    try:
        client = _make_client()
        llm_url = f"{config.LLM_WEBHOOK_PUBLIC_URL}/v1/chat/completions"

        agent = (
            Agent(client=client, turn_detection={"language": "en-US"})
            # Agora-managed Deepgram STT — more reliable than Ares, no key needed
            .with_stt(DeepgramSTT(model="nova-2", language="en-US"))
            .with_llm(
                CustomLLM(
                    base_url=llm_url,
                    model="sentinel-1",
                    api_key="sentinel-internal",
                    system_messages=[{"role": "system", "content": SYSTEM_PROMPT}],
                    greeting_message="Sentinel-1 AI online. Monitoring all channels.",
                    max_history=20,
                    max_tokens=150,
                )
            )
            .with_tts(
                # Agora-managed OpenAI TTS preset — no separate key required
                OpenAITTS(model="tts-1", voice="nova")
            )
        )

        session = agent.create_session(
            channel=config.CHANNEL_NAME,
            agent_uid=config.AGENT_UID,
            remote_uids=["*"],
            name=f"sentinel1-{int(time.time())}",
            idle_timeout=300,
        )

        loop = asyncio.get_event_loop()
        session_id = await loop.run_in_executor(None, session.start)

        if not session_id:
            logger.error("SDK returned no session ID")
            state.set_agent_session(None, "error")
            return None

        _active_session_id = str(session_id)
        state.set_agent_session(_active_session_id, "joining")
        logger.info("Agora agent session created: %s", _active_session_id)

        await ws_manager.broadcast("agent_lifecycle", {
            "event": "created",
            "session_id": _active_session_id,
            "channel": config.CHANNEL_NAME,
        })
        return _active_session_id

    except ApiError as exc:
        logger.error("Agora API error %s: %s", exc.status_code, exc.body)
        state.set_agent_session(None, "error")
        return None
    except Exception as exc:
        logger.exception("Failed to create agent session: %s", exc)
        state.set_agent_session(None, "error")
        return None


async def stop_agent_session(session_id: str | None = None) -> bool:
    global _active_session_id
    sid = session_id or _active_session_id
    if not sid:
        return False
    try:
        client = _make_client()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: client.agents.stop(appid=config.AGORA_APP_ID, agent_id=sid)
        )
        _active_session_id = None
        state.set_agent_session(None, "stopped")
        logger.info("Agent session stopped: %s", sid)
        await ws_manager.broadcast("agent_lifecycle", {"event": "stopped", "session_id": sid})
        return True
    except ApiError as exc:
        logger.error("Stop agent error %s: %s", exc.status_code, exc.body)
        return False
    except Exception as exc:
        logger.exception("Failed to stop agent: %s", exc)
        return False


async def interrupt_agent(session_id: str | None = None) -> bool:
    sid = session_id or _active_session_id
    if not sid:
        logger.warning("interrupt_agent called but no active session")
        return False
    try:
        client = _make_client()
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, lambda: client.agents.interrupt(appid=config.AGORA_APP_ID, agent_id=sid)
        )
        logger.info("Agent interrupted: %s", sid)
        await ws_manager.broadcast("agent_interrupted", {"session_id": sid})
        return True
    except Exception as exc:
        logger.exception("Failed to interrupt agent: %s", exc)
        return False


async def get_agent_status(session_id: str | None = None) -> dict | None:
    sid = session_id or _active_session_id
    if not sid:
        return None
    try:
        client = _make_client()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: client.agents.get(appid=config.AGORA_APP_ID, agent_id=sid)
        )
        if result is None:
            return None
        # Normalize to dict and extract status field
        if not isinstance(result, dict):
            try:
                result = vars(result)
            except Exception:
                result = {}
        # Agora SDK wraps the response — unwrap agent field if present
        if "agent" in result:
            result = result["agent"]
        # Log full result once for debugging
        logger.debug("Agent status raw: %s", result)
        return result
    except Exception as exc:
        logger.warning("Failed to get agent status: %s", exc)
        return None


def get_active_session_id() -> str | None:
    return _active_session_id


