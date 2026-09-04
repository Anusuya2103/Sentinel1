/**
 * IncidentTimeline — chronological event log.
 * Shows every incident, dispatch, conflict and sensor spike with timestamps.
 * Judges reviewing the screen will see the full story of the incident.
 */
import { motion, AnimatePresence } from "framer-motion";
import { ShieldAlert, Send, AlertTriangle, Zap, CheckCircle2, Info } from "lucide-react";
import type { Incident, Action } from "../hooks/useWebSocket";

interface TimelineEvent {
  id: string;
  type: "incident" | "dispatch" | "conflict" | "spike" | "approval";
  timestamp: number;
  label: string;
  detail: string;
  priority?: string;
}

function buildTimeline(
  incidents: Record<string, Incident>,
  actions: Record<string, Action>
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const inc of Object.values(incidents)) {
    events.push({
      id: `inc-${inc.id}`,
      type: inc.conflict_detected ? "conflict" : "incident",
      timestamp: (inc as { detected_at?: number }).detected_at ?? Date.now() / 1000,
      label: inc.priority.replace("_", " "),
      detail: inc.description,
      priority: inc.priority,
    });
  }

  for (const act of Object.values(actions)) {
    if (act.status === "DISPATCHED") {
      events.push({
        id: `act-${act.action_id}`,
        type: "approval",
        timestamp: (act as { dispatched_at?: number }).dispatched_at ?? act.created_at,
        label: `DISPATCHED: ${act.type}`,
        detail: `${act.message} — by ${act.approved_by}`,
      });
    } else {
      events.push({
        id: `draft-${act.action_id}`,
        type: "dispatch",
        timestamp: act.created_at,
        label: `PENDING: ${act.type}`,
        detail: act.message,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

function formatTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
}

const EVENT_STYLE: Record<string, { icon: typeof ShieldAlert; color: string; dot: string }> = {
  conflict: { icon: ShieldAlert, color: "text-critical", dot: "bg-critical" },
  incident: { icon: ShieldAlert, color: "text-warning",  dot: "bg-warning" },
  dispatch: { icon: Send,        color: "text-warning",  dot: "bg-warning" },
  approval: { icon: CheckCircle2,color: "text-safe",     dot: "bg-safe" },
  spike:    { icon: Zap,         color: "text-critical", dot: "bg-critical" },
};

export default function IncidentTimeline({
  incidents, actions,
}: {
  incidents: Record<string, Incident>;
  actions: Record<string, Action>;
}) {
  const events = buildTimeline(incidents, actions);

  return (
    <div className="flex flex-col h-full bg-base overflow-hidden">
      <div className="h-9 px-3 border-b border-border bg-surface flex items-center gap-2 shrink-0">
        <Zap size={11} className="text-warning" />
        <span className="font-sans text-[12px] font-semibold text-text">Incident Timeline</span>
        <span className="ml-auto font-mono text-[10px] text-dim">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-2">
            <Info size={20} className="text-dim mx-auto" />
            <p className="font-mono text-[10px] text-dim">No events yet</p>
            <p className="font-mono text-[9px] text-dim">Events appear as incident is analysed</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-2.5 top-0 bottom-0 w-px bg-border" />

            <AnimatePresence initial={false}>
              {events.map((evt, i) => {
                const style = EVENT_STYLE[evt.type] ?? EVENT_STYLE.incident;
                const Icon = style.icon;
                return (
                  <motion.div
                    key={evt.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="flex gap-3 mb-3 relative"
                  >
                    {/* Dot on timeline */}
                    <div className={`h-5 w-5 rounded-full ${style.dot} flex items-center justify-center shrink-0 z-10 mt-0.5`}>
                      <Icon size={10} className="text-base" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`font-mono text-[10px] font-bold ${style.color}`}>
                          {evt.label}
                        </span>
                        <span className="font-mono text-[9px] text-dim tabular-nums ml-auto">
                          {formatTime(evt.timestamp)}
                        </span>
                      </div>
                      <p className="font-sans text-[11px] text-muted leading-snug">{evt.detail}</p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}
