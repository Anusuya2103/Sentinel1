"""
Dispatch actions — human-approved only.

POST /approve_action  ->  marks DISPATCHED in state, fires mock webhook, audit logs.

IMPORTANT: No import of this module from llm_webhook.py or conflict_engine.py.
The LLM path only writes DRAFT_PENDING_APPROVAL entries. This file is the sole
code path that can flip status to DISPATCHED.
"""
import logging
import time
from typing import Any

import httpx

import config
import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.actions")


async def approve_and_dispatch(action_id: str, approved_by: str) -> dict[str, Any]:
    """
    Mark action as DISPATCHED, fire mock webhook, broadcast confirmation.
    Returns a result dict.
    """
    success = state.mark_action_dispatched(action_id, approved_by)
    if not success:
        return {"ok": False, "error": f"action_id '{action_id}' not found"}

    action = state.get_state()["actions"][action_id]

    # Fire mock webhook (best-effort — failure is non-fatal)
    webhook_ok = await _fire_webhook(action)

    # Broadcast dispatch event to dashboard
    await ws_manager.broadcast("action_dispatched", {
        "action_id": action_id,
        "approved_by": approved_by,
        "action": action,
        "webhook_delivered": webhook_ok,
        "timestamp": time.time(),
    })

    logger.info("Action DISPATCHED: %s by %s (webhook=%s)", action_id, approved_by, webhook_ok)
    return {"ok": True, "action_id": action_id, "webhook_delivered": webhook_ok}


async def _fire_webhook(action: dict) -> bool:
    """POST action payload to the configured webhook URL (mocked)."""
    if not config.WEBHOOK_URL or "placeholder" in config.WEBHOOK_URL:
        logger.debug("Webhook URL is placeholder — skipping real HTTP call")
        return True  # treat as success for demo

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(config.WEBHOOK_URL, json={
                "event": "action_dispatched",
                "action": action,
                "timestamp": time.time(),
            })
            return resp.status_code < 300
    except Exception as exc:
        logger.warning("Webhook delivery failed: %s", exc)
        return False
