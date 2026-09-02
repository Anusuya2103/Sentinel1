# SENTINEL-1 — AI Incident Commander

> EchoSphere Hackathon 2025 · Agora Conversational AI Track

[![Agora ConvoAI](https://img.shields.io/badge/Agora-Conversational%20AI-blue)](https://docs.agora.io/en/conversational-ai/overview) [![FastAPI](https://img.shields.io/badge/FastAPI-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com) [![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev) [![Groq](https://img.shields.io/badge/LLM-Groq-orange)](https://console.groq.com)

**A near-real-time AI voice agent that joins emergency response channels as a live participant, detects conflicts between responders, and requires human approval before dispatching any action.**

---

## What it does

Three human responders (Fire Chief, Traffic Control, Hazmat Lead) join a shared Agora voice channel. Sentinel-1 AI joins as a 4th live participant powered by Agora Conversational AI Engine. It:

- Listens to all responders via Agora managed ASR
- Analyzes transcripts every 8 seconds against live IoT sensor data  
- Detects conflicts — Fire Chief says safe while Hazmat sensor reads 92ppm
- Speaks back verbally — "Hazmat Lead, that conflicts with Sensor B"
- Interrupts the conversation on P1 Critical conflicts
- Never dispatches without human approval — HITL enforced by construction

---

## Architecture

```
VOICE PATH (sub-second, Agora P2P)
Browser Mic -> Agora RTC -> Sentinel-1 AI Agent (UID 12345)
                                    |
                            Agora ConvoAI Engine
                            STT: Ares (managed, no key)
                            TTS: OpenAI tts-1 (managed, no key)
                            LLM: BYO webhook

                    POST /v1/chat/completions
                    Cloudflare Tunnel -> localhost:8000

INTELLIGENCE PATH (8s tick)
conflict_engine.py:
  transcripts + IoT sensors -> LLM analysis -> structured JSON
  -> state -> WebSocket -> Dashboard
  -> P1 CRITICAL? -> interrupt_agent() -> AI speaks up
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Voice | Agora Conversational AI Engine + RTC Web SDK |
| STT | Agora-managed Ares (no separate key needed) |
| LLM | Groq qwen/qwen3.8-27b — free tier |
| TTS | Agora-managed OpenAI tts-1 (no separate key needed) |
| Backend | FastAPI + uvicorn + asyncio, Python 3.12 |
| Frontend | Vite + React 18 + TypeScript + Tailwind CSS |
| Animations | Framer Motion |
| Transport | Native WebSocket |
| Tunnel | Cloudflare Tunnel |

---

## Quick Start

### Prerequisites

- Python 3.11+, Node 18+
- Agora account with Conversational AI enabled
- Groq API key — free at console.groq.com
- Cloudflare: `winget install Cloudflare.cloudflared`

### 1. Clone and configure

```bash
git clone https://github.com/Anusuya2103/Sentinel1.git
cd Sentinel1
cp .env.example .env
```

### 2. Install

```bash
cd backend && pip install -r requirements.txt
cd ../frontend && npm install
```

### 3. Enable Agora Conversational AI

```bash
npm install -g agoraio-cli
agora login
agora project use YOUR_APP_ID
agora project feature enable convoai
```

### 4. Start Cloudflare tunnel

```bash
cloudflared tunnel --url http://localhost:8000
# Paste the https://xxx.trycloudflare.com URL into .env as LLM_WEBHOOK_PUBLIC_URL
```

### 5. Run

Terminal 1:
```bash
cd backend && python -m uvicorn main:app --port 8000 --reload
```

Terminal 2:
```bash
cd frontend && npm run dev
```

Open http://localhost:5173

---

## Demo Script

```bash
# Phase 1 — conflicting reports
curl -X POST http://localhost:8000/debug/inject_transcript -H "Content-Type: application/json" -d "{\"responder_id\":\"Fire_Chief\",\"text\":\"Warehouse B contained, safe to enter\"}"
curl -X POST http://localhost:8000/debug/inject_transcript -H "Content-Type: application/json" -d "{\"responder_id\":\"Hazmat_Lead\",\"text\":\"Sensor B at 85ppm chlorine, DO NOT enter\"}"

# Phase 2 — sensor spike to CRITICAL
curl -X POST http://localhost:8000/debug/trigger_spike

# Phase 3 — escalation
curl -X POST http://localhost:8000/debug/inject_transcript -H "Content-Type: application/json" -d "{\"responder_id\":\"Traffic_Control\",\"text\":\"East Gate must stay open, ambulances inbound\"}"
curl -X POST http://localhost:8000/debug/inject_transcript -H "Content-Type: application/json" -d "{\"responder_id\":\"Hazmat_Lead\",\"text\":\"Close East Gate NOW, mass casualty risk\"}"
```

Wait 8 seconds after each phase. Watch the red conflict banner fire and click Approve and Dispatch.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| GROQ_API_KEY | Yes | Free at console.groq.com |
| AGORA_APP_ID | Yes | Agora Console |
| AGORA_APP_CERTIFICATE | Yes | Agora Console |
| AGORA_CUSTOMER_ID | Yes | Console username RESTful API Keys |
| AGORA_CUSTOMER_SECRET | Yes | Same location |
| LLM_WEBHOOK_PUBLIC_URL | Yes | Cloudflare tunnel URL |
| CONFLICT_TICK_SECONDS | No | Default 8 |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | / | Health + state summary |
| WS | /ws | Dashboard WebSocket |
| POST | /agent/start | Start AI agent session |
| POST | /agent/stop | Stop agent |
| POST | /v1/chat/completions | Agora BYO-LLM webhook |
| POST | /approve_action | HITL dispatch approval |
| POST | /rtc/token | RTC token for browser mic |
| GET | /state | Full state dump |
| GET | /audit_log | Dispatch audit trail |
| POST | /debug/trigger_spike | Force CRITICAL spike |
| POST | /debug/inject_transcript | Inject test transcript |

---

## Key Design Decisions

AI never self-dispatches. The LLM only writes DRAFT_PENDING_APPROVAL. POST /approve_action is the only code path to DISPATCHED. There is no import of actions.py from conflict_engine.py or llm_webhook.py.

Role authority weights:

| Role | Chemical | Fire | Traffic |
|------|----------|------|---------|
| Hazmat_Lead | 0.9 | 0.3 | 0.3 |
| Fire_Chief | 0.4 | 0.85 | 0.3 |
| Traffic_Control | 0.4 | 0.3 | 0.9 |

---

## Project Structure

```
sentinel1/
├── .env.example
├── backend/
│   ├── main.py
│   ├── state.py
│   ├── ws_hub.py
│   ├── agora_manager.py
│   ├── llm_webhook.py
│   ├── conflict_engine.py
│   ├── sensors.py
│   ├── actions.py
│   ├── config.py
│   └── requirements.txt
└── frontend/
    └── src/
        ├── App.tsx
        ├── hooks/useWebSocket.ts
        └── components/
            ├── TranscriptFeed.tsx
            ├── TelemetryPanel.tsx
            ├── ZoneMap.tsx
            ├── IncidentList.tsx
            ├── DraftActionCard.tsx
            ├── AgentControls.tsx
            └── VoiceChannel.tsx
```

---

Built for EchoSphere Hackathon 2025 — Agora Conversational AI track

Made by Anusuya
