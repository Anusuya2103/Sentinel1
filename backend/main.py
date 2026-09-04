"""
Sentinel-1 â€” FastAPI application entry point.

Routes:
  GET  /                          health check
  GET  /ws                        dashboard WebSocket
  POST /agent/start               create Agora Convo AI agent session
  POST /agent/stop                stop agent session
  GET  /agent/status              current agent status
  POST /llm_webhook               Agora Convo AI Engine â†’ BYO LLM turn
  POST /agora/events              Agora event webhook (agent join/stop/error)
  POST /approve_action            HITL dispatch approval
  GET  /state                     full state snapshot (debug)
  GET  /audit_log                 audit trail
  POST /debug/trigger_spike       deterministic sensor spike for demo
  POST /debug/inject_transcript   push a fake transcript (smoke test)
"""
import asyncio
import logging
import time

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import agora_manager as agora_agent
import actions
import config
import sensors
import state
from conflict_engine import run_conflict_engine
from llm_webhook import handle_llm_turn, handle_openai_compat
from ws_hub import manager as ws_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("sentinel1.main")

app = FastAPI(title="Sentinel-1", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten for production
    allow_methods=["*"],
    allow_headers=["*"],
)


# â”€â”€ Startup / shutdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.on_event("startup")
async def startup() -> None:
    logger.info("Sentinel-1 starting upâ€¦")
    asyncio.create_task(sensors.run_sensors(), name="sensors")
    asyncio.create_task(run_conflict_engine(), name="conflict_engine")
    logger.info(
        "Background tasks started. Primary LLM: %s | Fallback: %s",
        config.PRIMARY_MODEL, config.FALLBACK_MODEL,
    )


@app.on_event("shutdown")
async def shutdown() -> None:
    sid = agora_agent.get_active_session_id()
    if sid:
        await agora_agent.stop_agent_session(sid)


# â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.get("/")
async def health():
    s = state.get_state()
    return {
        "service": "sentinel-1",
        "status": "ok",
        "agent_status": s["agent_status"],
        "agent_session_id": s["agent_session_id"],
        "hazard_level": s["hazard_level"],
        "ws_connections": ws_manager.connection_count,
    }


# â”€â”€ WebSocket dashboard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)
    # Send full state snapshot on connect
    await ws_manager.broadcast("state_snapshot", state.get_state())
    try:
        while True:
            await ws.receive_text()   # keep-alive / ignore client messages
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)


# â”€â”€ Agent management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.post("/agent/start")
async def start_agent():
    session_id = await agora_agent.create_agent_session()
    if not session_id:
        raise HTTPException(status_code=502, detail="Failed to create Agora agent session")
    return {"session_id": session_id, "channel": config.CHANNEL_NAME}


@app.post("/agent/stop")
async def stop_agent():
    ok = await agora_agent.stop_agent_session()
    return {"stopped": ok}


@app.get("/agent/status")
async def agent_status():
    s = state.get_state()
    live_status = await agora_agent.get_agent_status()
    return {
        "session_id": s["agent_session_id"],
        "local_status": s["agent_status"],
        "agora_status": live_status,
    }


# â”€â”€ Agora Convo AI Engine event webhook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.post("/agora/events")
async def agora_events(payload: dict):
    """
    Agora Message Notification Service posts agent lifecycle events here.
    event_type: agent.joined, agent.left, agent.error, etc.
    Also receives live transcript events when transcript module is enabled.
    """
    event_type: str = payload.get("event_type", "")
    data: dict = payload.get("data", {})

    logger.info("Agora event: %s | %s", event_type, data)

    if "transcript" in event_type.lower():
        # Live transcript from the Engine's ASR module
        uid = data.get("uid", "unknown")
        text = data.get("text", "")
        if text:
            state.add_transcript(uid, text)
            await ws_manager.broadcast("transcript", {
                "responder_id": uid,
                "text": text,
                "timestamp": time.time(),
                "source": "agora_transcript_module",
            })

    elif "joined" in event_type.lower():
        state.set_agent_session(state.get_state()["agent_session_id"], "active")
        await ws_manager.broadcast("agent_lifecycle", {"event": "joined", "data": data})

    elif "left" in event_type.lower() or "stop" in event_type.lower():
        state.set_agent_session(None, "stopped")
        await ws_manager.broadcast("agent_lifecycle", {"event": "stopped", "data": data})

    elif "error" in event_type.lower():
        state.set_agent_session(state.get_state()["agent_session_id"], "error")
        await ws_manager.broadcast("agent_lifecycle", {"event": "error", "data": data})

    return {"ok": True}


