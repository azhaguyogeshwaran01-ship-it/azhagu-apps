import React, { useMemo, useRef, useState } from 'react';
import type { CurveChannel, CurvePoint, ToneCurves } from '../types/editor';
import { clamp, evaluateSplineCurve } from '../utils/colorMath';

interface CurveEditorProps {
  curves: ToneCurves;
  onChange: (curves: ToneCurves) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

const CHANNEL_META: { id: CurveChannel; label: string; stroke: string }[] = [
  { id: 'rgb', label: 'RGB', stroke: '#f3f4f6' },
  { id: 'red', label: 'Red', stroke: '#ef4444' },
  { id: 'green', label: 'Green', stroke: '#22c55e' },
  { id: 'blue', label: 'Blue', stroke: '#3b82f6' },
];

export const CurveEditor: React.FC<CurveEditorProps> = ({
  curves,
  onChange,
  onScrubStart,
  onScrubEnd,
}) => {
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const size = 240;
  const activePoints = curves[channel];

  const splinePath = useMemo(() => {
    const lut = evaluateSplineCurve(activePoints);
    let d = '';
    for (let i = 0; i < 256; i += 2) {
      const x = (i / 255) * size;
      const y = size - (lut[i] / 255) * size;
      d += i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    const lastY = size - (lut[255] / 255) * size;
    d += ` L ${size} ${lastY.toFixed(1)}`;
    return d;
  }, [activePoints]);

  const toNormalized = (clientX: number, clientY: number): CurvePoint => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0.5, y: 0.5 };
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
    return { x: Number(x.toFixed(3)), y: Number(y.toFixed(3)) };
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const pt = toNormalized(e.clientX, e.clientY);
    // Check if clicking near an existing point
    const hitIdx = activePoints.findIndex(
      (p) => Math.hypot(p.x - pt.x, p.y - pt.y) < 0.055
    );

    onScrubStart();
    if (hitIdx >= 0) {
      setDragIdx(hitIdx);
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    // Add new interior point sorted by X
    const nextPts = [...activePoints, pt].sort((a, b) => a.x - b.x);
    const newIdx = nextPts.findIndex((p) => p === pt);
    setDragIdx(newIdx);
    onChange({ ...curves, [channel]: nextPts });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragIdx === null) return;
    const pt = toNormalized(e.clientX, e.clientY);
    const nextPts = activePoints.map((p) => ({ ...p }));
    const isFirst = dragIdx === 0;
    const isLast = dragIdx === nextPts.length - 1;

    if (isFirst) {
      nextPts[dragIdx] = { x: clamp(pt.x, 0, 0.35), y: pt.y };
    } else if (isLast) {
      nextPts[dragIdx] = { x: clamp(pt.x, 0.65, 1), y: pt.y };
    } else {
      const minX = nextPts[dragIdx - 1].x + 0.02;
      const maxX = nextPts[dragIdx + 1].x - 0.02;
      nextPts[dragIdx] = { x: clamp(pt.x, minX, maxX), y: pt.y };
    }

    onChange({ ...curves, [channel]: nextPts });
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragIdx !== null) {
      setDragIdx(null);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onScrubEnd();
    }
  };

  const removePoint = (idx: number) => {
    if (activePoints.length <= 2 || idx === 0 || idx === activePoints.length - 1) return;
    onScrubStart();
    const nextPts = activePoints.filter((_, i) => i !== idx);
    onChange({ ...curves, [channel]: nextPts });
    onScrubEnd();
  };

  const resetChannel = () => {
    onScrubStart();
    onChange({
      ...curves,
      [channel]: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
    });
    onScrubEnd();
  };

  const activeColor = CHANNEL_META.find((c) => c.id === channel)?.stroke ?? '#f3f4f6';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-md bg-[#0b0c0f] p-1 border border-white/[0.06]">
          {CHANNEL_META.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setChannel(c.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                channel === c.id
                  ? 'bg-[#232730] text-white'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={resetChannel}
          className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors whitespace-nowrap"
        >
          Reset
        </button>
      </div>

      <div className="rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size} ${size}`}
          onPointerDown={handleSvgPointerDown}
          onPointerMove={handleSvgPointerMove}
          onPointerUp={handleSvgPointerUp}
          className="aspect-square w-full cursor-crosshair touch-none select-none"
          aria-label="Interactive tone curve editor"
        >
          {/* Quarter grid */}
          {[0.25, 0.5, 0.75].map((t) => (
            <g key={t}>
              <line
                x1={t * size}
                y1={0}
                x2={t * size}
                y2={size}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
              <line
                x1={0}
                y1={t * size}
                x2={size}
                y2={t * size}
                stroke="rgba(255,255,255,0.07)"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Linear identity diagonal */}
          <line
            x1={0}
            y1={size}
            x2={size}
            y2={0}
            stroke="rgba(255,255,255,0.14)"
            strokeDasharray="3 3"
            strokeWidth="1"
          />

          {/* Smooth monotonic spline */}
          <path
            d={splinePath}
            fill="none"
            stroke={activeColor}
            strokeWidth="2"
            strokeLinecap="round"
          />

          {/* Control points */}
          {activePoints.map((pt, idx) => (
            <circle
              key={`${idx}-${pt.x}`}
              cx={pt.x * size}
              cy={(1 - pt.y) * size}
              r={dragIdx === idx ? 6 : 4.5}
              fill={dragIdx === idx ? '#e5a93c' : '#0e0f12'}
              stroke={activeColor}
              strokeWidth="2"
              onDoubleClick={(e) => {
                e.stopPropagation();
                removePoint(idx);
              }}
            />
          ))}
        </svg>
      </div>

      <p className="text-[11px] leading-relaxed text-[#6b7280]">
        Click anywhere on the curve to add a control point. Drag to shape contrast; double-click an interior point to remove it.
      </p>
    </div>
  );
};
