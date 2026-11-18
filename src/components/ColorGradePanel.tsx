import React, { useState } from 'react';
import type { ColorGradeSettings } from '../types/editor';
import { DEFAULT_COLOR_GRADE } from '../utils/colorMath';
import { AdjustmentSlider } from './AdjustmentSlider';

interface ColorGradePanelProps {
  colorGrade: ColorGradeSettings;
  onChange: (next: ColorGradeSettings) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

type WheelZone = 'shadows' | 'midtones' | 'highlights';

const ZONES: { id: WheelZone; label: string }[] = [
  { id: 'shadows', label: 'Shadows' },
  { id: 'midtones', label: 'Midtones' },
  { id: 'highlights', label: 'Highlights' },
];

export const ColorGradePanel: React.FC<ColorGradePanelProps> = ({
  colorGrade,
  onChange,
  onScrubStart,
  onScrubEnd,
}) => {
  const [zone, setZone] = useState<WheelZone>('shadows');

  const hue =
    zone === 'shadows'
      ? colorGrade.shadowsHue
      : zone === 'midtones'
        ? colorGrade.midtonesHue
        : colorGrade.highlightsHue;

  const sat =
    zone === 'shadows'
      ? colorGrade.shadowsSat
      : zone === 'midtones'
        ? colorGrade.midtonesSat
        : colorGrade.highlightsSat;

  const setZoneValue = (nextHue: number, nextSat: number) => {
    if (zone === 'shadows') {
      onChange({ ...colorGrade, shadowsHue: nextHue, shadowsSat: nextSat });
    } else if (zone === 'midtones') {
      onChange({ ...colorGrade, midtonesHue: nextHue, midtonesSat: nextSat });
    } else {
      onChange({ ...colorGrade, highlightsHue: nextHue, highlightsSat: nextSat });
    }
  };

  const handleWheelInteraction = (
    e: React.PointerEvent<HTMLDivElement>,
    commit = false
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radius = rect.width / 2;
    const dist = Math.min(1, Math.hypot(dx, dy) / radius);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;

    setZoneValue(Math.round(deg), Math.round(dist * 100));
    if (commit) onScrubEnd();
  };

  const rad = (hue * Math.PI) / 180;
  const puckR = (sat / 100) * 44;
  const puckX = 50 + Math.cos(rad) * puckR;
  const puckY = 50 + Math.sin(rad) * puckR;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-md bg-[#0b0c0f] p-1 border border-white/[0.06]">
          {ZONES.map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setZone(z.id)}
              className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                zone === z.id
                  ? 'bg-[#232730] text-white'
                  : 'text-[#9ca3af] hover:text-white'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            onScrubStart();
            onChange({ ...DEFAULT_COLOR_GRADE });
            onScrubEnd();
          }}
          className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Interactive Hue/Saturation Color Wheel */}
      <div className="flex justify-center py-1">
        <div
          role="slider"
          aria-label={`${zone} color wheel`}
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={hue}
          tabIndex={0}
          onPointerDown={(e) => {
            onScrubStart();
            e.currentTarget.setPointerCapture(e.pointerId);
            handleWheelInteraction(e);
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            handleWheelInteraction(e);
          }}
          onPointerUp={(e) => {
            handleWheelInteraction(e, true);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onDoubleClick={() => {
            onScrubStart();
            setZoneValue(hue, 0);
            onScrubEnd();
          }}
          className="relative h-36 w-36 cursor-crosshair touch-none rounded-full border border-white/15 shadow-inner"
          style={{
            background:
              'radial-gradient(circle, rgba(24,26,32,0.92) 0%, rgba(24,26,32,0.15) 70%, rgba(24,26,32,0) 100%), conic-gradient(from 90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55, #ff3b30)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 rounded-full border border-white/10" />
          <div
            className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md"
            style={{
              left: `${puckX}%`,
              top: `${puckY}%`,
              backgroundColor: `hsl(${hue}, ${Math.max(25, sat)}%, 55%)`,
            }}
          />
        </div>
      </div>

      <div>
        <AdjustmentSlider
          id={`grade-hue-${zone}`}
          label="Hue Angle"
          min={0}
          max={360}
          defaultValue={hue}
          unit="°"
          value={hue}
          onChange={(v) => setZoneValue(v, sat)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id={`grade-sat-${zone}`}
          label="Intensity"
          min={0}
          max={100}
          value={sat}
          onChange={(v) => setZoneValue(hue, v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <div className="mt-2 border-t border-white/[0.08] pt-2">
          <AdjustmentSlider
            id="grade-balance"
            label="Shadow / Highlight Balance"
            min={-100}
            max={100}
            value={colorGrade.balance}
            onChange={(v) => onChange({ ...colorGrade, balance: v })}
            onScrubStart={onScrubStart}
            onScrubEnd={onScrubEnd}
          />
        </div>
      </div>
    </div>
  );
};
