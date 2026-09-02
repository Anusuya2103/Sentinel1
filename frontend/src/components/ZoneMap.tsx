const HAZARD_FILL: Record<string, string> = {
  LOW:      "#3ECF8E", MODERATE: "#F0A93A",
  HIGH:     "#FF4D4F", CRITICAL: "#FF4D4F",
};
const HAZARD_OPACITY: Record<string, number> = {
  LOW: 0.1, MODERATE: 0.15, HIGH: 0.25, CRITICAL: 0.35,
};
const DOT_GRID = `radial-gradient(circle, #1E2D3D 1px, transparent 1px)`;

export default function ZoneMap({ hazardLevel, activeFires, safeRoutes }: {
  hazardLevel: string; activeFires: string[]; safeRoutes: string[];
}) {
  const fill = HAZARD_FILL[hazardLevel] ?? HAZARD_FILL.MODERATE;
  const opacity = HAZARD_OPACITY[hazardLevel] ?? 0.15;
  const northSafe = safeRoutes.includes("North_Gate");
  const eastSafe = safeRoutes.includes("East_Gate");
  const warehouseFire = activeFires.some(f => f.toLowerCase().includes("warehouse"));

  return (
    <div className="flex flex-col h-full bg-panel min-h-0">
      <div className="h-8 px-3 border-b border-border flex items-center gap-2 bg-panel2 shrink-0">
        <span className="font-mono text-[11px] font-medium text-text">ZONE MAP</span>
        <span className="font-mono text-[9px] text-dim">· Municipal Industrial Park</span>
        <span className="ml-auto font-mono text-[9px] text-dim">HAZARD: {hazardLevel}</span>
      </div>

      <div
        className="flex-1 relative overflow-hidden"
        style={{
          backgroundImage: DOT_GRID,
          backgroundSize: "20px 20px",
        }}
      >
        <svg viewBox="0 0 400 280" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {/* Outer fence */}
          <rect x="15" y="15" width="370" height="250" fill="none" stroke="#1E2D3D" strokeWidth="1" strokeDasharray="4,3" />

          {/* Warehouse B */}
          <rect x="245" y="55" width="115" height="95"
            fill={warehouseFire ? "#FF4D4F" : fill}
            fillOpacity={warehouseFire ? 0.3 : opacity}
            stroke={warehouseFire ? "#FF4D4F" : fill}
            strokeWidth="1.5"
          />
          <text x="302" y="96" textAnchor="middle" fill="#8B9EB5" fontSize="9" fontFamily="IBM Plex Mono, monospace" fontWeight="500">WAREHOUSE-B</text>
          {warehouseFire && <>
            <text x="302" y="113" textAnchor="middle" fill="#FF4D4F" fontSize="9" fontFamily="IBM Plex Mono, monospace">⬤ FIRE ACTIVE</text>
          </>}

          {/* Chemical Storage */}
          <rect x="145" y="85" width="82" height="68"
            fill={fill} fillOpacity={opacity * 1.6}
            stroke={fill} strokeWidth="1.5"
          />
          <text x="186" y="115" textAnchor="middle" fill="#8B9EB5" fontSize="8" fontFamily="IBM Plex Mono, monospace">CHEM</text>
          <text x="186" y="127" textAnchor="middle" fill="#8B9EB5" fontSize="8" fontFamily="IBM Plex Mono, monospace">STORAGE</text>

          {/* Command Post */}
          <rect x="35" y="95" width="82" height="52" fill="#0D1117" stroke="#2D4A6B" strokeWidth="1.5" />
          <text x="76" y="118" textAnchor="middle" fill="#4DA6FF" fontSize="9" fontFamily="IBM Plex Mono, monospace" fontWeight="500">CMD POST</text>
          <text x="76" y="131" textAnchor="middle" fill="#2D4A6B" fontSize="8" fontFamily="IBM Plex Mono, monospace">Sector-1</text>

          {/* Parking / staging area */}
          <rect x="35" y="165" width="180" height="50" fill="none" stroke="#1E2D3D" strokeWidth="1" strokeDasharray="3,3" />
          <text x="125" y="195" textAnchor="middle" fill="#3D5470" fontSize="8" fontFamily="IBM Plex Mono, monospace">STAGING AREA</text>

          {/* North Gate */}
          <rect x="155" y="15" width="90" height="18"
            fill={northSafe ? "#3ECF8E" : "#FF4D4F"}
            fillOpacity="0.2"
            stroke={northSafe ? "#3ECF8E" : "#FF4D4F"}
            strokeWidth="1.5"
          />
          <text x="200" y="27.5" textAnchor="middle"
            fill={northSafe ? "#3ECF8E" : "#FF4D4F"}
            fontSize="8" fontFamily="IBM Plex Mono, monospace" fontWeight="600">
            N-GATE · {northSafe ? "OPEN" : "CLOSED"}
          </text>

          {/* East Gate */}
          <rect x="370" y="95" width="15" height="60"
            fill={eastSafe ? "#3ECF8E" : "#FF4D4F"}
            fillOpacity="0.2"
            stroke={eastSafe ? "#3ECF8E" : "#FF4D4F"}
            strokeWidth="1.5"
          />
          <text x="377" y="128" textAnchor="middle"
            fill={eastSafe ? "#3ECF8E" : "#FF4D4F"}
            fontSize="8" fontFamily="IBM Plex Mono, monospace" fontWeight="600"
            transform="rotate(90,377,128)">
            E-GATE · {eastSafe ? "OPEN" : "CLOSED"}
          </text>

          {/* Evac route arrows */}
          {northSafe && <path d="M200 55 L200 33" stroke="#3ECF8E" strokeWidth="1.5" strokeDasharray="3,2" markerEnd="url(#ag)" />}
          {eastSafe && <path d="M360 125 L370 125" stroke="#3ECF8E" strokeWidth="1.5" strokeDasharray="3,2" markerEnd="url(#ag)" />}

          {/* Wind direction indicator */}
          <g transform="translate(345, 215)">
            <circle cx="0" cy="0" r="16" fill="none" stroke="#1E2D3D" strokeWidth="1" />
            <text x="0" y="-8" textAnchor="middle" fill="#2D4A6B" fontSize="6" fontFamily="IBM Plex Mono">N</text>
            <text x="0" y="12" textAnchor="middle" fill="#2D4A6B" fontSize="6" fontFamily="IBM Plex Mono">S</text>
            <text x="-12" y="3" textAnchor="middle" fill="#2D4A6B" fontSize="6" fontFamily="IBM Plex Mono">W</text>
            <text x="12" y="3" textAnchor="middle" fill="#2D4A6B" fontSize="6" fontFamily="IBM Plex Mono">E</text>
            <line x1="0" y1="0" x2="0" y2="-10" stroke="#4DA6FF" strokeWidth="1.5" />
          </g>

          <defs>
            <marker id="ag" markerWidth="5" markerHeight="5" refX="3" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#3ECF8E" />
            </marker>
          </defs>

          {/* Status footer */}
          <text x="20" y="272" fill="#3D5470" fontSize="7" fontFamily="IBM Plex Mono, monospace">
            ROUTES: {safeRoutes.join(" + ")}  ·  HAZARD: {hazardLevel}
          </text>
        </svg>
      </div>
    </div>
  );
}
