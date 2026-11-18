import React, { useState } from 'react';
import type { HslColorKey, HslMixer } from '../types/editor';
import { createDefaultHsl } from '../utils/colorMath';
import { AdjustmentSlider } from './AdjustmentSlider';

interface HslPanelProps {
  hsl: HslMixer;
  onChange: (hsl: HslMixer) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

const BANDS: { key: HslColorKey; label: string; color: string }[] = [
  { key: 'red', label: 'Red', color: '#ef4444' },
  { key: 'orange', label: 'Orange', color: '#f97316' },
  { key: 'yellow', label: 'Yellow', color: '#eab308' },
  { key: 'green', label: 'Green', color: '#22c55e' },
  { key: 'aqua', label: 'Aqua', color: '#06b6d4' },
  { key: 'blue', label: 'Blue', color: '#3b82f6' },
  { key: 'purple', label: 'Purple', color: '#a855f7' },
  { key: 'magenta', label: 'Magenta', color: '#ec4899' },
];

export const HslPanel: React.FC<HslPanelProps> = ({
  hsl,
  onChange,
  onScrubStart,
  onScrubEnd,
}) => {
  const [selected, setSelected] = useState<HslColorKey>('red');
  const activeBand = hsl[selected];
  const activeMeta = BANDS.find((b) => b.key === selected)!;

  const updateChannel = (field: 'hue' | 'saturation' | 'luminance', val: number) => {
    onChange({
      ...hsl,
      [selected]: {
        ...activeBand,
        [field]: val,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#d1d5db]">Color Band</span>
        <button
          type="button"
          onClick={() => {
            onScrubStart();
            onChange(createDefaultHsl());
            onScrubEnd();
          }}
          className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
        >
          Reset All
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {BANDS.map((band) => {
          const bandState = hsl[band.key];
          const modified =
            bandState.hue !== 0 ||
            bandState.saturation !== 0 ||
            bandState.luminance !== 0;
          const isSelected = selected === band.key;

          return (
            <button
              key={band.key}
              type="button"
              onClick={() => setSelected(band.key)}
              aria-label={`Select ${band.label} HSL channel`}
              className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-[#e5a93c]/70 bg-[#232730] text-white'
                  : 'border-white/[0.06] bg-[#101216] text-[#9ca3af] hover:text-white'
              }`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: band.color }}
              />
              <span className="truncate">{band.label}</span>
              {modified && (
                <span className="ml-auto h-1 w-1 rounded-full bg-[#e5a93c]" />
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t border-white/[0.08] pt-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: activeMeta.color }}
            />
            <span className="text-xs font-semibold text-white">
              {activeMeta.label} Channel
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              onScrubStart();
              onChange({
                ...hsl,
                [selected]: { hue: 0, saturation: 0, luminance: 0 },
              });
              onScrubEnd();
            }}
            className="text-[11px] font-medium text-[#9ca3af] hover:text-[#e5a93c]"
          >
            Reset {activeMeta.label}
          </button>
        </div>

        <AdjustmentSlider
          id={`hsl-hue-${selected}`}
          label="Hue"
          min={-100}
          max={100}
          value={activeBand.hue}
          onChange={(v) => updateChannel('hue', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id={`hsl-sat-${selected}`}
          label="Saturation"
          min={-100}
          max={100}
          value={activeBand.saturation}
          onChange={(v) => updateChannel('saturation', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id={`hsl-lum-${selected}`}
          label="Luminance"
          min={-100}
          max={100}
          value={activeBand.luminance}
          onChange={(v) => updateChannel('luminance', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </div>
    </div>
  );
};
