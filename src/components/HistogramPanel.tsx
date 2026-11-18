import React, { useMemo } from 'react';
import type { HistogramData } from '../types/editor';

interface HistogramPanelProps {
  data: HistogramData;
  dimensionsLabel: string;
}

function buildAreaPath(bins: number[], width: number, height: number): string {
  if (bins.length === 0) return '';
  const stepX = width / (bins.length - 1);
  let d = `M 0 ${height}`;
  for (let i = 0; i < bins.length; i++) {
    const x = i * stepX;
    const y = height - Math.max(0, Math.min(1, bins[i])) * (height - 4);
    d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L ${width} ${height} Z`;
  return d;
}

export const HistogramPanel: React.FC<HistogramPanelProps> = ({
  data,
  dimensionsLabel,
}) => {
  const width = 280;
  const height = 74;

  const paths = useMemo(
    () => ({
      luma: buildAreaPath(data.luma, width, height),
      r: buildAreaPath(data.r, width, height),
      g: buildAreaPath(data.g, width, height),
      b: buildAreaPath(data.b, width, height),
    }),
    [data]
  );

  return (
    <div className="border-b border-white/[0.08] px-4 py-3">
      <div className="mb-2 flex items-center justify-between text-[11px] text-[#9ca3af]">
        <span className="font-medium text-[#d1d5db]">Histogram</span>
        <span className="font-mono text-[11px] text-[#6b7280]">{dimensionsLabel}</span>
      </div>

      <div className="relative overflow-hidden rounded-md border border-white/[0.06] bg-[#0b0c0f]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-[74px] w-full"
          aria-label="RGB and luminance histogram"
        >
          {/* Quarter tone reference lines */}
          <line x1={width * 0.25} y1={0} x2={width * 0.25} y2={height} stroke="rgba(255,255,255,0.05)" />
          <line x1={width * 0.5} y1={0} x2={width * 0.5} y2={height} stroke="rgba(255,255,255,0.06)" />
          <line x1={width * 0.75} y1={0} x2={width * 0.75} y2={height} stroke="rgba(255,255,255,0.05)" />

          <path d={paths.luma} fill="rgba(255, 255, 255, 0.14)" />
          <path d={paths.r} fill="rgba(239, 68, 68, 0.34)" stroke="rgba(239, 68, 68, 0.6)" strokeWidth="0.75" />
          <path d={paths.g} fill="rgba(34, 197, 94, 0.30)" stroke="rgba(34, 197, 94, 0.55)" strokeWidth="0.75" />
          <path d={paths.b} fill="rgba(59, 130, 246, 0.34)" stroke="rgba(59, 130, 246, 0.6)" strokeWidth="0.75" />
        </svg>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#6b7280]">
        <span className="font-mono">
          Shadows {data.shadowClipPct > 1.5 ? `${data.shadowClipPct}%` : 'Clean'}
        </span>
        <span className="font-mono">
          Highlights {data.highlightClipPct > 1.5 ? `${data.highlightClipPct}%` : 'Clean'}
        </span>
      </div>
    </div>
  );
};
