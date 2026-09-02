import { useState, useEffect } from "react";
import { Shield, Radio, AlertTriangle, Activity, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useWebSocket } from "./hooks/useWebSocket";
import AgentControls from "./components/AgentControls";
import TranscriptFeed from "./components/TranscriptFeed";
import TelemetryPanel from "./components/TelemetryPanel";
import ZoneMap from "./components/ZoneMap";
import DraftActionCard from "./components/DraftActionCard";
import IncidentList from "./components/IncidentList";
import VoiceChannel from "./components/VoiceChannel";

function Clock24() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-xs text-muted tabular-nums">
      {time.toUTCString().slice(17, 25)} UTC
    </span>
  );
}

const HAZARD_STRIP: Record<string, { bg: string; text: string; dot: string }> = {
  LOW:      { bg: "bg-safe/10 border-safe/30",     text: "text-safe",     dot: "bg-safe" },
  MODERATE: { bg: "bg-moderate/10 border-moderate/20", text: "text-moderate", dot: "bg-moderate" },
  HIGH:     { bg: "bg-critical/15 border-critical/30", text: "text-critical", dot: "bg-critical" },
  CRITICAL: { bg: "bg-critical/20 border-critical/40", text: "text-critical", dot: "bg-critical" },
};

export default function App() {
  const dash = useWebSocket();
  const [conflictDismissed, setConflictDismissed] = useState(false);
  const conflictKey = dash.activeConflict?.incident_id ?? "none";
  const showConflict = dash.activeConflict !== null && !conflictDismissed;
  const hazardCfg = HAZARD_STRIP[dash.hazardLevel] ?? HAZARD_STRIP.MODERATE;
  const isCritical = dash.hazardLevel === "CRITICAL" || showConflict;

  return (
    <div className="h-screen bg-base text-text flex flex-col font-sans overflow-hidden">

      {/* ── TOP HEADER BAR ─────────────────────────────────────────── */}
      <header className="h-10 border-b border-border bg-panel flex items-center px-4 gap-0 shrink-0 relative">
        {/* Left: logo + title */}
        <div className="flex items-center gap-2.5 w-64 shrink-0">
          <div className="relative">
            <Shield size={15} className="text-safe" />
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-safe blink" />
          </div>
          <span className="font-mono text-sm font-semibold text-text tracking-wider">SENTINEL-1</span>
          <span className="font-mono text-[10px] text-dim border border-dim/40 px-1 rounded">v1.0</span>
        </div>

        {/* Center: incident info */}
        <div className="flex-1 flex items-center justify-center gap-6">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-critical blink" />
            <span className="font-mono text-[11px] text-critical font-medium">INCIDENT ACTIVE</span>
          </div>
          <span className="font-mono text-[11px] text-muted">Municipal Industrial Park · Chemical Fire + Gas Leak</span>
          <div className="flex items-center gap-1.5">
            <Radio size={10} className="text-info" />
            <span className="font-mono text-[11px] text-info">CH: sentinel1-incident</span>
          </div>
        </div>

        {/* Right: clock + agent + ws */}
        <div className="flex items-center gap-4 w-auto shrink-0">
          <Clock24 />
          <div className="h-4 w-px bg-border" />
          <AgentControls
            agentStatus={dash.agentStatus}
            sessionId={dash.agentSessionId}
            connected={dash.connected}
          />
        </div>
      </header>

      {/* ── HAZARD / CONFLICT STRIP ────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${dash.hazardLevel}-${showConflict}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`h-7 border-b flex items-center px-4 gap-4 shrink-0 transition-all duration-300 ${
            showConflict
              ? "bg-critical/20 border-critical/50 glow-red"
              : hazardCfg.bg
          }`}
        >
          <div className="flex items-center gap-2">
            <motion.span
              className={`h-2 w-2 rounded-full ${showConflict ? "bg-critical" : hazardCfg.dot}`}
              animate={isCritical ? { opacity: [1, 0.2, 1] } : {}}
              transition={{ duration: 0.7, repeat: Infinity }}
            />
            <span className={`font-mono text-[11px] font-semibold ${showConflict ? "text-critical" : hazardCfg.text}`}>
              HAZARD LEVEL: {dash.hazardLevel}
            </span>
          </div>

          {showConflict && dash.activeConflict && (
            <>
              <span className="text-critical/50 font-mono text-[11px]">◆</span>
              <AlertTriangle size={11} className="text-critical shrink-0" />
              <span className="font-mono text-[11px] text-critical font-medium truncate max-w-2xl">
                DISSONANCE DETECTED — {dash.activeConflict.description}
              </span>
              <span className="font-mono text-[11px] text-critical/70 ml-auto shrink-0">
                {Math.round((dash.activeConflict.confidence ?? 0) * 100)}% conf
              </span>
              <button
                onClick={() => setConflictDismissed(true)}
                className="font-mono text-[10px] text-critical/60 hover:text-critical border border-critical/30 px-2 py-0.5 shrink-0"
              >
                ACK
              </button>
            </>
          )}

          {!showConflict && (
            <div className="ml-auto flex items-center gap-6">
              <span className="font-mono text-[10px] text-dim">
                EVAC ROUTES: {dash.safeRoutes.join(" · ")}
              </span>
              {dash.activeFires.length > 0 && (
                <span className="font-mono text-[10px] text-critical">
                  FIRES: {dash.activeFires.join(", ")}
                </span>
              )}
              {dash.chemicalThreat && (
                <span className="font-mono text-[10px] text-moderate">
                  CHEM THREAT: {dash.chemicalThreat}
                </span>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* ── MAIN GRID ─────────────────────────────────────────────── */}
      <main className="flex-1 grid grid-cols-12 gap-0 min-h-0 overflow-hidden" style={{ height: "calc(100vh - 108px)" }}>

        {/* COL 1: Transcript feed (3 cols) */}
        <div className="col-span-3 border-r border-border flex flex-col min-h-0">
          <div className="flex-1 overflow-hidden min-h-0">
            <TranscriptFeed transcripts={dash.transcripts} />
          </div>
          <VoiceChannel role="Fire_Chief" />
        </div>

        {/* COL 2: Incidents + Actions (5 cols) */}
        <div className="col-span-5 border-r border-border flex flex-col min-h-0">
          {/* Actions strip at top */}
          <div className="shrink-0">
            <DraftActionCard actions={dash.actions} />
          </div>
          {/* Incidents fill rest */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <IncidentList incidents={dash.incidents} />
          </div>
        </div>

        {/* COL 3: Telemetry + Map (4 cols) */}
        <div className="col-span-4 flex flex-col min-h-0">
          <div className="shrink-0">
            <TelemetryPanel
              sensors={dash.sensors}
              hazardLevel={dash.hazardLevel}
              activeFires={dash.activeFires}
              chemicalThreat={dash.chemicalThreat}
            />
          </div>
          <div className="flex-1 min-h-0">
            <ZoneMap
              hazardLevel={dash.hazardLevel}
              activeFires={dash.activeFires}
              safeRoutes={dash.safeRoutes}
            />
          </div>
        </div>
      </main>

      {/* ── FOOTER STATUS BAR ─────────────────────────────────────── */}
      <footer className="h-6 border-t border-border bg-panel flex items-center px-4 gap-6 shrink-0">
        <div className="flex items-center gap-1.5">
          <Activity size={9} className="text-safe" />
          <span className="font-mono text-[10px] text-dim">voice: Agora RTC p2p &lt;50ms</span>
        </div>
        <span className="text-border">|</span>
        <div className="flex items-center gap-1.5">
          <Clock size={9} className="text-info" />
          <span className="font-mono text-[10px] text-dim">
            intelligence tick: {import.meta.env.VITE_CONFLICT_TICK ?? "8"}s · LLM: qwen3.8-27b via Groq
          </span>
        </div>
        <span className="text-border">|</span>
        <span className="font-mono text-[10px] text-dim">
          {Object.keys(dash.incidents).length} incidents · {Object.values(dash.actions).filter(a => a.status === "DRAFT_PENDING_APPROVAL").length} pending actions
        </span>
        <span className="ml-auto font-mono text-[10px] text-dim">EchoSphere 2025 · Agora ConvoAI</span>
      </footer>
    </div>
  );
}

