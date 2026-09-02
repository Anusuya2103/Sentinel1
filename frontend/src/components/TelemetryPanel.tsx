import { Thermometer, Wind, AlertTriangle, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import type { Sensor } from "../hooks/useWebSocket";

function SensorGauge({ id, sensor, danger }: { id: string; sensor: Sensor; danger: boolean }) {
  const isTemp = id === "Sensor_A";
  const max = isTemp ? 200 : 100;
  const pct = Math.min(100, (sensor.value / max) * 100);
  const barColor = pct > 80 ? "bg-critical" : pct > 55 ? "bg-moderate" : "bg-safe";
  const Icon = isTemp ? Thermometer : Wind;

  return (
    <div className={`p-3 border-b border-border ${danger ? "bg-critical/5" : ""}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={11} className={danger ? "text-critical" : "text-muted"} />
          <span className="font-mono text-[11px] font-medium text-muted">{id}</span>
          <span className="font-mono text-[9px] text-dim">· {sensor.location}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {danger && <AlertTriangle size={10} className="text-critical blink" />}
          <TrendingUp size={9} className="text-dim" />
        </div>
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <motion.span
          key={Math.floor(sensor.value)}
          className={`font-mono text-2xl font-semibold tabular-nums ${danger ? "text-critical" : "text-text"}`}
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          {sensor.value.toFixed(1)}
        </motion.span>
        <span className="font-mono text-sm text-muted">{sensor.unit}</span>
        <span className="ml-auto font-mono text-[9px] text-dim">
          {pct.toFixed(0)}% of max
        </span>
      </div>

      {/* Bar */}
      <div className="h-1 bg-border rounded-none overflow-hidden">
        <motion.div
          className={`h-full ${barColor} transition-colors duration-500`}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>

      {/* Scale markers */}
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
  MODERATE: "text-moderate border-moderate/30 bg-moderate/10",
  HIGH:     "text-critical border-critical/30 bg-critical/10",
  CRITICAL: "text-critical border-critical/50 bg-critical/15",
};

export default function TelemetryPanel({ sensors, hazardLevel, activeFires, chemicalThreat }: {
  sensors: Record<string, Sensor>;
  hazardLevel: string;
  activeFires: string[];
  chemicalThreat: string | null;
}) {
  const badgeClass = HAZARD_BADGE[hazardLevel] ?? HAZARD_BADGE.MODERATE;

  return (
    <div className="bg-panel border-b border-border">
      {/* Header */}
      <div className="h-8 px-3 border-b border-border flex items-center gap-2 bg-panel2">
        <span className="font-mono text-[11px] font-medium text-text">IOT TELEMETRY</span>
        <span className="font-mono text-[9px] text-dim">· 2s tick</span>
        <div className="ml-auto flex items-center gap-2">
          <motion.span
            className={`font-mono text-[10px] font-bold px-2 py-0.5 border ${badgeClass}`}
            animate={hazardLevel === "CRITICAL" ? { opacity: [1, 0.5, 1] } : {}}
            transition={{ duration: 0.7, repeat: Infinity }}
          >
            {hazardLevel}
          </motion.span>
        </div>
      </div>

      {/* Gauges */}
      {Object.entries(sensors).map(([id, s]) => (
        <SensorGauge
          key={id} id={id} sensor={s}
          danger={id === "Sensor_A" ? s.value > 150 : s.value > 80}
        />
      ))}

      {/* Alert rows */}
      {activeFires.map(loc => (
        <div key={loc} className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-critical/5">
          <AlertTriangle size={10} className="text-critical shrink-0" />
          <span className="font-mono text-[10px] text-critical">FIRE: {loc}</span>
        </div>
      ))}
      {chemicalThreat && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-moderate/5">
          <Wind size={10} className="text-moderate shrink-0" />
          <span className="font-mono text-[10px] text-moderate">CHEM: {chemicalThreat}</span>
        </div>
      )}
    </div>
  );
}
