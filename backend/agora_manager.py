"""
Agora Conversational AI Engine — agent session management.

STT:  DeepgramSTT — Agora-managed, no key needed
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
    "Never dispatch actions yourself — ask a named responder for approval first. "
    "When you detect a conflict between responders, immediately flag it by saying: "
    "[Role], that contradicts [Other Role or Sensor] — please confirm before we proceed."
)


def _make_client() -> Agora:
    return Agora(
        area=Area.US,
        app_id=config.AGORA_APP_ID,
        app_certificate=config.AGORA_APP_CERTIFICATE,
        customer_id=config.AGORA_CUSTOMER_ID,
        customer_secret=config.AGORA_CUSTOMER_SECRET,
    )


def _build_agent(llm_url: str) -> Agent:
    return (
        Agent(client=_make_client(), turn_detection={"language": "en-US"})
        .with_stt(DeepgramSTT(model="nova-2", language="en-US"))
        .with_llm(
            CustomLLM(
                base_url=llm_url,
                model="sentinel-1",
                api_key="sentinel-internal",
                system_messages=[{"role": "system", "content": SYSTEM_PROMPT}],
                greeting_message="Sentinel-1 AI online. Monitoring all channels. Awaiting situation report.",
                max_history=20,
                max_tokens=150,
            )
        )
        .with_tts(OpenAITTS(model="tts-1", voice="nova"))
    )


async def create_agent_session() -> str | None:
    global _active_session_id

    if _active_session_id:
        logger.info("Agent session already active: %s", _active_session_id)
        return _active_session_id

    llm_url = f"{config.LLM_WEBHOOK_PUBLIC_URL}/v1/chat/completions"

    try:
        agent = _build_agent(llm_url)
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


async def recreate_with_new_tunnel(new_url: str) -> str | None:
    """
    Hot-recreate the agent session with a new tunnel URL.
    Called automatically when /tunnel/update is hit.
    """
    global _active_session_id
    old_sid = _active_session_id

    # Stop old session gracefully
    if old_sid:
        await stop_agent_session(old_sid)
        await asyncio.sleep(2)

    # Update config
    config.LLM_WEBHOOK_PUBLIC_URL = new_url
    logger.info("Recreating agent with new tunnel: %s", new_url)

    return await create_agent_session()


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
        logger.warning("Failed to interrupt agent (non-fatal): %s", exc)
        return False


async def send_think(message: str, session_id: str | None = None) -> bool:
    """
    Inject a message into the agent's thinking pipeline.
    Use this to force the agent to say something specific on its next turn.
    Agora's 'think' endpoint inserts text as if it came from the user pipeline.
    """
    sid = session_id or _active_session_id
    if not sid:
        logger.warning("send_think called but no active session")
        return False
    try:
        import httpx, base64
        base_url = f"https://api-us-west-1.agora.io/api/conversational-ai-agent/v2/projects/{config.AGORA_APP_ID}"
        creds = base64.b64encode(f"{config.AGORA_CUSTOMER_ID}:{config.AGORA_CUSTOMER_SECRET}".encode()).decode()
        headers = {"Authorization": f"Basic {creds}", "Content-Type": "application/json"}

        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(
                f"{base_url}/agents/{sid}/think",
                headers=headers,
                json={"message": message}
            )
            if resp.status_code in (200, 201):
                logger.info("Agent think injected: %s", message[:60])
                return True
            else:
                logger.warning("Think API returned %s: %s", resp.status_code, resp.text[:100])
                return False
    except Exception as exc:
        logger.warning("send_think failed (non-fatal): %s", exc)
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
        if not isinstance(result, dict):
            try:
                result = vars(result)
            except Exception:
                result = {}
        if "agent" in result:
            result = result["agent"]
        logger.debug("Agent status raw: %s", result)
        return result
    except Exception as exc:
        logger.warning("Failed to get agent status: %s", exc)
        return None


def get_active_session_id() -> str | None:
    return _active_session_id
