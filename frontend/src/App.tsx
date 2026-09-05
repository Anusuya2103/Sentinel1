import { useState, useEffect } from "react";
import { Shield, Radio, Activity, Clock, Zap, AlertTriangle, Play, RotateCcw, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "./hooks/useWebSocket";
import AgentControls from "./components/AgentControls";
import TranscriptFeed from "./components/TranscriptFeed";
import TelemetryPanel from "./components/TelemetryPanel";
import ZoneMap from "./components/ZoneMap";
import InterventionHub from "./components/InterventionHub";
import VoiceChannel from "./components/VoiceChannel";
import IncidentTimeline from "./components/IncidentTimeline";
import type { ConflictAlert } from "./hooks/useWebSocket";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function Clock24() {
  const [time, setTime] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="font-mono text-[11px] text-muted tabular-nums">{time.toUTCString().slice(17, 25)} UTC</span>;
}

function DemoControls() {
  const [running, setRunning] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function runDemo() {
    setRunning(true);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    try {
      const response = await fetch(`${BACKEND}/debug/run_demo`, { method: "POST" });
      if (!response.ok) throw new Error("Demo request failed");
      setTimeout(() => setRunning(false), 150000);
    } catch { setRunning(false); }
  }

  async function resetDemo() {
    setResetting(true);
    try { await fetch(`${BACKEND}/debug/reset`, { method: "POST" }); }
    catch { /* ignore */ }
    finally { setTimeout(() => setResetting(false), 500); }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button onClick={resetDemo} disabled={resetting}
        className="flex items-center gap-1 font-mono text-[9px] px-2 py-1 border border-border2 text-dim hover:text-muted hover:border-muted transition-all disabled:opacity-40">
        <RotateCcw size={9} className={resetting ? "animate-spin" : ""} />
        Reset
      </button>
      <button onClick={runDemo} disabled={running}
        className="flex items-center gap-1 font-mono text-[9px] px-2 py-1 border border-cyan/40 text-cyan hover:bg-cyan hover:text-base transition-all disabled:opacity-40">
        <Play size={9} />
        {running ? "Running..." : "Auto Demo"}
      </button>
    </div>
  );
}

function MissionCompleteOverlay({ onReset }: { onReset: () => Promise<void> }) {
  const [resetting, setResetting] = useState(false);

  async function resetMission() {
    setResetting(true);
    await onReset();
    setResetting(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/95 px-6"
    >
      <motion.div
        initial={{ scale: 0.94, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-xl border border-safe/50 bg-surface p-8 text-center shadow-[0_0_60px_rgba(16,185,129,0.16)]"
      >
        <CheckCircle2 size={48} className="mx-auto text-safe" />
        <p className="mt-5 font-mono text-[11px] tracking-[0.3em] text-safe">MISSION STATUS</p>
        <h2 className="mt-2 font-mono text-3xl font-bold tracking-wide text-text">SUCCESSFULLY COMPLETED</h2>
        <p className="mx-auto mt-4 max-w-md font-sans text-sm leading-relaxed text-muted">
          Incident scenario completed. Sensor escalation was detected, the conflict was surfaced, and the response remained under human control.
        </p>
        <div className="mt-6 grid grid-cols-3 gap-2 border-y border-border py-4 font-mono text-[10px] text-dim">
          <span>THREAT DETECTED</span>
          <span>CONFLICT RESOLVED</span>
          <span>HITL ENFORCED</span>
        </div>
        <button
          onClick={resetMission}
          disabled={resetting}
          className="mt-6 inline-flex items-center gap-2 border border-safe/50 px-4 py-2 font-mono text-[10px] uppercase tracking-wide text-safe transition-all hover:bg-safe hover:text-base disabled:opacity-50"
        >
          <RotateCcw size={11} className={resetting ? "animate-spin" : ""} />
          {resetting ? "Resetting" : "Run Another Mission"}
        </button>
      </motion.div>
    </motion.div>
  );
}

const HAZARD_CFG: Record<string, { strip: string; dot: string; text: string; label: string }> = {
  LOW:      { strip: "bg-safe/8 border-safe/20",           dot: "bg-safe",     text: "text-safe",     label: "NOMINAL"   },
  MODERATE: { strip: "bg-warning/8 border-warning/20",     dot: "bg-warning",  text: "text-warning",  label: "MODERATE"  },
  HIGH:     { strip: "bg-critical/12 border-critical/30",  dot: "bg-critical", text: "text-critical", label: "HIGH"      },
  CRITICAL: { strip: "bg-critical/15 border-critical/40",  dot: "bg-critical", text: "text-critical", label: "CRITICAL"  },
};

function HazardStrip({ hazardLevel, conflict, agentStatus, connected, lastConflictAt, onDismiss }: {
  hazardLevel: string;
  conflict: ConflictAlert | null;
  agentStatus: string;
  connected: boolean;
  lastConflictAt: number | null;
  onDismiss: () => void;
}) {
  const cfg = HAZARD_CFG[hazardLevel] ?? HAZARD_CFG.MODERATE;
  const alarm = conflict !== null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!lastConflictAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - lastConflictAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [lastConflictAt]);

  return (
    <motion.div
      className={`h-8 border-b flex items-center px-4 gap-3 shrink-0 transition-colors duration-300 ${
        alarm ? "bg-critical/15 border-critical/50 glow-red" : `${cfg.strip} border-b`
      }`}
      animate={alarm ? { opacity: [1, 0.82, 1] } : {}}
      transition={{ duration: 0.8, repeat: Infinity }}
    >
      <div className="flex items-center gap-2 shrink-0">
        <motion.span
          className={`h-2 w-2 rounded-full ${alarm ? "bg-critical" : cfg.dot}`}
          animate={{ opacity: (alarm || hazardLevel !== "LOW") ? [1, 0.2, 1] : 1 }}
          transition={{ duration: 0.7, repeat: (alarm || hazardLevel !== "LOW") ? Infinity : 0 }}
        />
        <span className={`font-mono text-[11px] font-semibold ${alarm ? "text-critical" : cfg.text}`}>
          HAZARD: {alarm ? "CRITICAL" : cfg.label}
        </span>
      </div>

      {alarm && conflict && (
        <>
          <span className="text-critical/40 font-mono text-[10px]">|</span>
          <AlertTriangle size={11} className="text-critical shrink-0" />
          <span className="font-mono text-[11px] text-critical font-medium truncate">
            DISSONANCE — {conflict.description}
          </span>
          {lastConflictAt && (
            <span className="font-mono text-[10px] text-critical/60 shrink-0">
              {elapsed}s ago
            </span>
          )}
          <span className="font-mono text-[10px] text-critical/60 shrink-0 ml-auto">
            {Math.round((conflict.confidence ?? 0) * 100)}% conf
          </span>
          <button onClick={onDismiss}
            className="font-mono text-[10px] border border-critical/30 text-critical/70 hover:text-critical px-2 py-0.5 shrink-0 transition-colors">
            ACK
          </button>
        </>
      )}

      {!alarm && (
        <div className="ml-auto flex items-center gap-5">
          <span className="font-mono text-[10px] text-dim">EVAC: North_Gate · East_Gate</span>
          <span className="font-mono text-[10px] text-dim">|</span>
          <span className={`font-mono text-[10px] ${connected ? "text-safe" : "text-critical"}`}>
            {connected ? "● WS LIVE" : "○ RECONNECTING"}
          </span>
          <span className="font-mono text-[10px] text-dim">|</span>
          <span className="font-mono text-[10px] text-cyan">AI: {agentStatus.toUpperCase()}</span>
        </div>
      )}
    </motion.div>
  );
}

export default function App() {
  const dash = useWebSocket();
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const [highlightSensor, setHighlightSensor] = useState<string | null>(null);

  const conflictKey = dash.activeConflict?.incident_id ?? "none";
  const showConflict = dash.activeConflict !== null && !conflictDismissed;
  const pendingActions = Object.values(dash.actions).filter(a => a.status === "DRAFT_PENDING_APPROVAL").length;

  // Reset dismissed when new conflict arrives
  useEffect(() => { setConflictDismissed(false); }, [dash.activeConflict?.incident_id]);

  return (
    <div className="h-screen bg-base text-text flex flex-col font-sans overflow-hidden" style={{ fontSize: "13px" }}>

      {/* ── HEADER ── */}
      <header className="h-11 border-b border-border bg-surface flex items-center px-4 gap-0 shrink-0">
        <div className="flex items-center gap-2.5 w-48 shrink-0">
          <div className="relative">
            <Shield size={14} className="text-cyan" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-cyan blink" />
          </div>
          <span className="font-mono text-sm font-semibold tracking-widest text-text">SENTINEL-1</span>
        </div>

        <div className="flex-1 flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 border border-critical/30 bg-critical/8 px-3 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-critical blink" />
            <span className="font-mono text-[11px] text-critical font-medium">🔴 INCIDENT ACTIVE</span>
          </div>
          <span className="text-dim font-mono text-[11px]">|</span>
          <span className="font-mono text-[11px] text-muted">Municipal Industrial Park · Chemical Fire + Gas Leak</span>
          <span className="text-dim font-mono text-[11px]">|</span>
          <span className={`font-mono text-[11px] font-bold ${
            dash.hazardLevel === "CRITICAL" || dash.hazardLevel === "HIGH" ? "text-critical" :
            dash.hazardLevel === "MODERATE" ? "text-warning" : "text-safe"
          }`}>{dash.hazardLevel}</span>
          <span className="text-dim font-mono text-[11px]">|</span>
          <div className="flex items-center gap-1.5">
            <Radio size={10} className="text-cyan" />
            <span className="font-mono text-[11px] text-cyan">sentinel1-incident</span>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Model + latency pill */}
          <div className="flex items-center gap-2 border border-border px-2.5 py-1 bg-surface2">
            <span className="font-mono text-[10px] text-cyan">qwen3.8-27b</span>
            {dash.agentLatencyMs !== null && (
              <>
                <span className="text-border font-mono text-[10px]">|</span>
                <span className={`font-mono text-[10px] ${dash.agentLatencyMs < 500 ? "text-safe" : dash.agentLatencyMs < 1500 ? "text-warning" : "text-critical"}`}>
                  {dash.agentLatencyMs}ms
                </span>
              </>
            )}
          </div>
          <Clock24 />
          <div className="h-4 w-px bg-border" />
          <DemoControls />
          <div className="h-4 w-px bg-border" />
          <AgentControls agentStatus={dash.agentStatus} sessionId={dash.agentSessionId} connected={dash.connected} />
        </div>
      </header>

      {/* ── HAZARD STRIP ── */}
      <div key={conflictKey}>
        <HazardStrip
          hazardLevel={dash.hazardLevel}
          conflict={showConflict ? dash.activeConflict : null}
          agentStatus={dash.agentStatus}
          connected={dash.connected}
          lastConflictAt={dash.lastConflictAt}
          onDismiss={() => setConflictDismissed(true)}
        />
      </div>

      {/* ── MAIN GRID ── */}
      <main className="flex-1 grid min-h-0 overflow-hidden" style={{
        gridTemplateColumns: "2.5fr 6.5fr 3fr",
        height: "calc(100vh - 114px)"
      }}>
        <div className="border-r border-border flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 min-h-0 overflow-hidden">
            <TranscriptFeed transcripts={dash.transcripts} />
          </div>
          <VoiceChannel role="Fire_Chief" />
        </div>

        {/* COL 2: Intervention Hub + Timeline (6.5) */}
        <div className="border-r border-border flex flex-col min-h-0 overflow-hidden">
          <div style={{ height: "62%" }} className="min-h-0 overflow-hidden border-b border-border">
            <InterventionHub
              incidents={dash.incidents}
              actions={dash.actions}
              activeConflict={showConflict ? dash.activeConflict : null}
              lastTickMs={dash.lastTickMs}
            />
          </div>
          <div style={{ height: "38%" }} className="min-h-0 overflow-hidden">
            <IncidentTimeline
              incidents={dash.incidents}
              actions={dash.actions}
            />
          </div>
        </div>

        <div className="flex flex-col min-h-0 overflow-hidden">
          <div style={{ height: "52%" }} className="shrink-0 border-b border-border overflow-hidden">
            <ZoneMap
              hazardLevel={dash.hazardLevel}
              activeFires={dash.activeFires}
              safeRoutes={dash.safeRoutes}
              highlightSensor={highlightSensor}
            />
          </div>
          <div className="flex-1 min-h-0 overflow-hidden">
            <TelemetryPanel
              sensors={dash.sensors}
              sensorHistory={dash.sensorHistory}
              sensorTrends={dash.sensorTrends}
              hazardLevel={dash.hazardLevel}
              activeFires={dash.activeFires}
              chemicalThreat={dash.chemicalThreat}
              onSensorHover={setHighlightSensor}
            />
          </div>
        </div>
      </main>

      {/* ── FOOTER ── */}
      <footer className="h-6 border-t border-border bg-surface flex items-center px-4 gap-4 shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity size={9} className="text-safe" />
          <span className="font-mono text-[10px] text-dim">voice: Agora RTC · p2p &lt;50ms</span>
        </div>
        <span className="text-border">|</span>
        <div className="flex items-center gap-1.5">
          <Clock size={9} className="text-cyan" />
          <span className="font-mono text-[10px] text-dim">intelligence: 8s tick · Groq qwen3.8</span>
        </div>
        <span className="text-border">|</span>
        <div className="flex items-center gap-1.5">
          <Zap size={9} className={pendingActions > 0 ? "text-warning" : "text-dim"} />
          <span className={`font-mono text-[10px] ${pendingActions > 0 ? "text-warning" : "text-dim"}`}>
            {dash.incidentCount} incidents · {pendingActions} pending approval
          </span>
        </div>
        <span className="ml-auto font-mono text-[10px] text-dim">EchoSphere 2025 · Agora ConvoAI</span>
      </footer>
      {dash.demoComplete && (
        <MissionCompleteOverlay onReset={async () => {
          await fetch(`${BACKEND}/debug/reset`, { method: "POST" });
        }} />
      )}
    </div>
  );
}
