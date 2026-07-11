import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  Sun,
  Moon,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Lightbulb,
  Eye,
  X,
  Info,
} from "lucide-react";

/* ---------------------------------------------------------
   Static map data — a small illustrated street grid.
   Not tied to a real geocoder: this is a hackathon prototype,
   so the "city" is hand-authored to tell a clear safety story.
--------------------------------------------------------- */

const XS = [100, 250, 400, 550, 700];
const YS = [90, 210, 330, 450];

const BUILDINGS = (() => {
  const out = [];
  for (let r = 0; r < YS.length - 1; r++) {
    for (let c = 0; c < XS.length - 1; c++) {
      const bx = XS[c],
        bx2 = XS[c + 1],
        by = YS[r],
        by2 = YS[r + 1];
      const pad = 16;
      const innerW = bx2 - bx - pad * 2;
      const innerH = by2 - by - pad * 2;
      const split = (r + c) % 2 === 0;
      if (split) {
        const gw = (innerW - 10) / 2;
        out.push({ x: bx + pad, y: by + pad, w: gw, h: innerH, shade: (r + c) % 3 });
        out.push({
          x: bx + pad + gw + 10,
          y: by + pad,
          w: gw,
          h: innerH * 0.68,
          shade: (r + c + 1) % 3,
        });
      } else {
        out.push({ x: bx + pad, y: by + pad, w: innerW * 0.62, h: innerH, shade: (r + c) % 3 });
      }
    }
  }
  return out;
})();

const LAMPS = [
  { x: 100, y: 90, b: 0.9 },
  { x: 250, y: 90, b: 0.9 },
  { x: 400, y: 90, b: 0.9 },
  { x: 550, y: 90, b: 0.9 },
  { x: 700, y: 90, b: 0.85 },
  { x: 700, y: 210, b: 0.85 },
  { x: 700, y: 330, b: 0.85 },
  { x: 700, y: 450, b: 0.85 },
  { x: 400, y: 210, b: 0.6 },
  { x: 400, y: 330, b: 0.55 },
  { x: 550, y: 330, b: 0.6 },
  { x: 100, y: 210, b: 0.25 },
  { x: 100, y: 330, b: 0.2 },
  { x: 175, y: 330, b: 0.2 },
  { x: 250, y: 330, b: 0.25 },
  { x: 250, y: 390, b: 0.3 },
  { x: 250, y: 450, b: 0.35 },
  { x: 400, y: 450, b: 0.5 },
  { x: 550, y: 450, b: 0.55 },
];

const ROUTES = [
  {
    id: "a",
    name: "Main Street",
    distance: "1.4 km",
    baseLit: 87,
    why: "Follows lit main roads the whole way",
    waypoints: [
      { x: 100, y: 90 },
      { x: 700, y: 90 },
      { x: 700, y: 450 },
    ],
  },
  {
    id: "b",
    name: "Diagonal Cut",
    distance: "1.1 km",
    baseLit: 65,
    why: "Mix of main roads and side streets",
    waypoints: [
      { x: 100, y: 90 },
      { x: 400, y: 90 },
      { x: 400, y: 330 },
      { x: 700, y: 330 },
      { x: 700, y: 450 },
    ],
  },
  {
    id: "c",
    name: "Back-Lane Shortcut",
    distance: "0.9 km",
    baseLit: 32,
    why: "Shortest, but cuts through a dim side lane",
    waypoints: [
      { x: 100, y: 90 },
      { x: 100, y: 330 },
      { x: 250, y: 330 },
      { x: 250, y: 450 },
      { x: 700, y: 450 },
    ],
  },
];

const INCIDENT_TYPES = {
  lighting: { label: "Poor lighting", icon: Lightbulb, severity: 8 },
  unsafe: { label: "Felt unsafe", icon: ShieldAlert, severity: 12 },
  harassment: { label: "Harassment reported", icon: AlertTriangle, severity: 18 },
  suspicious: { label: "Suspicious activity", icon: Eye, severity: 14 },
};

