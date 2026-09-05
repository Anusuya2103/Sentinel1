import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Send, Loader2, CheckCircle2, Info, Radar, Clock } from "lucide-react";
import type { Incident, Action, ConflictAlert } from "../hooks/useWebSocket";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

const PRIORITY_CFG: Record<string, { color: string; bg: string; border: string; glow: string }> = {
  P1_CRITICAL: { color: "text-critical", bg: "bg-critical/8",  border: "border-critical/40", glow: "shadow-[0_0_20px_rgba(239,68,68,0.15)]" },
  P2_HIGH:     { color: "text-warning",  bg: "bg-warning/8",   border: "border-warning/30",  glow: "" },
  P3_ADVISORY: { color: "text-cyan",     bg: "bg-cyan/5",      border: "border-cyan/20",     glow: "" },
};

function RadarSweep() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 py-12">
      {/* Radar animation */}
      <div className="relative w-32 h-32">
        <div className="absolute inset-0 border border-safe/20 rounded-full" />
        <div className="absolute inset-4 border border-safe/15 rounded-full" />
        <div className="absolute inset-8 border border-safe/10 rounded-full" />
        <div className="absolute inset-12 border border-safe/8 rounded-full" />
        {/* Sweep line */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute right-1/2 bottom-1/2 origin-bottom-right"
            style={{ width: "50%", height: "1px", background: "linear-gradient(to right, transparent, rgba(16,185,129,0.6))" }} />
        </motion.div>
        {/* Center dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div className="h-2 w-2 rounded-full bg-safe"
            animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }} />
        </div>
      </div>
      <div className="text-center space-y-1.5">
        <p className="font-mono text-[12px] text-safe font-medium">ALL AGENT STREAMS NOMINAL</p>
        <p className="font-sans text-[11px] text-muted">Conflict engine running · No impasses detected</p>
        <p className="font-mono text-[10px] text-dim">Intelligence analysis every 8s</p>
      </div>
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm px-4">
        {[
          { label: "Hazmat Lead", role: "Chemical authority 90%", color: "text-yellow-400" },
          { label: "Fire Chief", role: "Fire authority 85%", color: "text-orange-400" },
          { label: "Traffic Control", role: "Traffic authority 90%", color: "text-blue-400" },
        ].map(r => (
          <div key={r.label} className="border border-border bg-surface p-2 text-center">
            <p className={`font-mono text-[10px] font-semibold ${r.color}`}>{r.label.split(" ")[0]}</p>
            <p className="font-mono text-[9px] text-dim mt-0.5">{r.role}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

interface InterventionCardProps {
  incident: Incident;
  relatedActions: Action[];
  onApprove: (id: string) => Promise<void>;
  dispatching: Record<string, boolean>;
}

function InterventionCard({ incident, relatedActions, onApprove, dispatching }: InterventionCardProps) {
  const corroboratedBy = Array.isArray(incident.corroborated_by) ? incident.corroborated_by : [];
  const cfg = PRIORITY_CFG[incident.priority] ?? PRIORITY_CFG.P3_ADVISORY;
  const Icon = incident.priority === "P3_ADVISORY" ? Info : ShieldAlert;
  const hasConflict = Boolean(incident.conflict_detected);

  // Build a human-readable impact statement
  const impactStatement = hasConflict
    ? incident.conflict_detected?.details ?? incident.description
    : incident.description;

  // Extract opposing roles from source/conflict
  const roleA = incident.source;
  const roleB = incident.conflict_detected?.with_incident_id
    ? corroboratedBy[0] ?? "Sensor Data"
    : corroboratedBy[0] ?? "AI Analysis";

  const draftActions = relatedActions.filter(a => a.status === "DRAFT_PENDING_APPROVAL");
  const dispatchedActions = relatedActions.filter(a => a.status === "DISPATCHED");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`border ${cfg.border} ${cfg.bg} ${cfg.glow} mb-3`}
    >
      {/* Card Header */}
      <div className={`px-4 py-2.5 border-b ${cfg.border} flex items-center gap-3`}>
        <Icon size={13} className={`${cfg.color} shrink-0`} />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={`font-mono text-[10px] font-bold ${cfg.color} tracking-wider`}>
            {incident.priority.replace("_", " ")}
          </span>
          <span className="font-mono text-[9px] text-dim">#{incident.id}</span>
          {hasConflict && (
            <span className="font-mono text-[9px] bg-critical/20 text-critical border border-critical/30 px-1.5 py-0.5">
              ⚡ CONFLICT
            </span>
          )}
        </div>
        {/* Confidence bar */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-[10px] text-muted">Confidence</span>
          <div className="w-20 h-1.5 bg-border overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                incident.confidence > 0.7 ? "bg-safe" : incident.confidence > 0.4 ? "bg-warning" : "bg-critical"
              }`}
              style={{ width: `${incident.confidence * 100}%` }}
            />
          </div>
          <span className="font-mono text-[10px] text-muted w-8 tabular-nums">{Math.round(incident.confidence * 100)}%</span>
        </div>
      </div>

      {/* Opposing parties (only for conflicts) */}
      {hasConflict && (
        <div className="px-4 py-2 border-b border-border/40 flex items-center gap-3 bg-surface/30">
          <span className="font-mono text-[10px] text-warning font-medium">{roleA.replace(/_/g, " ")}</span>
          <span className="font-mono text-[10px] text-dim">vs</span>
          <span className="font-mono text-[10px] text-warning font-medium">{roleB.replace(/_/g, " ")}</span>
          <span className="ml-auto font-mono text-[9px] text-dim">AI Confidence Score: {Math.round(incident.confidence * 100)}%</span>
        </div>
      )}

      {/* Impact summary */}
      <div className="px-4 py-3">
        <p className="font-sans text-[13px] text-text leading-snug font-medium mb-1">
          {incident.description}
        </p>
        {hasConflict && (
          <p className="font-sans text-[11px] text-muted leading-relaxed">
            ⚠ {impactStatement}
          </p>
        )}
        {corroboratedBy.length > 0 && (
          <p className="font-mono text-[10px] text-safe mt-1">
            ✓ Corroborated by: {corroboratedBy.map(r => r.replace(/_/g, " ")).join(", ")}
          </p>
        )}
      </div>

      {/* Action footer */}
      {(draftActions.length > 0 || dispatchedActions.length > 0) && (
        <div className="px-4 pb-3 space-y-2">
          <div className="h-px bg-border/40" />
          {draftActions.map(action => (
            <div key={action.action_id} className="flex items-center gap-3 bg-surface/50 border border-border p-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[10px] font-bold text-warning">{action.type}</span>
                  <span className="font-mono text-[9px] text-dim">→ {action.target}</span>
                </div>
                <p className="font-sans text-[11px] text-muted">{action.message}</p>
              </div>
              <button
                onClick={() => onApprove(action.action_id)}
                disabled={dispatching[action.action_id]}
                className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 bg-safe/15 border border-safe/40 text-safe hover:bg-safe hover:text-base transition-all disabled:opacity-40 uppercase tracking-wide shrink-0"
              >
                {dispatching[action.action_id]
                  ? <><Loader2 size={10} className="animate-spin" />Dispatching</>
                  : <><Send size={10} />Approve &amp; Dispatch</>
                }
              </button>
            </div>
          ))}
          {dispatchedActions.map(action => (
            <div key={action.action_id} className="flex items-center gap-2 border-l-2 border-l-safe bg-safe/5 border border-safe/20 px-3 py-1.5">
              <CheckCircle2 size={10} className="text-safe" />
              <span className="font-mono text-[10px] text-safe">{action.type}</span>
              <span className="font-mono text-[10px] text-dim">→ {action.target}</span>
              <span className="ml-auto font-mono text-[9px] text-dim">DISPATCHED · {action.approved_by}</span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export default function InterventionHub({ incidents, actions, activeConflict, lastTickMs }: {
  incidents: Record<string, Incident>;
  actions: Record<string, Action>;
  activeConflict: ConflictAlert | null;
  lastTickMs: number | null;
}) {
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const sorted = Object.values(incidents).sort((a, b) => {
    const o: Record<string, number> = { P1_CRITICAL: 0, P2_HIGH: 1, P3_ADVISORY: 2 };
    return (o[a.priority] ?? 3) - (o[b.priority] ?? 3);
  });

  async function handleApprove(actionId: string) {
    setDispatching(d => ({ ...d, [actionId]: true }));
    setError(null);
    try {
      const resp = await fetch(`${BACKEND}/approve_action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_id: actionId, approved_by: "Dashboard_Operator" }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        setError((data as { detail?: string }).detail ?? "Dispatch failed");
      }
    } catch { setError("Network error"); }
    finally { setDispatching(d => ({ ...d, [actionId]: false })); }
  }

  // Match actions to incidents (by target overlap or just show all)
  function actionsForIncident(inc: Incident): Action[] {
    return Object.values(actions).filter(a => {
      const msg = a.message.toLowerCase();
      const desc = inc.description.toLowerCase();
      return msg.includes(inc.source.toLowerCase().replace(/_/g,' ')) ||
             desc.includes(a.target.toLowerCase()) ||
             inc.id === a.action_id.split('-')[0];
    });
  }

  const allActionValues = Object.values(actions);
  const unmatchedActions = allActionValues.filter(a => {
    return !sorted.some(inc => actionsForIncident(inc).some(ia => ia.action_id === a.action_id));
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-base">
      {/* Panel header */}
      <div className="h-9 px-4 border-b border-border bg-surface flex items-center gap-2 shrink-0">
        <ShieldAlert size={13} className={activeConflict ? "text-critical blink" : "text-muted"} />
        <span className="font-sans text-[12px] font-semibold text-text">Conflict & Intervention Hub</span>
        {sorted.length > 0 && (
          <span className="font-mono text-[9px] border border-warning/40 bg-warning/10 text-warning px-1.5 py-0.5 ml-1">
            {sorted.filter(i => i.priority === "P1_CRITICAL").length} CRITICAL
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {lastTickMs && (
            <div className="flex items-center gap-1.5">
              <Clock size={9} className="text-dim" />
              <span className="font-mono text-[9px] text-dim">
                Last analysis: {Math.round((Date.now() - lastTickMs) / 1000)}s ago
              </span>
            </div>
          )}
          <span className="font-mono text-[10px] text-dim">{sorted.length} detected</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {error && (
          <div className="mb-3 font-mono text-[10px] text-critical border border-critical/30 bg-critical/8 px-3 py-2">
            {error}
          </div>
        )}

        {sorted.length === 0 ? (
          <RadarSweep />
        ) : (
          <AnimatePresence>
            {sorted.map(inc => (
              <InterventionCard
                key={inc.id}
                incident={inc}
                relatedActions={actionsForIncident(inc)}
                onApprove={handleApprove}
                dispatching={dispatching}
              />
            ))}
            {/* Unmatched actions */}
            {unmatchedActions.filter(a => a.status === "DRAFT_PENDING_APPROVAL").map(action => (
              <motion.div
                key={action.action_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-warning/30 bg-warning/5 mb-3"
              >
                <div className="px-4 py-2.5 border-b border-warning/20 flex items-center gap-2">
                  <Send size={11} className="text-warning" />
                  <span className="font-mono text-[10px] font-bold text-warning">PENDING ACTION</span>
                </div>
                <div className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] font-bold text-warning">{action.type}</span>
                      <span className="font-mono text-[9px] text-dim">→ {action.target}</span>
                    </div>
                    <p className="font-sans text-[12px] text-text">{action.message}</p>
                  </div>
                  <button
                    onClick={() => handleApprove(action.action_id)}
                    disabled={dispatching[action.action_id]}
                    className="flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 bg-safe/15 border border-safe/40 text-safe hover:bg-safe hover:text-base transition-all disabled:opacity-40 uppercase"
                  >
                    {dispatching[action.action_id] ? <><Loader2 size={10} className="animate-spin" />Wait</> : <><Send size={10} />Approve</>}
                  </button>
                </div>
              </motion.div>
            ))}
            {unmatchedActions.filter(a => a.status === "DISPATCHED").map(action => (
              <div key={action.action_id} className="border-l-2 border-l-safe bg-safe/5 border border-safe/20 px-3 py-2 mb-2 flex items-center gap-2">
                <CheckCircle2 size={10} className="text-safe" />
                <span className="font-mono text-[10px] text-safe">{action.type} → {action.target}</span>
                <span className="ml-auto font-mono text-[9px] text-dim">DISPATCHED · {action.approved_by}</span>
              </div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
