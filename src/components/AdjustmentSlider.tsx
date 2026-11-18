import React from 'react';

interface AdjustmentSliderProps {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  defaultValue?: number;
  unit?: string;
  onChange: (value: number) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
}

export const AdjustmentSlider: React.FC<AdjustmentSliderProps> = ({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  unit = '',
  onChange,
  onScrubStart,
  onScrubEnd,
}) => {
  const isModified = Math.abs(value - defaultValue) > 0.001;
  const formatted =
    step < 1
      ? `${value > 0 ? '+' : ''}${value.toFixed(2)}${unit}`
      : `${value > 0 && min < 0 ? '+' : ''}${Math.round(value)}${unit}`;

  const range = max - min;
  const pct = range > 0 ? ((value - min) / range) * 100 : 0;
  const zeroPct = min < 0 && max > 0 ? ((0 - min) / range) * 100 : 0;
  const fillLeft = min < 0 ? Math.min(pct, zeroPct) : 0;
  const fillWidth = min < 0 ? Math.abs(pct - zeroPct) : pct;

  return (
    <div className="group py-1.5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          onDoubleClick={() => {
            onScrubStart?.();
            onChange(defaultValue);
            onScrubEnd?.();
          }}
          title="Double-click label to reset"
          className={`cursor-pointer select-none text-xs font-medium transition-colors ${
            isModified ? 'text-[#f3f4f6]' : 'text-[#9ca3af] group-hover:text-[#d1d5db]'
          }`}
        >
          {label}
        </label>
        <button
          type="button"
          onClick={() => {
            if (!isModified) return;
            onScrubStart?.();
            onChange(defaultValue);
            onScrubEnd?.();
          }}
          aria-label={`Reset ${label} to default`}
          className={`font-mono text-[11px] transition-colors ${
            isModified
              ? 'text-[#e5a93c] hover:text-[#f5c463]'
              : 'text-[#6b7280] cursor-default'
          }`}
        >
          {formatted}
        </button>
      </div>

      <div className="relative flex h-5 items-center">
        {/* Active range fill indicator */}
        <div className="pointer-events-none absolute left-0 right-0 h-[3px] rounded-full bg-white/[0.08]">
          {min < 0 && max > 0 && (
            <div
              className="absolute top-1/2 h-2 w-[1px] -translate-y-1/2 bg-white/25"
              style={{ left: `${zeroPct}%` }}
            />
          )}
          <div
            className="absolute top-0 h-full rounded-full bg-[#e5a93c]/85"
            style={{
              left: `${fillLeft}%`,
              width: `${fillWidth}%`,
            }}
          />
        </div>

        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onPointerDown={() => onScrubStart?.()}
          onPointerUp={() => onScrubEnd?.()}
          onBlur={() => onScrubEnd?.()}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onDoubleClick={() => {
            onScrubStart?.();
            onChange(defaultValue);
            onScrubEnd?.();
          }}
          className="studio-slider relative z-10"
        />
      </div>
    </div>
  );
};
