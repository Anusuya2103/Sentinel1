# SENTINEL-1

## AI Incident Commander
Sentinel-1 is a near-real-time emergency-response dashboard with an AI voice participant. It combines Agora Conversational AI, live responder transcripts, simulated sensor telemetry, conflict analysis, and human-approved intervention actions in one operational interface.

The system is designed around a strict rule: **the AI can recommend an action, but it cannot dispatch that action without an operator approving it.**
## Features

### Live voice operations
- Agora RTC voice channel for responders.
- Browser microphone publishing with selectable responder role:
  - Fire Chief
  - Traffic Control
  - Hazmat Lead
- Sentinel-1 joins the same Agora channel as an AI participant.
- Managed speech-to-text and text-to-speech through Agora Conversational AI.
- Start and stop the AI agent from the dashboard.
- Live agent status, session ID, remote participant count, microphone mute, and connection state.

### Incident intelligence
- Live transcript feed grouped by responder.
- Sensor telemetry for temperature and chlorine concentration.
- Sensor history and trend indicators.
- Zone map for Warehouse B, Chemical Storage, Command Post, staging, and evacuation gates.
- Conflict engine that analyzes responder statements against telemetry on a configurable interval.
- Priority levels: `P1_CRITICAL`, `P2_HIGH`, and `P3_ADVISORY`.
- Incident timeline and active hazard indicators.
- AI interruption for critical conflicts.

### Human-in-the-loop controls
- Recommended actions are created as `DRAFT_PENDING_APPROVAL`.
- Operators review the incident, rationale, confidence, and target action.
- `Approve & Dispatch` is the only route that changes an action to `DISPATCHED`.
- Dispatch audit log records the approval event.
- The conflict engine and LLM webhook cannot dispatch actions directly.

### Auto Demo
The dashboard includes an **Auto Demo** button for presentations and testing. It:

1. Starts the AI agent when no session is active.
2. Sends a spoken opening prompt to Sentinel-1.
3. Streams scripted Fire Chief, Traffic Control, and Hazmat Lead transmissions to the dashboard.
4. Sends each scripted line through the Agora agent for TTS.
5. Uses browser speech synthesis for `demo_auto` transcript lines as a local audio fallback.
6. Triggers a deterministic sensor spike and lets the conflict engine generate incidents.

For Agora audio, click **Join Channel** first and allow microphone/audio permissions. Browser fallback speech requires the tab to remain active and the browser/system volume to be enabled.
## Architecture

```text
Responder microphone
  |
  v
Agora RTC channel <------ Sentinel-1 Agora AI agent
  |                         |
  v                         +--> managed STT
Dashboard WebSocket               +--> custom LLM webhook
                                  +--> managed TTS

Transcript events + sensor telemetry
  |
  v
Conflict engine (configurable tick, default 8 seconds)
  |
  +--> state and WebSocket dashboard updates
  +--> draft intervention actions
  +--> critical conflict interruption and verbal warning

Agora custom LLM request
  |
  v
Cloudflare Tunnel -> FastAPI /v1/chat/completions -> Groq or fallback LLM
```

## Technology
| Area | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| UI motion | Framer Motion |
| Voice | Agora RTC Web SDK and Conversational AI Engine |
| Speech-to-text | Agora-managed Deepgram integration |
| Text-to-speech | Agora-managed OpenAI `tts-1` voice |
| LLM | Groq through LiteLLM, with configured fallback model |
| Backend | FastAPI, Uvicorn, asyncio |
| Realtime transport | Native WebSocket |
| Public webhook | Cloudflare Tunnel |
| CI/CD | Jenkins on a Windows agent |
## Requirements

- Python 3.11 or newer
- Node.js 18 or newer
- An Agora project with Conversational AI enabled
- Agora App ID and App Certificate
- Agora RESTful API customer ID and secret
- Groq API key
- Cloudflare `cloudflared` when Agora must reach the local LLM webhook
- Jenkins and a Windows build agent for Jenkins deployment

## Local setup
### 1. Clone and configure

```bash
git clone https://github.com/Anusuya2103/Sentinel1.git
cd Sentinel1
copy .env.example .env
```
On macOS/Linux, use `cp .env.example .env` instead of `copy`.

Fill in the required values in `.env`. Never commit `.env` or API credentials.
### 2. Install dependencies

Backend:
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

Frontend, from the repository root:

```bash
cd frontend
npm ci
```
Use `npm install` only when intentionally changing frontend dependencies or regenerating the lockfile.