/* ---------------------------------------------------------
   Geometry + scoring helpers
--------------------------------------------------------- */

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1,
    dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx,
    projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function distToPolyline(px, py, points) {
  let min = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const d = distToSegment(px, py, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
    if (d < min) min = d;
  }
  return min;
}

function computeScore(route, incidents, mode) {
  const lit = route.baseLit * 0.9;
  let score = lit + (mode === "night" ? -3 : 8);
  const RADIUS = 90;
  incidents.forEach((inc) => {
    const d = distToPolyline(inc.x, inc.y, route.waypoints);
    if (d < RADIUS) {
      score -= INCIDENT_TYPES[inc.type].severity * (1 - d / RADIUS);
    }
  });
  return Math.max(2, Math.min(98, Math.round(score)));
}

function scoreColor(score) {
  if (score >= 75) return { fill: "#7FD8A6", ring: "#4CAF82", label: "Safer" };
  if (score >= 50) return { fill: "#FFB648", ring: "#E09A2F", label: "Caution" };
  return { fill: "#F0556B", ring: "#D93A52", label: "Higher risk" };
}

function pathD(points) {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

function midpoint(points) {
  return points[Math.floor(points.length / 2)];
}

function timeAgo(ts, now) {
  const s = Math.floor((now - ts) / 1000);
  if (s < 45) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

/* ---------------------------------------------------------
   Component
--------------------------------------------------------- */

export default function SafeSphereRoute() {
  const [mode, setMode] = useState("night");
  const [incidents, setIncidents] = useState([
    { id: 1, x: 175, y: 330, type: "lighting", time: Date.now() - 1000 * 60 * 42 },
  ]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [reportMode, setReportMode] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [fromLabel, setFromLabel] = useState("Home");
  const [toLabel, setToLabel] = useState("Library — night class");
  const [now, setNow] = useState(Date.now());
  const svgRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const scores = useMemo(() => {
    const map = {};
    ROUTES.forEach((r) => {
      map[r.id] = computeScore(r, incidents, mode);
    });
    return map;
  }, [incidents, mode]);

  const recommendedId = useMemo(() => {
    return ROUTES.reduce((best, r) => (scores[r.id] > scores[best] ? r.id : best), ROUTES[0].id);
  }, [scores]);

  function handleMapClick(e) {
    if (!reportMode) return;
    const svg = svgRef.current;
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const loc = pt.matrixTransform(ctm.inverse());
    setPendingPin({ x: loc.x, y: loc.y });
    setReportMode(false);
    setShowModal(true);
  }

  function confirmIncident(typeKey) {
    if (!pendingPin) return;
    setIncidents((prev) => [
      { id: Date.now(), x: pendingPin.x, y: pendingPin.y, type: typeKey, time: Date.now() },
      ...prev,
    ]);
    setPendingPin(null);
    setShowModal(false);
  }

  function cancelReport() {
    setPendingPin(null);
    setShowModal(false);
    setReportMode(false);
  }

  const isNight = mode === "night";

  const colors = {
    bg1: isNight ? "#171B3A" : "#F5F7F8",
    border: isNight ? "#2B3163" : "#D7DEE2",
    text: isNight ? "#EDEFFB" : "#1B2230",
    textDim: isNight ? "#9AA0C4" : "#5B6472",
    accent: "#8B7CF6",
    street: isNight ? "#1B2148" : "#C9C2AE",
    buildingShades: isNight ? ["#232A52", "#1D2447", "#191F3D"] : ["#E7E2D6", "#DAD4C4", "#CFC8B4"],
  };

  return (
    <div
      className="w-full relative overflow-hidden"
      style={{ minHeight: "820px", fontFamily: "'Inter', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap');
        @keyframes lampGlow {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.14); opacity: 1; }
        }
        @keyframes ripple {
          0% { transform: scale(0.6); opacity: 0.55; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes pinDrop {
          0% { transform: translateY(-16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        .ss-lamp-glow { animation: lampGlow 3s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .ss-ripple { animation: ripple 2.2s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        .ss-pin { animation: pinDrop 0.4s ease-out; transform-box: fill-box; transform-origin: bottom center; }
      `}</style>

      {/* crossfading sky backgrounds */}
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: isNight ? 0 : 1,
          background: "linear-gradient(180deg, #E9EEF2 0%, #DCE3E6 100%)",
        }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{
          opacity: isNight ? 1 : 0,
          background:
            "radial-gradient(circle at 28% 15%, #1B2050 0%, #0F1226 55%, #0A0C1C 100%)",
        }}
      />

      <div className="relative flex flex-col h-full" style={{ minHeight: "820px" }}>
        {/* header */}
        <div className="flex items-center justify-between px-4 lg:px-6 pt-5 pb-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: "'Fraunces', serif",
                  fontWeight: 600,
                  fontSize: "26px",
                  color: colors.text,
                }}
              >
                SafeSphere
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "11px",
                  color: colors.accent,
                  letterSpacing: "0.06em",
                }}
              >
                ROUTE
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: colors.textDim }}>
              See which street is lit before you walk it.
            </p>
          </div>

          {/* day/night toggle */}
          <button
            onClick={() => setMode(isNight ? "day" : "night")}
            className="flex items-center gap-2 rounded-full px-3 py-2 transition-colors duration-300"
            style={{
              backgroundColor: colors.bg1,
              border: `1px solid ${colors.border}`,
            }}
          >
            <Sun
              size={15}
              style={{ color: isNight ? colors.textDim : "#E09A2F", transition: "color .3s" }}
            />
            <div
              className="relative rounded-full"
              style={{
                width: "34px",
                height: "18px",
                backgroundColor: isNight ? colors.accent : "#D7DEE2",
                transition: "background-color .3s",
              }}
            >
              <div
                className="absolute rounded-full transition-all duration-300"
                style={{
                  top: "2px",
                  left: isNight ? "18px" : "2px",
                  width: "14px",
                  height: "14px",
                  backgroundColor: "#fff",
                }}
              />
            </div>
            <Moon
              size={14}
              style={{ color: isNight ? "#B7ACFF" : colors.textDim, transition: "color .3s" }}
            />
          </button>
        </div>

        {/* body */}
        <div className="flex flex-1 flex-col lg:flex-row gap-4 px-4 lg:px-6 pb-5 overflow-hidden">
          {/* sidebar */}
          <div
            className="w-full lg:w-96 flex-shrink-0 flex flex-col gap-3 overflow-y-auto"
            style={{ maxHeight: "740px" }}
          >
            {/* from/to */}
            <div
              className="rounded-2xl p-3.5"
              style={{ backgroundColor: colors.bg1, border: `1px solid ${colors.border}` }}
            >
              <label className="text-xs font-medium" style={{ color: colors.textDim }}>
                From
              </label>
              <input
                value={fromLabel}
                onChange={(e) => setFromLabel(e.target.value)}
                className="w-full mt-1 mb-2 text-sm bg-transparent outline-none"
                style={{ color: colors.text }}
              />
              <div style={{ borderTop: `1px solid ${colors.border}` }} />
              <label className="text-xs font-medium block mt-2" style={{ color: colors.textDim }}>
                To
              </label>
              <input
                value={toLabel}
                onChange={(e) => setToLabel(e.target.value)}
                className="w-full mt-1 text-sm bg-transparent outline-none"
                style={{ color: colors.text }}
              />
            </div>

            {/* routes */}
            <div
              className="rounded-2xl p-3.5 flex flex-col gap-2.5"
              style={{ backgroundColor: colors.bg1, border: `1px solid ${colors.border}` }}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold" style={{ color: colors.text }}>
                  Routes
                </span>
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className="flex items-center gap-1 text-xs"
                  style={{ color: colors.accent }}
                >
                  <Info size={13} /> How scores work
                </button>
              </div>

              {showInfo && (
                <p
                  className="text-xs rounded-xl p-2.5 leading-relaxed"
                  style={{ backgroundColor: isNight ? "#20264B" : "#EDEEF0", color: colors.textDim }}
                >
                  Each score blends street-lighting coverage, nearby community reports, and time of
                  day. Night hours weight lighting more heavily. Drop a report on the map and watch
                  scores update live.
                </p>
              )}

              {ROUTES.map((route) => {
                const score = scores[route.id];
                const sc = scoreColor(score);
                const selected = selectedRouteId === route.id;
                const nearby = incidents.filter(
                  (inc) => distToPolyline(inc.x, inc.y, route.waypoints) < 90
                ).length;
                return (
                  <button
                    key={route.id}
                    onClick={() => setSelectedRouteId(selected ? null : route.id)}
                    className="text-left rounded-xl p-2.5 transition-all duration-200"
                    style={{
                      backgroundColor: selected ? (isNight ? "#242B57" : "#EEEBFC") : "transparent",
                      border: `1px solid ${selected ? colors.accent : "transparent"}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold" style={{ color: colors.text }}>
                          {route.name}
                        </span>
                        {route.id === recommendedId && (
                          <span
                            className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                            style={{ backgroundColor: "#7FD8A6", color: "#0F3A24" }}
                          >
                            <ShieldCheck size={10} />
                            <span style={{ fontSize: "9px", fontWeight: 700 }}>BEST</span>
                          </span>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: "13px",
                          fontWeight: 600,
                          color: sc.fill,
                        }}
                      >
                        {score}
                      </span>
                    </div>
                    <div
                      className="w-full rounded-full mt-1.5 mb-1.5"
                      style={{ height: "5px", backgroundColor: isNight ? "#2B3163" : "#E4E7EA" }}
                    >
                      <div
                        className="rounded-full transition-all duration-500"
                        style={{ height: "5px", width: `${score}%`, backgroundColor: sc.fill }}
                      />
                    </div>
                    <p className="text-xs" style={{ color: colors.textDim }}>
                      {route.distance} · {route.why}
                      {nearby > 0 ? ` — ${nearby} report${nearby > 1 ? "s" : ""} nearby` : ""}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* report button */}
            <button
              onClick={() => setReportMode(true)}
              disabled={reportMode}
              className="rounded-2xl p-3 flex items-center justify-center gap-2 text-sm font-semibold transition-opacity duration-200"
              style={{
                backgroundColor: colors.accent,
                color: "#fff",
                opacity: reportMode ? 0.6 : 1,
              }}
            >
              <AlertTriangle size={15} />
              {reportMode ? "Click the map to place a pin…" : "Report an incident"}
            </button>

            {/* recent reports */}
            <div
              className="rounded-2xl p-3.5 flex flex-col gap-2"
              style={{ backgroundColor: colors.bg1, border: `1px solid ${colors.border}` }}
            >
              <span className="text-sm font-semibold" style={{ color: colors.text }}>
                Recent reports
              </span>
              {incidents.length === 0 && (
                <p className="text-xs" style={{ color: colors.textDim }}>
                  No reports yet — this street network is looking clear.
                </p>
              )}
              {incidents
                .slice()
                .sort((a, b) => b.time - a.time)
                .map((inc) => {
                  const meta = INCIDENT_TYPES[inc.type];
                  const Icon = meta.icon;
                  return (
                    <div key={inc.id} className="flex items-center gap-2">
                      <div
                        className="flex items-center justify-center rounded-full flex-shrink-0"
                        style={{
                          width: "24px",
                          height: "24px",
                          backgroundColor: isNight ? "#2B3163" : "#EDEEF0",
                        }}
                      >
                        <Icon size={12} style={{ color: colors.accent }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-medium" style={{ color: colors.text }}>
                          {meta.label}
                        </p>
                      </div>
                      <span
                        style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: colors.textDim }}
                      >
                        {timeAgo(inc.time, now)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* map */}
          <div
            className="relative flex-1 rounded-2xl overflow-hidden"
            style={{
              minHeight: "460px",
              border: `1px solid ${colors.border}`,
              cursor: reportMode ? "crosshair" : "default",
            }}
          >
            {reportMode && (
              <div
                className="absolute top-3 left-1/2 z-20 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium"
                style={{
                  transform: "translateX(-50%)",
                  backgroundColor: colors.accent,
                  color: "#fff",
                }}
              >
                Click anywhere on the map to drop a pin
                <button onClick={() => setReportMode(false)}>
                  <X size={13} />
                </button>
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 800 540"
              className="w-full h-full"
              onClick={handleMapClick}
              style={{ display: "block" }}
            >
              <defs>
                <filter id="ss-glow" x="-60%" y="-60%" width="220%" height="220%">
                  <feGaussianBlur stdDeviation="4.5" />
                </filter>
                <filter id="ss-lamp-blur" x="-200%" y="-200%" width="500%" height="500%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>

              {/* streets */}
              {XS.map((x) => (
                <line key={`v${x}`} x1={x} y1={70} x2={x} y2={470} stroke={colors.street} strokeWidth={10} />
              ))}
              {YS.map((y) => (
                <line key={`h${y}`} x1={80} y1={y} x2={720} y2={y} stroke={colors.street} strokeWidth={10} />
              ))}

              {/* buildings */}
              {BUILDINGS.map((b, i) => (
                <rect
                  key={i}
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  rx={6}
                  fill={colors.buildingShades[b.shade]}
                  style={{ transition: "fill .5s" }}
                />
              ))}

              {/* route glow underlays */}
              {ROUTES.map((route) => {
                const score = scores[route.id];
                const sc = scoreColor(score);
                const dim = selectedRouteId && selectedRouteId !== route.id;
                if (dim) return null;
                return (
                  <path
                    key={`glow-${route.id}`}
                    d={pathD(route.waypoints)}
                    fill="none"
                    stroke={sc.fill}
                    strokeWidth={14}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isNight ? 0.35 : 0.2}
                    filter="url(#ss-glow)"
                  />
                );
              })}

              {/* route lines */}
              {ROUTES.map((route) => {
                const score = scores[route.id];
                const sc = scoreColor(score);
                const dim = selectedRouteId && selectedRouteId !== route.id;
                return (
                  <path
                    key={route.id}
                    d={pathD(route.waypoints)}
                    fill="none"
                    stroke={sc.fill}
                    strokeWidth={dim ? 3 : 5.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={dim ? 0.25 : 1}
                    style={{ transition: "stroke .5s, opacity .3s, stroke-width .2s" }}
                  />
                );
              })}

              {/* route score chips */}
              {ROUTES.map((route) => {
                const score = scores[route.id];
                const sc = scoreColor(score);
                const dim = selectedRouteId && selectedRouteId !== route.id;
                if (dim) return null;
                const mid = midpoint(route.waypoints);
                return (
                  <g key={`chip-${route.id}`} transform={`translate(${mid.x}, ${mid.y - 16})`}>
                    <rect x={-16} y={-11} width={32} height={20} rx={10} fill={isNight ? "#0F1226" : "#fff"} stroke={sc.fill} strokeWidth={1.5} />
                    <text
                      x={0}
                      y={3}
                      textAnchor="middle"
                      style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", fontWeight: 700, fill: sc.fill }}
                    >
                      {score}
                    </text>
                  </g>
                );
              })}

              {/* lamps */}
              {LAMPS.map((lamp, i) => (
                <g key={i}>
                  {isNight && (
                    <circle
                      className="ss-lamp-glow"
                      cx={lamp.x}
                      cy={lamp.y}
                      r={6 + lamp.b * 14}
                      fill="#FFB648"
                      opacity={lamp.b * 0.5}
                      filter="url(#ss-lamp-blur)"
                      style={{ animationDelay: `${(i % 6) * 0.4}s` }}
                    />
                  )}
                  <circle cx={lamp.x} cy={lamp.y} r={isNight ? 2.5 : 2} fill={isNight ? "#FFD79A" : "#9C9484"} />
                </g>
              ))}

              {/* incident pins */}
              {incidents.map((inc) => {
                const meta = INCIDENT_TYPES[inc.type];
                return (
                  <g key={inc.id} className="ss-pin" transform={`translate(${inc.x}, ${inc.y})`}>
                    <circle className="ss-ripple" r={9} fill="none" stroke="#F0556B" strokeWidth={1.5} />
                    <circle r={9} fill="#F0556B" stroke={isNight ? "#0F1226" : "#fff"} strokeWidth={2} />
                    <circle r={3} fill="#fff" />
                  </g>
                );
              })}

              {/* pending pin */}
              {pendingPin && (
                <circle cx={pendingPin.x} cy={pendingPin.y} r={9} fill="none" stroke={colors.accent} strokeWidth={2} strokeDasharray="3 3" />
              )}

              {/* start marker */}
              <g transform="translate(100, 90)">
                <circle r={9} fill="#7FD8A6" stroke={isNight ? "#0F1226" : "#fff"} strokeWidth={2.5} />
                <circle r={3} fill="#0F3A24" />
                <text x={14} y={-8} style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 600, fill: colors.text }}>
                  {fromLabel || "Home"}
                </text>
              </g>

              {/* end marker */}
              <g transform="translate(700, 450)">
                <MapPinMarker color={colors.accent} dark={isNight} />
                <text x={16} y={-10} style={{ fontFamily: "'Inter', sans-serif", fontSize: "12px", fontWeight: 600, fill: colors.text }}>
                  {toLabel || "Destination"}
                </text>
              </g>
            </svg>

            {/* legend */}
            <div
              className="absolute bottom-3 left-3 rounded-xl px-3 py-2 flex flex-col gap-1"
              style={{ backgroundColor: isNight ? "rgba(15,18,38,0.85)" : "rgba(255,255,255,0.9)", border: `1px solid ${colors.border}` }}
            >
              <div className="flex items-center gap-3">
                {[
                  { c: "#7FD8A6", l: "Safer" },
                  { c: "#FFB648", l: "Caution" },
                  { c: "#F0556B", l: "Higher risk" },
                ].map((it) => (
                  <div key={it.l} className="flex items-center gap-1">
                    <div style={{ width: 8, height: 8, borderRadius: 9999, backgroundColor: it.c }} />
                    <span style={{ fontSize: "10px", color: colors.textDim }}>{it.l}</span>
                  </div>
                ))}
              </div>
              <span style={{ fontSize: "9px", color: colors.textDim }}>Lamp glow = street-lighting confidence</span>
            </div>
          </div>
        </div>
      </div>

      {/* category modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: "rgba(10,12,28,0.55)" }}>
          <div
            className="rounded-2xl p-5 w-full mx-4"
            style={{ maxWidth: "360px", backgroundColor: colors.bg1, border: `1px solid ${colors.border}` }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold" style={{ color: colors.text }}>
                What did you notice here?
              </span>
              <button onClick={cancelReport}>
                <X size={16} style={{ color: colors.textDim }} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(INCIDENT_TYPES).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <button
                    key={key}
                    onClick={() => confirmIncident(key)}
                    className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-center transition-colors duration-150"
                    style={{ backgroundColor: isNight ? "#20264B" : "#EDEEF0" }}
                  >
                    <Icon size={18} style={{ color: colors.accent }} />
                    <span className="text-xs font-medium" style={{ color: colors.text }}>
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPinMarker({ color, dark }) {
  return (
    <>
      <circle r={9} fill={color} stroke={dark ? "#0F1226" : "#fff"} strokeWidth={2.5} />
      <circle r={3} fill="#fff" />
    </>
  );
}
