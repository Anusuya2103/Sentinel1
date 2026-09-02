import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Loader2, CheckCircle2, AlertOctagon, Clock } from "lucide-react";
import type { Action } from "../hooks/useWebSocket";

const BACKEND = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export default function DraftActionCard({ actions }: { actions: Record<string, Action> }) {
  const [dispatching, setDispatching] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const drafts = Object.values(actions).filter(a => a.critical && a.status === "DRAFT_PENDING_APPROVAL");
  const dispatched = Object.values(actions).filter(a => a.status === "DISPATCHED");

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

  if (drafts.length === 0 && dispatched.length === 0) {
    return (
      <div className="border-b border-border">
        <div className="h-8 px-3 border-b border-border flex items-center gap-2 bg-panel2">
          <Clock size={11} className="text-dim" />
          <span className="font-mono text-[11px] font-medium text-text">PENDING ACTIONS</span>
          <span className="ml-auto font-mono text-[10px] text-dim">0 queued</span>
        </div>
        <div className="px-3 py-3 font-mono text-[10px] text-dim text-center">
          No actions pending — AI generates on conflict detection
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-border">
      <div className="h-8 px-3 border-b border-border flex items-center gap-2 bg-panel2">
        <AlertOctagon size={11} className={drafts.length > 0 ? "text-critical blink" : "text-dim"} />
        <span className="font-mono text-[11px] font-medium text-text">PENDING ACTIONS</span>
        {drafts.length > 0 && (
          <span className="font-mono text-[9px] font-bold text-critical border border-critical/40 bg-critical/10 px-1.5">
            {drafts.length} CRITICAL
          </span>
        )}
        <span className="ml-auto font-mono text-[10px] text-dim">{dispatched.length} dispatched</span>
      </div>

      <AnimatePresence>
        {drafts.map(action => (
          <motion.div
            key={action.action_id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-l-2 border-l-critical bg-critical/5 border-b border-border/50 px-3 py-2.5"
          >
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-[10px] font-bold text-critical uppercase">{action.type}</span>
                  <span className="font-mono text-[9px] text-dim">→ {action.target}</span>
                  <span className="font-mono text-[8px] text-dim ml-auto">#{action.action_id}</span>
                </div>
                <p className="font-sans text-[11px] text-text leading-snug">{action.message}</p>
              </div>
              <button
                onClick={() => handleApprove(action.action_id)}
                disabled={dispatching[action.action_id]}
                className="shrink-0 flex items-center gap-1.5 font-mono text-[10px] px-3 py-1.5 bg-critical/20 border border-critical/50 text-critical hover:bg-critical hover:text-white transition-all disabled:opacity-40 uppercase"
              >
                {dispatching[action.action_id]
                  ? <><Loader2 size={10} className="animate-spin" />Dispatching</>
                  : <><Send size={10} />Approve & Dispatch</>
                }
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {dispatched.map(action => (
        <div key={action.action_id} className="border-l-2 border-l-safe flex items-center gap-2 px-3 py-1.5 border-b border-border/30 bg-safe/3">
          <CheckCircle2 size={10} className="text-safe shrink-0" />
          <span className="font-mono text-[10px] text-safe">{action.type}</span>
          <span className="font-mono text-[10px] text-dim">→ {action.target}</span>
          <span className="ml-auto font-mono text-[9px] text-dim">by {action.approved_by}</span>
        </div>
      ))}

      {error && <p className="font-mono text-[10px] text-critical px-3 py-1.5">{error}</p>}
    </div>
  );
}