### 3. Start the backend
```bash
cd backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
### 4. Start the frontend

In a second terminal:

```bash
cd frontend
npm run dev
```
Open <http://localhost:5173>.

### 5. Expose the LLM webhook when needed
Agora must be able to reach the backend's custom LLM endpoint. Start a temporary Cloudflare tunnel:

```bash
cloudflared tunnel --url http://localhost:8000
```
Set the resulting HTTPS URL in `.env`:

```env
LLM_WEBHOOK_PUBLIC_URL=https://your-tunnel.trycloudflare.com
```
Restart the backend or use the tunnel update endpoint. The helper script `start_tunnel.ps1` detects the tunnel URL and updates the backend configuration.

## Using the dashboard
1. Start the backend and frontend.
2. Click **Start Agent** and wait for the status to become `ACTIVE`.
3. Choose a role and click **Join Channel** to publish microphone audio and receive Sentinel-1 audio.
4. Use **Auto Demo** for a scripted voice and incident scenario.
5. Watch the transcript feed, telemetry, zone map, conflict hub, and incident timeline.
6. Review any draft action and click **Approve & Dispatch** only when the operator authorizes it.

## Jenkins deployment
The checked-in `Jenkinsfile` defines a Windows-agent pipeline that:

1. Checks out the selected repository and branch.
2. Installs Python and frontend dependencies.
3. Compiles all backend modules.
4. Builds the production frontend with the configured deployment host.
5. Stops services using ports `8000` and `4173`.
6. Starts FastAPI on port `8000` and Vite Preview on port `4173`.
7. Runs backend and frontend smoke tests.
8. Archives runtime logs.

### Jenkins setup
1. Install Python, Node.js, Git, and Jenkins on the Windows agent. The Jenkins service account must be able to run `py`, `npm`, and `git`.
2. Create a Pipeline job using **Pipeline script from SCM**.
3. Configure the repository URL and branch, or provide them as the pipeline parameters `GIT_REPOSITORY` and `GIT_BRANCH`.
4. Set `DEPLOY_HOST` to the hostname or LAN IP that users will use to open the dashboard.
5. Provide backend secrets through a protected `backend/.env` on the deployment host or Jenkins-managed credentials. Do not commit secrets.
6. Run the job.

After a successful deployment:
- Dashboard: `http://<deploy-host>:4173`
- FastAPI health check: `http://<deploy-host>:8000/`

The Jenkins pipeline does not create a public tunnel. Run Cloudflare Tunnel separately on the deployment host when Agora needs to access the LLM webhook.
## Environment variables

| Variable | Required | Description |
|---|---:|---|
| `GROQ_API_KEY` | Yes | Groq API key used by the LLM integration |
| `AGORA_APP_ID` | Yes | Agora project App ID |
| `AGORA_APP_CERTIFICATE` | Yes | Agora App Certificate |
| `AGORA_CUSTOMER_ID` | Yes | Agora RESTful API customer ID |
| `AGORA_CUSTOMER_SECRET` | Yes | Agora RESTful API customer secret |
| `LLM_WEBHOOK_PUBLIC_URL` | Yes for Agora | Public HTTPS base URL for the custom LLM webhook |
| `CONFLICT_TICK_SECONDS` | No | Conflict analysis interval; default is `8` |
| `PRIMARY_MODEL` | No | Primary model identifier |
| `FALLBACK_MODEL` | No | Fallback model identifier |
| `WEBHOOK_URL` | No | Configured external webhook placeholder/integration URL |

Frontend builds can override local defaults with:
```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws
```
## API reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/` | Health and state summary |
| `WS` | `/ws` | Live dashboard events |
| `POST` | `/agent/start` | Start an Agora AI agent session |
| `POST` | `/agent/stop` | Stop the active agent session |
| `GET` | `/agent/status` | Read local and Agora agent status |
| `POST` | `/agent/think` | Ask the active agent to speak a supplied message |
| `POST` | `/v1/chat/completions` | Agora custom LLM webhook |
| `POST` | `/llm_webhook` | Alternate LLM webhook route |
| `POST` | `/rtc/token` | Create an RTC token for the browser |
| `POST` | `/approve_action` | Approve and dispatch a draft action |
| `GET` | `/state` | Full in-memory state snapshot |
| `GET` | `/audit_log` | Dispatch audit events |
| `POST` | `/debug/run_demo` | Start the full Auto Demo scenario |
| `POST` | `/debug/reset` | Reset demo state |
| `POST` | `/debug/trigger_spike` | Trigger deterministic sensor spike |
| `POST` | `/debug/inject_transcript` | Inject a test responder transcript |
| `POST` | `/tunnel/update` | Update the public LLM webhook URL |