# â”€â”€ BYO-LLM webhook (Agora calls this per turn) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@app.post("/llm_webhook")
async def llm_webhook_endpoint(payload: dict):
    """Agora Conversational AI Engine POSTs here for each conversational turn."""
    result = await handle_llm_turn(payload)
    return result


# â”€â”€ HITL action approval â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class ApproveActionRequest(BaseModel):
    action_id: str
    approved_by: str


@app.post("/approve_action")
async def approve_action(req: ApproveActionRequest):
    result = await actions.approve_and_dispatch(req.action_id, req.approved_by)
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result.get("error"))
    return result


# â”€â”€ Debug / demo endpoints â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

# ── RTC token for browser voice client ───────────────────────────────────────

class RtcTokenRequest(BaseModel):
    uid: int = 0
    role: str = "publisher"

@app.post("/rtc/token")
async def get_rtc_token(req: RtcTokenRequest):
    """
    Generate an RTC token for a browser client to join the sentinel1-incident channel.
    If no App Certificate is set (test mode), returns empty token.
    """
    from agora_agent import generate_rtc_token
    try:
        token = generate_rtc_token(
            app_id=config.AGORA_APP_ID,
            app_certificate=config.AGORA_APP_CERTIFICATE,
            channel=config.CHANNEL_NAME,
            uid=req.uid,
        )
    except Exception:
        token = ""
    return {
        "token": token,
        "channel": config.CHANNEL_NAME,
        "app_id": config.AGORA_APP_ID,
        "uid": req.uid,
    }


@app.post("/debug/trigger_spike")
async def trigger_spike():
    """Deterministic sensor spike for demo pacing â€” call this ~90s in."""
    result = sensors.trigger_spike()
    return result


class InjectTranscriptRequest(BaseModel):
    responder_id: str
    text: str


@app.post("/debug/inject_transcript")
async def inject_transcript(req: InjectTranscriptRequest):
    """Push a fake transcript entry â€” smoke-tests the full pipeline."""
    state.add_transcript(req.responder_id, req.text)
    await ws_manager.broadcast("transcript", {
        "responder_id": req.responder_id,
        "text": req.text,
        "timestamp": time.time(),
        "source": "debug_inject",
    })
    return {"ok": True, "queued": True}


@app.get("/state")
async def get_full_state():
    return state.get_state()


@app.get("/audit_log")
async def get_audit_log():
    return state.get_state()["audit_log"]


# ── Demo utilities ────────────────────────────────────────────────────────────

@app.post("/debug/reset")
async def reset_demo():
    """
    Reset all in-memory state for a clean demo run.
    Clears incidents, actions, transcripts, audit log.
    Does NOT stop the agent session.
    """
    s = state.get_state()
    s["incidents"].clear()
    s["actions"].clear()
    s["transcripts"].clear()
    s["audit_log"].clear()
    s["active_fires"].clear()
    s["chemical_threat"] = None
    s["hazard_level"] = "MODERATE"
    # Reset sensors to baseline
    state.update_sensors("Sensor_A", 45.0)
    state.update_sensors("Sensor_B", 18.0)
    # Reset conflict engine flush time so it picks up new transcripts
    import conflict_engine
    conflict_engine._last_flush = 0.0

    await ws_manager.broadcast("state_snapshot", state.get_state())
    logger.info("Demo state reset")
    return {"ok": True, "message": "State reset — ready for demo"}


