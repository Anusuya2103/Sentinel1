import { useEffect, useRef } from "react";
import { Bot, Mic, Radio } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Transcript } from "../hooks/useWebSocket";

const ROLE_META: Record<string, { color: string; border: string; abbr: string; bgTag: string }> = {
  Fire_Chief:      { color: "text-orange-400", border: "border-l-orange-500",   abbr: "FC", bgTag: "bg-orange-500/15 text-orange-400" },
  Traffic_Control: { color: "text-blue-400",   border: "border-l-blue-500",     abbr: "TC", bgTag: "bg-blue-500/15 text-blue-400" },
  Hazmat_Lead:     { color: "text-yellow-400", border: "border-l-yellow-500",   abbr: "HL", bgTag: "bg-yellow-500/15 text-yellow-400" },
  "Sentinel-1-AI": { color: "text-cyan",       border: "border-l-cyan",         abbr: "AI", bgTag: "bg-cyan/15 text-cyan" },
  responder:       { color: "text-muted",      border: "border-l-border2",      abbr: "??", bgTag: "bg-surface2 text-muted" },
};

const CRITICAL_KEYWORDS = ["hazmat","mass casualty","lockdown","evacuate","critical","explosion","fire","toxic","chlorine","ppm","casualty"];

function highlightText(text: string): React.ReactNode {
  const parts = text.split(/\b/);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    const isCrit = CRITICAL_KEYWORDS.some(k => lower.includes(k));
    if (isCrit) return <span key={i} className="bg-warning/20 text-warning font-medium px-0.5 rounded-sm">{part}</span>;
    return part;
  });
}

// Group transcripts into 15-second windows
function groupTranscripts(transcripts: Transcript[]): { windowLabel: string; entries: Transcript[] }[] {
  if (transcripts.length === 0) return [];
  const groups: { windowLabel: string; entries: Transcript[] }[] = [];
  let currentWindow = -1;
  let currentGroup: Transcript[] = [];

  for (const t of transcripts) {
    const window = Math.floor(t.timestamp / 15);
    if (window !== currentWindow) {
      if (currentGroup.length > 0) groups.push({ windowLabel: formatWindowLabel(currentGroup[0].timestamp), entries: currentGroup });
      currentWindow = window;
      currentGroup = [t];
    } else {
      currentGroup.push(t);
    }
  }
  if (currentGroup.length > 0) groups.push({ windowLabel: formatWindowLabel(currentGroup[0].timestamp), entries: currentGroup });
  return groups;
}

function formatWindowLabel(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

export default function TranscriptFeed({ transcripts }: { transcripts: Transcript[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [transcripts.length]);

  const groups = groupTranscripts(transcripts);

  return (
    <div className="flex flex-col h-full bg-base min-h-0">
      {/* Header */}
      <div className="h-9 px-3 border-b border-border bg-surface flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <motion.span className="h-1.5 w-1.5 rounded-full bg-safe"
            animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
          <span className="font-sans text-[12px] font-semibold text-text">Live Transcript</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-dim">{transcripts.length}</span>
          <div className="flex items-center gap-1">
            {[["FC","text-orange-400"],["TC","text-blue-400"],["HL","text-yellow-400"]].map(([a,c]) => (
              <span key={a} className={`font-mono text-[9px] ${c}`}>{a}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {groups.length === 0 ? (
          <div className="p-4 space-y-2">
            <p className="font-mono text-[10px] text-dim text-center pt-6">Awaiting voice transmissions...</p>
            {[["FC","Fire_Chief","text-orange-400/30"],["TC","Traffic_Control","text-blue-400/30"],["HL","Hazmat_Lead","text-yellow-400/30"]].map(([a,r,c]) => (
              <div key={a} className="border-l-2 border-border pl-2 py-1.5 opacity-30">
                <span className={`font-mono text-[10px] ${c}`}>{r}</span>
                <p className="font-sans text-[11px] text-dim italic mt-0.5">No transmission yet...</p>
              </div>
            ))}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {groups.map((group, gi) => (
              <div key={gi}>
                {/* Window divider */}
                <div className="flex items-center gap-2 px-3 py-1 bg-surface2/50">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="font-mono text-[9px] text-dim shrink-0">{group.windowLabel}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
                {/* Speaker cards in this window */}
                {group.entries.map((t, i) => {
                  const meta = ROLE_META[t.responder_id] ?? ROLE_META.responder;
                  const isAI = t.responder_id === "Sentinel-1-AI";
                  return (
                    <motion.div
                      key={`${t.timestamp}-${i}`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.18 }}
                      className={`border-l-2 ${meta.border} px-3 py-2 border-b border-border/30 ${isAI ? "bg-cyan/3" : ""}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isAI ? <Bot size={10} className="text-cyan shrink-0" /> : <Mic size={10} className={`${meta.color} shrink-0`} />}
                        <span className={`${meta.bgTag} font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded-sm`}>
                          {t.responder_id.replace(/_/g, " ")}
                        </span>
                        <span className="ml-auto font-mono text-[9px] text-dim tabular-nums">
                          {formatWindowLabel(t.timestamp)}
                        </span>
                      </div>
                      <p className="font-sans text-[12px] text-text leading-relaxed pl-4">
                        {highlightText(t.text)}
                      </p>
                    </motion.div>
                  );
                })}
              </div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