## Manual API demo

With the backend running:
```bash
curl -X POST http://localhost:8000/debug/inject_transcript \
  -H "Content-Type: application/json" \
  -d "{\"responder_id\":\"Fire_Chief\",\"text\":\"Warehouse B contained, safe to enter\"}"

curl -X POST http://localhost:8000/debug/inject_transcript \
  -H "Content-Type: application/json" \
  -d "{\"responder_id\":\"Hazmat_Lead\",\"text\":\"Sensor B at 85ppm chlorine, DO NOT enter\"}"

curl -X POST http://localhost:8000/debug/trigger_spike
```

Wait for the conflict engine tick, inspect the draft action, and approve it from the dashboard.

## Troubleshooting voice

- **No Agora voice:** click **Join Channel**, allow microphone permissions, and confirm the AI status is `ACTIVE`.
- **No browser fallback voice:** keep the dashboard tab active, enable browser autoplay/audio, and check system volume and the selected speech output device.
- **Agent cannot answer:** verify `LLM_WEBHOOK_PUBLIC_URL` points to an HTTPS Cloudflare Tunnel URL and that `/v1/chat/completions` is reachable from the public internet.
- **Dashboard says reconnecting:** confirm FastAPI is running on port `8000`; the dashboard automatically retries the WebSocket connection.
- **Stale screen after code changes:** stop and restart Vite, then reload the page with the browser cache bypassed.

## Project structure
```text
sentinel1/
├── Jenkinsfile
├── README.md
├── .env.example
├── start_tunnel.ps1
├── backend/
│   ├── main.py              # FastAPI routes and demo controls
│   ├── config.py            # Environment-backed configuration
│   ├── state.py             # In-memory incident state
│   ├── sensors.py           # Simulated telemetry
│   ├── conflict_engine.py   # Periodic conflict analysis
│   ├── agora_manager.py     # Agora agent lifecycle, TTS, and interruption
│   ├── llm_webhook.py       # Custom LLM webhook handling
│   ├── actions.py           # HITL action approval and dispatch
│   ├── ws_hub.py            # Dashboard WebSocket broadcast hub
│   └── requirements.txt
└── frontend/
  ├── package.json
  ├── package-lock.json
  └── src/
    ├── App.tsx
    ├── index.css
    ├── hooks/useWebSocket.ts
    └── components/
      ├── AgentControls.tsx
      ├── DissonanceBanner.tsx
      ├── DraftActionCard.tsx
      ├── IncidentList.tsx
      ├── IncidentTimeline.tsx
      ├── InterventionHub.tsx
      ├── TelemetryPanel.tsx
      ├── TranscriptFeed.tsx
      ├── VoiceChannel.tsx
      └── ZoneMap.tsx
```

## Safety model

Sentinel-1 is a decision-support and demonstration system, not a certified emergency-dispatch platform. It does not replace trained responders or local emergency procedures.

The software enforces human approval in the action flow: analysis produces recommendations, while `/approve_action` is the explicit operator-controlled dispatch boundary.

Built for the EchoSphere Hackathon 2025 Agora Conversational AI track.
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

## Jenkins deployment

Jenkins can build and run the project on a Windows agent using the checked-in `Jenkinsfile`.

1. Install Python 3.11+, Node.js 18+, and Jenkins on the agent. Ensure `py`, `npm`, and `git` are available to the Jenkins service account.
2. Create a Pipeline job, choose **Pipeline script from SCM**, and point it at this repository and the branch to deploy.
3. Add the environment variables from `.env.example` to the Jenkins agent's `backend/.env` file. Keep API keys in Jenkins Credentials or a protected agent environment, never in source control.
4. Run the job with `DEPLOY_HOST` set to the agent's hostname or LAN IP. Jenkins installs dependencies, compiles the backend, builds the frontend with the correct API and WebSocket URLs, starts both services, and checks `/` and the frontend before reporting success.

The deployed dashboard is available at `http://<jenkins-host>:4173`; the FastAPI health endpoint is at `http://<jenkins-host>:8000`. For Agora's public webhook, run Cloudflare Tunnel on the deployment host and set `LLM_WEBHOOK_PUBLIC_URL` to its HTTPS URL. The pipeline intentionally does not expose secrets or create a public tunnel automatically.

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
