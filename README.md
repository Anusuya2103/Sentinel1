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
