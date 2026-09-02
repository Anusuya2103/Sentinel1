import { useState } from "react";
import { Bot, Play, Square, Loader2, Wifi, WifiOff, Circle } from "lucide-react";
import { motion } from "framer-motion";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const STATUS_COLOR: Record<string, string> = {
  idle:    "text-dim",
  joining: "text-moderate",
  active:  "text-safe",
  stopped: "text-dim",
  error:   "text-critical",
};

const STATUS_DOT: Record<string, string> = {
  idle:    "bg-dim",
  joining: "bg-moderate",
  active:  "bg-safe",
  stopped: "bg-dim",
  error:   "bg-critical",
};

export default function AgentControls({
  agentStatus, sessionId, connected,
}: { agentStatus: string; sessionId: string | null; connected: boolean }) {
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const displayStatus = localStatus ?? agentStatus;

  if (localStatus && agentStatus !== "idle" && agentStatus !== localStatus) {
    setLocalStatus(null);
  }

  async function handleStart() {
    setLoading(true);
    setLocalStatus("joining");
    try {
      const resp = await fetch(`${BACKEND}/agent/start`, { method: "POST" });
      if (!resp.ok) setLocalStatus("error");
    } catch { setLocalStatus("error"); }
    finally { setLoading(false); }
  }

  async function handleStop() {
    setLoading(true);
    setLocalStatus("stopped");
    try { await fetch(`${BACKEND}/agent/stop`, { method: "POST" }); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  }

  const isActive = displayStatus === "active" || displayStatus === "joining";

  return (
    <div className="flex items-center gap-3">
      {/* WS status */}
      <div className="flex items-center gap-1.5">
        {connected
          ? <><Wifi size={10} className="text-safe" /><span className="font-mono text-[10px] text-safe">LIVE</span></>
          : <><WifiOff size={10} className="text-critical" /><span className="font-mono text-[10px] text-critical">OFFLINE</span></>
        }
      </div>

      <span className="text-border">|</span>

      {/* Agent status */}
      <div className="flex items-center gap-1.5">
        <motion.span
          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[displayStatus] ?? "bg-dim"}`}
          animate={displayStatus === "active" ? { opacity: [1, 0.3, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <span className={`font-mono text-[10px] ${STATUS_COLOR[displayStatus] ?? "text-dim"}`}>
          AI {displayStatus.toUpperCase()}
          {sessionId && displayStatus !== "idle" ? ` · ${sessionId.slice(0, 8)}` : ""}
        </span>
      </div>

      {/* Button */}
      {!isActive ? (
        <button
          onClick={handleStart}
          disabled={loading}
          className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-safe/50 text-safe hover:bg-safe hover:text-base transition-all duration-150 disabled:opacity-40 uppercase tracking-wider"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
          Start Agent
        </button>
      ) : (
        <button
          onClick={handleStop}
          disabled={loading}
          className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-critical/50 text-critical hover:bg-critical hover:text-white transition-all duration-150 disabled:opacity-40 uppercase tracking-wider"
        >
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Square size={10} />}
          Stop Agent
        </button>
      )}
    </div>
  );
}
