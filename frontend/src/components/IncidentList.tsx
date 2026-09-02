import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Info, Zap, CheckCircle } from "lucide-react";
import type { Incident } from "../hooks/useWebSocket";

const P: Record<string, { color: string; bg: string; border: string; icon: typeof ShieldAlert }> = {
  P1_CRITICAL: { color: "text-critical", bg: "bg-critical/5",  border: "border-l-critical",  icon: ShieldAlert },
  P2_HIGH:     { color: "text-moderate", bg: "bg-moderate/5",  border: "border-l-moderate",  icon: ShieldAlert },
  P3_ADVISORY: { color: "text-info",     bg: "bg-info/5",      border: "border-l-info",      icon: Info },
};

export default function IncidentList({ incidents }: { incidents: Record<string, Incident> }) {
  const sorted = Object.values(incidents).sort((a, b) => {
    const o: Record<string, number> = { P1_CRITICAL: 0, P2_HIGH: 1, P3_ADVISORY: 2 };
    return (o[a.priority] ?? 3) - (o[b.priority] ?? 3);
  });

  return (
    <div className="flex flex-col h-full bg-panel min-h-0">
      <div className="h-8 px-3 border-b border-border flex items-center gap-2 bg-panel2 shrink-0">
        <Zap size={11} className="text-moderate" />
        <span className="font-mono text-[11px] font-medium text-text">INCIDENT ANALYSIS</span>
        <span className="font-mono text-[9px] text-dim">· AI conflict detection</span>
        <span className="ml-auto font-mono text-[10px] text-muted">{sorted.length} detected</span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="h-12 w-12 border border-border flex items-center justify-center">
            <ShieldAlert size={20} className="text-dim" />
          </div>
          <div className="text-center">
            <p className="font-mono text-[11px] text-muted">No incidents detected</p>
            <p className="font-mono text-[10px] text-dim mt-1">Conflict engine running · 8s analysis tick</p>
          </div>
          <div className="w-full max-w-xs mt-2 space-y-1">
            {["Inject transcripts via debug endpoint", "Trigger sensor spike for demo", "Agent will auto-analyze conflicts"].map(h => (
              <div key={h} className="flex items-center gap-2">
                <CheckCircle size={8} className="text-dim shrink-0" />
                <span className="font-mono text-[9px] text-dim">{h}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border/50">
          <AnimatePresence initial={false}>
            {sorted.map(inc => {
              const style = P[inc.priority] ?? P.P3_ADVISORY;
              const Icon = style.icon;
              return (
                <motion.div
                  key={inc.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className={`border-l-2 ${style.border} ${style.bg} px-3 py-2.5`}
                >
                  <div className="flex items-start gap-2 mb-1">
                    <Icon size={11} className={`${style.color} shrink-0 mt-0.5`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`font-mono text-[10px] font-bold ${style.color}`}>{inc.priority}</span>
                        <span className="font-mono text-[9px] text-dim">#{inc.id}</span>
                        <div className="flex items-center gap-1">
                          <div className="h-1 w-12 bg-border overflow-hidden">
                            <div className={`h-full ${inc.confidence > 0.7 ? "bg-safe" : inc.confidence > 0.4 ? "bg-moderate" : "bg-critical"}`}
                              style={{ width: `${inc.confidence * 100}%` }} />
                          </div>
                          <span className="font-mono text-[9px] text-dim">{Math.round(inc.confidence * 100)}%</span>
                        </div>
                        {inc.corroborated_by.length > 0 && (
                          <span className="font-mono text-[9px] text-safe">✓ {inc.corroborated_by.join("+")}</span>
                        )}
                      </div>
                      <p className="font-sans text-[11px] text-text leading-snug">{inc.description}</p>
                      {inc.conflict_detected && (
                        <p className="font-mono text-[10px] text-critical mt-1">
                          ⚡ {inc.conflict_detected.details}
                        </p>
                      )}
                      <span className="font-mono text-[9px] text-dim">src: {inc.source}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
