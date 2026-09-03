import { useEffect, useReducer, useRef, useCallback } from "react";

export interface Transcript {
  responder_id: string;
  text: string;
  timestamp: number;
  source: string;
}

export interface Sensor {
  value: number;
  unit: string;
  location: string;
}

export interface Incident {
  id: string;
  description: string;
  priority: "P1_CRITICAL" | "P2_HIGH" | "P3_ADVISORY";
  confidence: number;
  source: string;
  corroborated_by: string[];
  conflict_detected: { with_incident_id: string; details: string } | null;
}

export interface Action {
  action_id: string;
  type: string;
  target: string;
  message: string;
  critical: boolean;
  status: "DRAFT_PENDING_APPROVAL" | "DISPATCHED";
  created_at: number;
  approved_by?: string;
}

export interface ConflictAlert {
  incident_id: string;
  description: string;
  conflict: { with_incident_id: string; details: string };
  confidence: number;
}

export interface DashboardState {
  connected: boolean;
  hazardLevel: string;
  chemicalThreat: string | null;
  activeFires: string[];
  safeRoutes: string[];
  sensors: Record<string, Sensor>;
  sensorHistory: Record<string, number[]>; // sparkline data — last 30 readings
  transcripts: Transcript[];
  incidents: Record<string, Incident>;
  actions: Record<string, Action>;
  activeConflict: ConflictAlert | null;
  agentStatus: string;
  agentSessionId: string | null;
  lastTickMs: number | null; // last intelligence tick timestamp
  incidentCount: number;
}

type Action_ =
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "WS_EVENT"; event: string; payload: unknown };

const initial: DashboardState = {
  connected: false,
  hazardLevel: "MODERATE",
  chemicalThreat: null,
  activeFires: [],
  safeRoutes: ["North_Gate", "East_Gate"],
  sensors: {
    Sensor_A: { value: 42, unit: "°C", location: "East Warehouse" },
    Sensor_B: { value: 15, unit: "ppm", location: "Chemical Storage" },
  },
  sensorHistory: { Sensor_A: [42], Sensor_B: [15] },
  transcripts: [],
  incidents: {},
  actions: {},
  activeConflict: null,
  agentStatus: "idle",
  agentSessionId: null,
  lastTickMs: null,
  incidentCount: 0,
};

function appendHistory(history: number[], value: number): number[] {
  const next = [...history, value];
  return next.length > 30 ? next.slice(-30) : next;
}

function reducer(state: DashboardState, action: Action_): DashboardState {
  switch (action.type) {
    case "CONNECTED":
      return { ...state, connected: true };
    case "DISCONNECTED":
      return { ...state, connected: false };
    case "WS_EVENT": {
      const { event, payload } = action as { type: "WS_EVENT"; event: string; payload: Record<string, unknown> };
      const p = payload as Record<string, unknown>;

      switch (event) {
        case "state_snapshot": {
          const snapTranscripts = (p.transcripts as Transcript[] | undefined) ?? [];
          const existingKeys = new Set(state.transcripts.map(t => `${t.timestamp}-${t.responder_id}`));
          const newFromSnap = snapTranscripts.filter(t => !existingKeys.has(`${t.timestamp}-${t.responder_id}`));
          return {
            ...state,
            hazardLevel: (p.hazard_level as string) ?? state.hazardLevel,
            chemicalThreat: (p.chemical_threat as string | null) ?? state.chemicalThreat,
            activeFires: (p.active_fires as string[]) ?? state.activeFires,
            safeRoutes: (p.safe_routes as string[]) ?? state.safeRoutes,
            sensors: (p.sensors as Record<string, Sensor>) ?? state.sensors,
            incidents: (p.incidents as Record<string, Incident>) ?? state.incidents,
            actions: (p.actions as Record<string, Action>) ?? state.actions,
            agentStatus: (p.agent_status as string) ?? state.agentStatus,
            agentSessionId: (p.agent_session_id as string | null) ?? state.agentSessionId,
            transcripts: [...state.transcripts, ...newFromSnap].slice(-200),
            incidentCount: Object.keys((p.incidents as Record<string, Incident>) ?? {}).length,
          };
        }

        case "transcript": {
          const t = p as unknown as Transcript;
          const key = `${t.timestamp}-${t.responder_id}`;
          if (state.transcripts.some(x => `${x.timestamp}-${x.responder_id}` === key)) return state;
          return { ...state, transcripts: [...state.transcripts.slice(-199), t] };
        }

        case "telemetry_update": {
          const newSensors = { ...state.sensors, ...(p.sensors as Record<string, Sensor>) };
          const newHistory = { ...state.sensorHistory };
          for (const [id, s] of Object.entries(p.sensors as Record<string, Sensor>)) {
            newHistory[id] = appendHistory(newHistory[id] ?? [], s.value);
          }
          return {
            ...state,
            hazardLevel: (p.hazard_level as string) ?? state.hazardLevel,
            sensors: newSensors,
            sensorHistory: newHistory,
          };
        }

        case "incident_update": {
          const newIncidents = { ...state.incidents, ...(p.incidents as Record<string, Incident>) };
          return {
            ...state,
            hazardLevel: (p.hazard_level as string) ?? state.hazardLevel,
            chemicalThreat: (p.chemical_threat as string | null) ?? state.chemicalThreat,
            activeFires: (p.active_fires as string[]) ?? state.activeFires,
            incidents: newIncidents,
            actions: { ...state.actions, ...(p.actions as Record<string, Action>) },
            lastTickMs: Date.now(),
            incidentCount: Object.keys(newIncidents).length,
          };
        }

        case "conflict_alert":
          return { ...state, activeConflict: p as unknown as ConflictAlert };

        case "action_dispatched": {
          const aid = p.action_id as string;
          return {
            ...state,
            actions: {
              ...state.actions,
              [aid]: { ...state.actions[aid], status: "DISPATCHED", approved_by: p.approved_by as string },
            },
          };
        }

        case "agent_lifecycle": {
          const evt = p.event as string;
          const newStatus =
            evt === "joined"  ? "active"
            : evt === "created" ? "joining"
            : evt === "joining" ? "joining"
            : evt === "stopped" ? "stopped"
            : evt === "error"   ? "error"
            : state.agentStatus;
          return {
            ...state,
            agentStatus: newStatus,
            agentSessionId: (p.session_id as string | null) ?? state.agentSessionId,
          };
        }

        default:
          return state;
      }
    }
    default:
      return state;
  }
}

const WS_URL = import.meta.env.VITE_WS_URL ?? "ws://localhost:8000/ws";

export function useWebSocket() {
  const [dashState, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    ws.onopen = () => dispatch({ type: "CONNECTED" });
    ws.onclose = () => {
      dispatch({ type: "DISCONNECTED" });
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        dispatch({ type: "WS_EVENT", event: msg.type, payload: msg.payload as Record<string, unknown> });
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return dashState;
}
