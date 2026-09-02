import { useEffect, useReducer, useRef, useCallback } from "react";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  transcripts: Transcript[];
  incidents: Record<string, Incident>;
  actions: Record<string, Action>;
  activeConflict: ConflictAlert | null;
  agentStatus: string;
  agentSessionId: string | null;
}

// â”€â”€ Reducer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    Sensor_A: { value: 42, unit: "Â°C", location: "East Warehouse" },
    Sensor_B: { value: 15, unit: "ppm", location: "Chemical Storage" },
  },
  transcripts: [],
  incidents: {},
  actions: {},
  activeConflict: null,
  agentStatus: "idle",
  agentSessionId: null,
};

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
        case "state_snapshot":
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
          };

        case "transcript":
          return {
            ...state,
            transcripts: [
              ...state.transcripts.slice(-199),
              p as unknown as Transcript,
            ],
          };

        case "telemetry_update":
          return {
            ...state,
            hazardLevel: (p.hazard_level as string) ?? state.hazardLevel,
            sensors: { ...state.sensors, ...(p.sensors as Record<string, Sensor>) },
          };

        case "incident_update":
          return {
            ...state,
            hazardLevel: (p.hazard_level as string) ?? state.hazardLevel,
            chemicalThreat: (p.chemical_threat as string | null) ?? state.chemicalThreat,
            activeFires: (p.active_fires as string[]) ?? state.activeFires,
            incidents: { ...state.incidents, ...(p.incidents as Record<string, Incident>) },
            actions: { ...state.actions, ...(p.actions as Record<string, Action>) },
          };

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

        case "agent_lifecycle":
          return {
            ...state,
            agentStatus: (p.event as string) === "joined" ? "active"
              : (p.event as string) === "stopped" ? "stopped"
              : (p.event as string) === "error" ? "error"
              : state.agentStatus,
          };

        case "agent_interrupted":
          return state; // visual flash handled by DissonanceBanner

        default:
          return state;
      }
    }
    default:
      return state;
  }
}

// â”€â”€ Hook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      // Auto-reconnect after 3s
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as { type: string; payload: unknown };
        dispatch({ type: "WS_EVENT", event: msg.type, payload: msg.payload as Record<string, unknown> });
      } catch {
        // ignore malformed messages
      }
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



