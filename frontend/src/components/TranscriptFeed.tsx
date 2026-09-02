import { useEffect, useRef } from "react";
import { Bot, Radio, Mic } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Transcript } from "../hooks/useWebSocket";

const ROLE_META: Record<string, { color: string; bg: string; abbr: string }> = {
  Fire_Chief:      { color: "text-[#FF7043]", bg: "border-l-[#FF7043]", abbr: "FC" },
  Traffic_Control: { color: "text-info",       bg: "border-l-info",       abbr: "TC" },
  Hazmat_Lead:     { color: "text-[#FFD600]",  bg: "border-l-[#FFD600]", abbr: "HL" },
  "Sentinel-1-AI": { color: "text-safe",       bg: "border-l-safe",       abbr: "AI" },
  responder:       { color: "text-muted",      bg: "border-l-muted",      abbr: "??"},
};

function ts(t: number) {
  return new Date(t * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

const PLACEHOLDERS = [
  { id: "FC", role: "Fire_Chief",      text: "Awaiting Fire Chief transmission..." },
  { id: "TC", role: "Traffic_Control", text: "Awaiting Traffic Control status..." },
  { id: "HL", role: "Hazmat_Lead",     text: "Awaiting Hazmat Lead report..." },
];

export default function TranscriptFeed({ transcripts }: { transcripts: Transcript[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcripts.length]);

  return (
    <div className="flex flex-col h-full bg-panel min-h-0">
      {/* Header */}
      <div className="h-8 px-3 border-b border-border flex items-center gap-2 shrink-0 bg-panel2">
        <div className="flex items-center gap-1.5">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-safe"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="font-mono text-[11px] font-medium text-text">VOICE TRANSCRIPT</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-[10px] text-dim">{transcripts.length} entries</span>
          <div className="flex items-center gap-1">
            {["FC","TC","HL"].map(r => (
              <span key={r} className="font-mono text-[9px] px-1 py-0.5 bg-border/50 text-muted">{r}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Role legend */}
      <div className="h-6 px-3 border-b border-border/50 flex items-center gap-4 shrink-0">
        {Object.entries(ROLE_META).filter(([k]) => k !== "responder").map(([role, meta]) => (
          <div key={role} className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.color.replace("text-","bg-")}`} />
            <span className={`font-mono text-[9px] ${meta.color}`}>{meta.abbr}</span>
          </div>
        ))}
        <span className="ml-auto font-mono text-[9px] text-dim">Agora ASR</span>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {transcripts.length === 0 ? (
          <div className="p-3 space-y-1">
            {PLACEHOLDERS.map(p => {
              const meta = ROLE_META[p.role];
              return (
                <div key={p.id} className={`border-l-2 ${meta.bg} pl-2 py-1.5 opacity-20`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`font-mono text-[10px] font-medium ${meta.color}`}>{p.role}</span>
                    <Mic size={8} className="text-dim" />
                  </div>
                  <p className="font-mono text-[10px] text-muted italic">{p.text}</p>
                </div>
              );
            })}
            <p className="font-mono text-[10px] text-dim text-center pt-4">
              Start the agent and speak into the channel
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {transcripts.map((t, i) => {
              const meta = ROLE_META[t.responder_id] ?? ROLE_META.responder;
              const isAI = t.responder_id === "Sentinel-1-AI";
              return (
                <motion.div
                  key={`${t.timestamp}-${i}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15 }}
                  className={`border-l-2 ${meta.bg} pl-2.5 pr-3 py-2 border-b border-border/30 ${isAI ? "bg-safe/3" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    {isAI ? <Bot size={10} className="text-safe shrink-0" /> : <Radio size={10} className={`${meta.color} shrink-0`} />}
                    <span className={`font-mono text-[10px] font-semibold ${meta.color}`}>{t.responder_id}</span>
                    {isAI && <span className="font-mono text-[8px] text-safe/60 border border-safe/20 px-1">AI</span>}
                    <span className="ml-auto font-mono text-[9px] text-dim tabular-nums">{ts(t.timestamp)}</span>
                  </div>
                  <p className="font-sans text-[11px] text-text leading-relaxed pl-4">{t.text}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
