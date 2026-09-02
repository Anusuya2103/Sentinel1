"""
Mock IoT sensor background task.

Sensor_A: East Warehouse — thermal (°C), baseline 40–80
Sensor_B: Chemical Storage — toxicity (ppm), baseline 10–40

Random-walks values every 2–3s.
Spike is deterministic: triggered via POST /debug/trigger_spike, NOT random timing.
"""
import asyncio
import logging
import random
import time

import state
from ws_hub import manager as ws_manager

logger = logging.getLogger("sentinel1.sensors")

# ── Sensor state ──────────────────────────────────────────────────────────────
_sensors = {
    "Sensor_A": {"value": 45.0, "min": 35.0, "max": 85.0, "step": 3.0},
    "Sensor_B": {"value": 18.0, "min": 8.0,  "max": 45.0, "step": 2.0},
}

_spike_pending: bool = False
_spike_triggered_at: float | None = None

# Spike targets (demo-scripted values that push hazard to CRITICAL)
SPIKE_VALUES = {
    "Sensor_A": 185.0,  # well above 150°C CRITICAL threshold
    "Sensor_B": 92.0,   # well above 80 ppm CRITICAL threshold
}


def trigger_spike() -> dict:
    """Called by the /debug/trigger_spike endpoint. Deterministic for demo."""
    global _spike_pending, _spike_triggered_at
    _spike_pending = True
    _spike_triggered_at = time.time()
    logger.info("Sensor spike queued — will apply on next tick")
    return {"status": "spike_queued", "targets": SPIKE_VALUES}


async def run_sensors() -> None:
    """Background task — runs forever."""
    global _spike_pending

    logger.info("Sensor simulation started")
    while True:
        await asyncio.sleep(random.uniform(2.0, 3.0))
        try:
            await _tick()
        except Exception:
            logger.exception("Sensor tick error (continuing)")


async def _tick() -> None:
    global _spike_pending

    telemetry: dict = {}

    for sensor_id, cfg in _sensors.items():
        if _spike_pending:
            # Apply scripted spike
            new_val = SPIKE_VALUES[sensor_id]
        else:
            # Random walk within bounds
            delta = random.uniform(-cfg["step"], cfg["step"])
            new_val = max(cfg["min"], min(cfg["max"], cfg["value"] + delta))

        cfg["value"] = round(new_val, 1)
        state.update_sensors(sensor_id, new_val)
        telemetry[sensor_id] = {
            "value": cfg["value"],
            "unit": state.get_state()["sensors"][sensor_id]["unit"],
            "location": state.get_state()["sensors"][sensor_id]["location"],
        }

    if _spike_pending:
        _spike_pending = False
        logger.warning("Sensor spike applied: %s", telemetry)

    # Recalc hazard (update_sensors does this, but broadcast needs the latest state)
    current_hazard = state.get_state()["hazard_level"]

    await ws_manager.broadcast("telemetry_update", {
        "sensors": telemetry,
        "hazard_level": current_hazard,
        "timestamp": time.time(),
    })