@app.post("/debug/run_demo")
async def run_demo():
    """
    Auto-inject the full demo scenario for presentations.
    Injects all transcripts with timing, then triggers spike.
    """
    import asyncio as _asyncio

    async def _run():
        transcripts = [
            ("Fire_Chief", "This is Fire Chief. Warehouse B fire appears contained on the east side. I am moving my team in for assessment.", 0),
            ("Traffic_Control", "Traffic Control here. North Gate is clear. Civilian evacuation is complete. Route is open for emergency vehicles.", 2),
            ("Hazmat_Lead", "Hazmat Lead reporting. Sensor B is showing 42 parts per million chlorine at Chemical Storage. Elevated but monitoring.", 4),
            ("Fire_Chief", "Team is entering Warehouse B now. No visible hazard. Proceeding with structural assessment.", 10),
            ("Hazmat_Lead", "STOP. Do not enter. Sensor B just jumped to 78 parts per million. Wind is pushing chlorine plume toward Warehouse B. Fire Chief pull your team back immediately.", 12),
            ("Traffic_Control", "I have two ambulances inbound through East Gate. Do not close that gate. Medical response will be blocked.", 16),
            ("Hazmat_Lead", "East Gate must close. Toxicity is critical. Anyone near that entrance will be exposed. This is a mass casualty risk.", 18),
            ("Fire_Chief", "We have a man down. One of my team collapsed near Chemical Storage. Requesting immediate medical evacuation.", 22),
        ]

        for responder_id, text, delay in transcripts:
            await _asyncio.sleep(delay if delay == 0 else 2)
            state.add_transcript(responder_id, text)
            await ws_manager.broadcast("transcript", {
                "responder_id": responder_id,
                "text": text,
                "timestamp": time.time(),
                "source": "demo_auto",
            })

        # Trigger spike after all transcripts
        await _asyncio.sleep(3)
        sensors.trigger_spike()
        logger.info("Demo scenario completed")

    asyncio.create_task(_run())
    return {"ok": True, "message": "Demo scenario started — watch the dashboard"}










# ── OpenAI-compat BYO-LLM webhook (Agora ConvoAI calls this per turn) ─────────

@app.post("/v1/chat/completions")
async def openai_compat_endpoint(payload: dict):
    """
    Agora ConvoAI Engine POST here each turn when CustomLLM vendor=custom.
    Payload: {model, messages, stream, uid, turn_id, session_id, timestamp}
    """
    logger.info("LLM webhook hit keys=%s uid=%s turn=%s",
        list(payload.keys()), payload.get("uid","?"), payload.get("turn_id","?"))
    result = await handle_openai_compat(payload)
    return result


# ── Tunnel hot-update ─────────────────────────────────────────────────────────

@app.post("/tunnel/update")
async def update_tunnel(payload: dict):
    """Hot-update LLM_WEBHOOK_PUBLIC_URL without restarting the backend."""
    url = payload.get("url", "").strip().rstrip("/")
    if not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="URL must start with https://")
    config.LLM_WEBHOOK_PUBLIC_URL = url
    import os, re as _re
    env_path = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".env"))
    if os.path.exists(env_path):
        txt = open(env_path).read()
        txt = _re.sub(r"LLM_WEBHOOK_PUBLIC_URL=.*", f"LLM_WEBHOOK_PUBLIC_URL={url}", txt)
        open(env_path, "w").write(txt)
    logger.info("Tunnel URL updated: %s", url)
    return {"ok": True, "llm_webhook": f"{url}/v1/chat/completions"}


# ── Verbal approval event passthrough ─────────────────────────────────────────

@app.post("/agent/think")
async def agent_think(payload: dict):
    """
    Inject a message into the agent's thinking pipeline.
    Body: {"message": "say this verbally"}
    """
    message = payload.get("message", "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")
    ok = await agora_agent.send_think(message)
    return {"ok": ok, "message": message}
