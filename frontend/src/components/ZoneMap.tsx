const HAZARD_FILL: Record<string, string> = {
  LOW: "#10B981", MODERATE: "#F59E0B", HIGH: "#EF4444", CRITICAL: "#EF4444",
};
const HAZARD_OPACITY: Record<string, number> = {
  LOW: 0.08, MODERATE: 0.14, HIGH: 0.25, CRITICAL: 0.35,
};
const DOT_GRID = `radial-gradient(circle, #1F2937 1px, transparent 1px)`;

// Sensor → zone mapping for highlight interaction
const SENSOR_ZONES: Record<string, string> = {
  Sensor_A: "warehouse-b",
  Sensor_B: "chem-storage",
};

export default function ZoneMap({ hazardLevel, activeFires, safeRoutes, highlightSensor }: {
  hazardLevel: string;
  activeFires: string[];
  safeRoutes: string[];
  highlightSensor?: string | null;
}) {
  const fill = HAZARD_FILL[hazardLevel] ?? HAZARD_FILL.MODERATE;
  const opacity = HAZARD_OPACITY[hazardLevel] ?? 0.14;
  const northSafe = safeRoutes.includes("North_Gate");
  const eastSafe = safeRoutes.includes("East_Gate");
  const warehouseFire = activeFires.some(f => f.toLowerCase().includes("warehouse"));

  const highlightedZone = highlightSensor ? SENSOR_ZONES[highlightSensor] : null;
  const warehouseHighlight = highlightedZone === "warehouse-b";
  const chemHighlight = highlightedZone === "chem-storage";

  return (
    <div className="flex flex-col h-full bg-base overflow-hidden">
      <div className="h-9 px-3 border-b border-border bg-surface flex items-center justify-between shrink-0">
        <span className="font-sans text-[12px] font-semibold text-text">Zone Map</span>
        <span className="font-mono text-[9px] text-dim">Municipal Industrial Park</span>
      </div>

      <div
        className="flex-1 relative overflow-hidden"
        style={{ backgroundImage: DOT_GRID, backgroundSize: "18px 18px" }}
      >
        <svg viewBox="0 0 380 240" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Outer perimeter */}
          <rect x="12" y="12" width="356" height="216" fill="none" stroke="#1F2937" strokeWidth="1" strokeDasharray="4,3" />

          {/* Warehouse B — pulses if highlighted or on fire */}
          <rect x="230" y="45" width="120" height="95"
            fill={warehouseFire ? "#EF4444" : fill}
            fillOpacity={warehouseHighlight ? opacity * 3 : warehouseFire ? 0.3 : opacity}
            stroke={warehouseFire ? "#EF4444" : warehouseHighlight ? "#06B6D4" : fill}
            strokeWidth={warehouseHighlight ? "2" : "1.5"}
          />
          <text x="290" y="88" textAnchor="middle" fill="#9CA3AF" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="500">WAREHOUSE-B</text>
          {warehouseFire && <text x="290" y="104" textAnchor="middle" fill="#EF4444" fontSize="9" fontFamily="JetBrains Mono, monospace">⬤ FIRE</text>}
          {warehouseHighlight && <text x="290" y="120" textAnchor="middle" fill="#06B6D4" fontSize="8" fontFamily="JetBrains Mono, monospace">← Sensor A</text>}

          {/* Chemical Storage */}
          <rect x="138" y="78" width="76" height="66"
            fill={fill}
            fillOpacity={chemHighlight ? opacity * 3.5 : opacity * 1.6}
            stroke={chemHighlight ? "#06B6D4" : fill}
            strokeWidth={chemHighlight ? "2" : "1.5"}
          />
          <text x="176" y="107" textAnchor="middle" fill="#9CA3AF" fontSize="8" fontFamily="JetBrains Mono, monospace">CHEM</text>
          <text x="176" y="119" textAnchor="middle" fill="#9CA3AF" fontSize="8" fontFamily="JetBrains Mono, monospace">STORAGE</text>
          {chemHighlight && <text x="176" y="134" textAnchor="middle" fill="#06B6D4" fontSize="8" fontFamily="JetBrains Mono, monospace">← Sensor B</text>}

          {/* Command Post */}
          <rect x="28" y="88" width="85" height="55" fill="#111827" stroke="#374151" strokeWidth="1.5" />
          <text x="70" y="113" textAnchor="middle" fill="#06B6D4" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="500">CMD POST</text>
          <text x="70" y="126" textAnchor="middle" fill="#4B5563" fontSize="8" fontFamily="JetBrains Mono, monospace">Sector-1</text>

          {/* Staging area */}
          <rect x="28" y="158" width="185" height="45" fill="none" stroke="#1F2937" strokeWidth="1" strokeDasharray="3,3" />
          <text x="120" y="185" textAnchor="middle" fill="#374151" fontSize="8" fontFamily="JetBrains Mono, monospace">STAGING AREA</text>

          {/* North Gate */}
          <rect x="150" y="12" width="88" height="18"
            fill={northSafe ? "#10B981" : "#EF4444"}
            fillOpacity="0.18"
            stroke={northSafe ? "#10B981" : "#EF4444"}
            strokeWidth="1.5"
          />
          <text x="194" y="24.5" textAnchor="middle"
            fill={northSafe ? "#10B981" : "#EF4444"}
            fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600">
            N-GATE · {northSafe ? "OPEN" : "CLOSED"}
          </text>

          {/* East Gate */}
          <rect x="355" y="92" width="13" height="58"
            fill={eastSafe ? "#10B981" : "#EF4444"}
            fillOpacity="0.18"
            stroke={eastSafe ? "#10B981" : "#EF4444"}
            strokeWidth="1.5"
          />
          <text x="361" y="124" textAnchor="middle"
            fill={eastSafe ? "#10B981" : "#EF4444"}
            fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="600"
            transform="rotate(90,361,124)">
            E-GATE · {eastSafe ? "OPEN" : "CLOSED"}
          </text>

          {/* Evac arrows */}
          {northSafe && <path d="M194 44 L194 30" stroke="#10B981" strokeWidth="1.5" strokeDasharray="3,2" markerEnd="url(#ag)" />}
          {eastSafe && <path d="M350 121 L355 121" stroke="#10B981" strokeWidth="1.5" strokeDasharray="3,2" markerEnd="url(#ag)" />}

          {/* Compass */}
          <g transform="translate(330,195)">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#1F2937" strokeWidth="1" />
            <text x="0" y="-7" textAnchor="middle" fill="#4B5563" fontSize="6" fontFamily="JetBrains Mono">N</text>
            <text x="0" y="11" textAnchor="middle" fill="#4B5563" fontSize="6" fontFamily="JetBrains Mono">S</text>
            <text x="-10" y="2.5" textAnchor="middle" fill="#4B5563" fontSize="6" fontFamily="JetBrains Mono">W</text>
            <text x="10" y="2.5" textAnchor="middle" fill="#4B5563" fontSize="6" fontFamily="JetBrains Mono">E</text>
            <line x1="0" y1="0" x2="0" y2="-8" stroke="#06B6D4" strokeWidth="1.5" />
          </g>

          <defs>
            <marker id="ag" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#10B981" />
            </marker>
          </defs>

          <text x="15" y="234" fill="#374151" fontSize="7" fontFamily="JetBrains Mono, monospace">
            EVAC: {safeRoutes.join(" + ")}  ·  THREAT: {hazardLevel}
          </text>
        </svg>
      </div>
    </div>
  );
}
