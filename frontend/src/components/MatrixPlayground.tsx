import { useState, useEffect, useCallback, useRef } from "react";
import { getWebSocket, whenSocketOpen } from "../ws";

// Improved slider component with drag state tracking
function Slider({ 
  label, 
  value, 
  onChange,
  onDragStart,
  onDragEnd
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <label className="flex flex-col items-center mx-2">
      <span className="text-sm mb-1">{label}</span>
      <input
        type="range"
        min={-3}
        max={3}
        step={0.1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onMouseDown={onDragStart}
        onMouseUp={onDragEnd}
        onTouchStart={onDragStart}
        onTouchEnd={onDragEnd}
        className="w-32 accent-indigo-500"
      />
      <span className="text-xs mt-1">{value.toFixed(1)}</span>
    </label>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width="14" height="4">
        <line x1="0" y1="2" x2="14" y2="2" className={`stroke-${color} stroke-[3]`} />
      </svg>
      {label}
    </span>
  );
}

export default function MatrixPlayground() {
  // matrix entries: [a, b; c, d]
  const [[a, b, c, d], setM] = useState<[number, number, number, number]>([1, 0, 0, 1]);

  // derive stats
  const trace = a + d;
  const det = a * d - b * c;
  const disc = trace * trace - 4 * det;
  
  // helper to apply linear transform
  const T = ([x, y]: [number, number]): [number, number] => [a * x + b * y, c * x + d * y];
  
  // Handlers for slider drag events (added for compatibility)
  const [dragging, setDragging] = useState(false);

  const handleDragStart = useCallback(() => setDragging(true), []);
  const handleDragEnd = useCallback(() => setDragging(false), []);

  // drawing constants
  const size = 400;
  const center = size / 2;
  const scale = 60; // pixels per unit

  // canonical basis & a few test vectors (fixed seeds)
  const basis: [number, number][] = [
    [1, 0],
    [0, 1],
  ];
  
  const tests: [number, number][] = [
    [1, 1],
    [-1, 1],
    [2, -1],
    [-1.5, -0.5],
  ];
  
  // detect whether all images collapse to origin (rank‑0 matrix)
  const collapsed = [
    ...basis.map(T),
    ...tests.map(T),
  ].every(([x, y]) => Math.hypot(x, y) < 1e-6);
  
  // Set up a *single* WebSocket listener for narrative messages.  Because we
  // now re‑use one shared connection, this effect runs only once.
  useEffect(() => {
    const ws = getWebSocket();

    const handleMsg = (ev: MessageEvent) => {
      const msg = JSON.parse(ev.data);
      if (msg.kind === "matrix") {
        window.dispatchEvent(new CustomEvent("narrative", { detail: msg.text }));
      }
    };

    ws.addEventListener("message", handleMsg);
    return () => ws.removeEventListener("message", handleMsg);
  }, []);

  // Whenever the matrix settles (no dragging) send one update, debounced a
  // little so rapid keyboard nudges don't spam either.
  const sendTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dragging) return; // wait until the user releases the slider

    if (sendTimeout.current) clearTimeout(sendTimeout.current);
    sendTimeout.current = setTimeout(() => {
      whenSocketOpen(() => {
        const ws = getWebSocket();
        ws.send(
          JSON.stringify({ kind: "matrix", a, b, c, d, trace, det, disc, collapsed, ts: Date.now() })
        );
      });
    }, 150); // 150 ms – just enough to coalesce quick key presses

    return () => {
      if (sendTimeout.current) clearTimeout(sendTimeout.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a, b, c, d, trace, det, disc, collapsed, dragging]);

  // compute eigenvectors if real
  const eigenData = (() => {
    const trace = a + d;
    const det = a * d - b * c;
    const disc = trace * trace - 4 * det;
    if (disc < 0) return null; // complex eigenvalues
    const sqrtDisc = Math.sqrt(disc);
    const l1 = (trace + sqrtDisc) / 2;
    const l2 = (trace - sqrtDisc) / 2;

    // Helper to compute a (possibly un‑normalised) eigenvector for λ.
    const v = (lambda: number): [number, number] => {
      // Solve (A − λI)·v = 0 ⇒ (a−λ)x + b y = 0 and c x + (d−λ)y = 0.
      // We pick whichever equation gives a non‑trivial relation and build a
      // 2‑component vector accordingly.
      const eps = 1e-8;

      // If either b or c is “large enough” use it directly – this is the
      // generic case.
      if (Math.abs(b) > eps) return [1, -(a - lambda) / b];
      if (Math.abs(c) > eps) return [-(d - lambda) / c, 1];

      // At this point both b and c are ~0, so the matrix is diagonal.  Each
      // axis is an eigenvector – we pick the axis that actually corresponds
      // to the current eigenvalue.
      if (Math.abs(a - lambda) < eps && Math.abs(d - lambda) > eps) return [1, 0];
      if (Math.abs(d - lambda) < eps && Math.abs(a - lambda) > eps) return [0, 1];

      // Scalar multiple of the identity (a ≈ d ≈ λ) – any vector will do.
      return [1, 0];
    };
    return {
      l1,
      v1: v(l1),
      l2,
      v2: Math.abs(l2 - l1) < 1e-8 ? null : v(l2),
    };
  })();

  // build SVG elements
  const toPx = ([x, y]: [number, number]) => [center + x * scale, center - y * scale];
  const line = (from: [number, number], to: [number, number], css: string, key?: string | number) => {
    const [x1, y1] = toPx(from);
    const [x2, y2] = toPx(to);
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} className={css} />;
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex">
        <Slider 
          label="a" 
          value={a} 
          onChange={(v) => setM([v, b, c, d])} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <Slider 
          label="b" 
          value={b} 
          onChange={(v) => setM([a, v, c, d])} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <Slider 
          label="c" 
          value={c} 
          onChange={(v) => setM([a, b, v, d])} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
        <Slider 
          label="d" 
          value={d} 
          onChange={(v) => setM([a, b, c, v])} 
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </div>
      
      {/* canvas */}
      <svg width={size} height={size} className="border rounded shadow-lg bg-white">
        {/* axes */}
        {line([-3, 0], [3, 0], "stroke-gray-300")}
        {line([0, -3], [0, 3], "stroke-gray-300")}

        {/* original test vectors (thin light-gray) */}
        {tests.map((v, i) => line([0, 0], v, "stroke-gray-300 stroke-[1]", `orig-${i}`))}

        {/* images of basis vectors (blue) */}
        {basis.map((v, i) => line([0, 0], T(v), "stroke-sky-500 stroke-[2]", `basis-${i}`))}

        {/* images of test vectors (purple) */}
        {tests.map((v, i) => line([0, 0], T(v), "stroke-purple-500 stroke-[1.5]", `test-${i}`))}

        {/* eigenvectors if real (bold orange) */}
        {eigenData && (
          <>
            {line([0, 0], eigenData.v1 as [number, number], "stroke-amber-600 stroke-[3]", "eig1")}
            {eigenData.v2 && line([0, 0], eigenData.v2 as [number, number], "stroke-amber-600 stroke-[3]", "eig2")}
          </>
        )}

        {/* dot at origin when everything collapses (e.g., zero matrix) */}
        {collapsed && (
          <circle
            cx={center}
            cy={center}
            r={4}
            className="fill-red-500 animate-pulse"
          />
        )}
      </svg>

      {/* eigenvalues readout */}
      {eigenData ? (
        <p className="text-sm text-gray-700">
          λ₁ ≈ {eigenData.l1.toFixed(2)}
          {eigenData.v2 && (<>;&nbsp;λ₂ ≈ {eigenData.l2.toFixed(2)}</>)}
        </p>
      ) : (
        <p className="text-sm text-gray-500 italic">Complex eigenvalues (rotation)</p>
      )}

      {/* legend */}
      <div className="flex flex-wrap gap-4 text-xs mt-1">
        <Legend color="gray-300" label="Original direction" />
        <Legend color="sky-500" label="Image of basis" />
        <Legend color="purple-500" label="Image of test vector" />
        <Legend color="amber-600" label="Eigenvector" />
      </div>
    </div>
  );
}
