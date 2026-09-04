import { Thermometer, Wind, AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { motion } from "framer-motion";
import type { Sensor } from "../hooks/useWebSocket";

function Sparkline({ data, danger }: { data: number[]; danger: boolean }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 80;
  const H = 24;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline points={points} fill="none"
        stroke={danger ? "#EF4444" : "#10B981"}
        strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
      {data.length > 0 && (
        <circle
          cx={W}
          cy={H - ((data[data.length - 1] - min) / range) * H}
          r="2" fill={danger ? "#EF4444" : "#10B981"} />
      )}
    </svg>
  );
}

function SensorCard({ id, sensor, history, trend, danger, onHover, onLeave }: {
  id: string;
  sensor: Sensor;
  history: number[];
  trend: string;
  danger: boolean;
  onHover: () => void;
  onLeave: () => void;
}) {
  const isTemp = id === "Sensor_A";
  const max = isTemp ? 200 : 100;
  const pct = Math.min(100, (sensor.value / max) * 100);
  const barColor = pct > 80 ? "bg-critical" : pct > 55 ? "bg-warning" : "bg-safe";
  const Icon = isTemp ? Thermometer : Wind;

  return (
    <div
      className={`p-3 border-b border-border cursor-pointer transition-colors duration-150 ${danger ? "bg-critical/5 hover:bg-critical/8" : "hover:bg-surface2"}`}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={11} className={danger ? "text-critical" : "text-muted"} />
          <span className="font-mono text-[11px] font-medium text-muted">{id}</span>
          {danger && <AlertTriangle size={9} className="text-critical blink" />}
        </div>
        <Sparkline data={history} danger={danger} />
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <motion.span
          key={Math.floor(sensor.value)}
          className={`font-mono text-[22px] font-semibold tabular-nums ${danger ? "text-critical" : "text-text"}`}
          initial={{ opacity: 0.5 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}
        >
          {sensor.value.toFixed(1)}
        </motion.span>
        <span className="font-mono text-[12px] text-muted">{sensor.unit}</span>
        <div className="ml-auto flex items-center gap-1">
          {trend.includes("RISING") && <TrendingUp size={9} className="text-critical" />}
          {trend.includes("FALLING") && <TrendingDown size={9} className="text-safe" />}
          {trend.includes("STABLE") && <Minus size={9} className="text-dim" />}
          <span className="font-mono text-[9px] text-dim tabular-nums">{pct.toFixed(0)}%</span>
        </div>
      </div>

      <p className="font-sans text-[10px] text-dim mb-1.5">{sensor.location}</p>

      <div className="h-1 bg-border overflow-hidden">
        <motion.div
          className={`h-full ${barColor} transition-colors duration-500`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="font-mono text-[8px] text-dim">0</span>
        <span className="font-mono text-[8px] text-dim">{max / 2}</span>
        <span className="font-mono text-[8px] text-dim">{max}{sensor.unit}</span>
      </div>
    </div>
  );
}

const HAZARD_BADGE: Record<string, string> = {
  LOW:      "text-safe border-safe/30 bg-safe/10",
  MODERATE: "text-warning border-warning/30 bg-warning/10",
  HIGH:     "text-critical border-critical/30 bg-critical/10",
  CRITICAL: "text-critical border-critical/50 bg-critical/15",
};

export default function TelemetryPanel({
  sensors, sensorHistory, sensorTrends, hazardLevel, activeFires, chemicalThreat, onSensorHover
}: {
  sensors: Record<string, Sensor>;
  sensorHistory: Record<string, number[]>;
  sensorTrends: Record<string, string>;
  hazardLevel: string;
  activeFires: string[];
  chemicalThreat: string | null;
  onSensorHover: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-col h-full bg-base overflow-hidden">
      <div className="h-9 px-3 border-b border-border bg-surface flex items-center gap-2 shrink-0">
        <span className="font-sans text-[12px] font-semibold text-text">Live Sensor Feed</span>
        <span className="font-mono text-[9px] text-dim">· hover to highlight zone</span>
        <motion.span
          className={`ml-auto font-mono text-[10px] font-bold px-2 py-0.5 border ${HAZARD_BADGE[hazardLevel] ?? HAZARD_BADGE.MODERATE}`}
          animate={hazardLevel === "CRITICAL" ? { opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 0.7, repeat: Infinity }}
        >
          {hazardLevel}
        </motion.span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {Object.entries(sensors).map(([id, s]) => (
          <SensorCard
            key={id} id={id} sensor={s}
            history={sensorHistory[id] ?? [s.value]}
            trend={sensorTrends[id] ?? "STABLE →"}
            danger={id === "Sensor_A" ? s.value > 150 : s.value > 80}
            onHover={() => onSensorHover(id)}
            onLeave={() => onSensorHover(null)}
          />
        ))}
        {activeFires.map(loc => (
          <div key={loc} className="flex items-center gap-2 px-3 py-2 border-b border-border bg-critical/5">
            <AlertTriangle size={10} className="text-critical" />
            <span className="font-mono text-[10px] text-critical">FIRE: {loc}</span>
          </div>
        ))}
        {chemicalThreat && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-warning/5">
            <Wind size={10} className="text-warning" />
            <span className="font-mono text-[10px] text-warning">CHEM: {chemicalThreat}</span>
          </div>
        )}
      </div>
    </div>
  );
}
