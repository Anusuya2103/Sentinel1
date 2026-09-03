import { useState } from "react";
import { Play, Square, Loader2, Bot } from "lucide-react";
import { motion } from "framer-motion";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const STATUS_COLOR: Record<string, string> = {
  idle: "text-dim", joining: "text-warning", active: "text-cyan", stopped: "text-dim", error: "text-critical",
};
const STATUS_DOT: Record<string, string> = {
  idle: "bg-dim", joining: "bg-warning", active: "bg-cyan", stopped: "bg-dim", error: "bg-critical",
};

export default function AgentControls({ agentStatus, sessionId, connected }: {
  agentStatus: string; sessionId: string | null; connected: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const displayStatus = localStatus ?? agentStatus;

  if (localStatus && agentStatus !== "idle" && agentStatus !== localStatus) setLocalStatus(null);

  async function handleStart() {
    setLoading(true); setLocalStatus("joining");
    try {
      const r = await fetch(`${BACKEND}/agent/start`, { method: "POST" });
      if (!r.ok) setLocalStatus("error");
    } catch { setLocalStatus("error"); } finally { setLoading(false); }
  }

  async function handleStop() {
    setLoading(true); setLocalStatus("stopped");
    try { await fetch(`${BACKEND}/agent/stop`, { method: "POST" }); }
    catch { /* ignore */ } finally { setLoading(false); }
  }

  const isActive = displayStatus === "active" || displayStatus === "joining";

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <motion.span
          className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[displayStatus] ?? "bg-dim"}`}
          animate={isActive ? { opacity: [1, 0.3, 1] } : {}}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
        <Bot size={11} className={STATUS_COLOR[displayStatus] ?? "text-dim"} />
        <span className={`font-mono text-[10px] ${STATUS_COLOR[displayStatus] ?? "text-dim"}`}>
          {displayStatus.toUpperCase()}
          {sessionId && displayStatus !== "idle" ? ` · ${sessionId.slice(0, 8)}` : ""}
        </span>
      </div>

      {!isActive ? (
        <button onClick={handleStart} disabled={loading}
          className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-safe/50 text-safe hover:bg-safe hover:text-base transition-all disabled:opacity-40 uppercase tracking-wide">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
          Start Agent
        </button>
      ) : (
        <button onClick={handleStop} disabled={loading}
          className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1 border border-critical/50 text-critical hover:bg-critical hover:text-white transition-all disabled:opacity-40 uppercase tracking-wide">
          {loading ? <Loader2 size={10} className="animate-spin" /> : <Square size={10} />}
          Stop Agent
        </button>
      )}
    </div>
  );
}
