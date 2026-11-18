import React from 'react';
import { Bandage, Droplet, Paintbrush, Sparkles, Sun, Undo2 } from 'lucide-react';
import type { RetouchBrushMode } from '../types/editor';
import { AdjustmentSlider } from './AdjustmentSlider';

interface RetouchPanelProps {
  brushMode: RetouchBrushMode;
  brushSize: number; // 1..15 (% of min dim)
  brushFeather: number; // 0..100
  brushStrength: number; // 10..100
  strokeCount: number;
  onBrushModeChange: (mode: RetouchBrushMode) => void;
  onBrushSizeChange: (size: number) => void;
  onBrushFeatherChange: (feather: number) => void;
  onBrushStrengthChange: (strength: number) => void;
  onUndoLastStroke: () => void;
  onClearStrokes: () => void;
}

const BRUSHES: {
  id: RetouchBrushMode;
  label: string;
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'heal',
    label: 'Spot Heal',
    hint: 'Click or brush blemishes & dust spots to blend surrounding texture',
    icon: Bandage,
  },
  {
    id: 'dodge',
    label: 'Dodge',
    hint: 'Paint soft light onto faces, eyes, or architectural highlights',
    icon: Sun,
  },
  {
    id: 'burn',
    label: 'Burn',
    hint: 'Deepen shadows and add selective darkroom depth',
    icon: Paintbrush,
  },
  {
    id: 'blur',
    label: 'Bokeh Blur',
    hint: 'Soften backgrounds selectively for shallow depth of field',
    icon: Droplet,
  },
  {
    id: 'saturate',
    label: 'Color Punch',
    hint: 'Boost local vibrancy wherever you paint',
    icon: Sparkles,
  },
];

export const RetouchPanel: React.FC<RetouchPanelProps> = ({
  brushMode,
  brushSize,
  brushFeather,
  brushStrength,
  strokeCount,
  onBrushModeChange,
  onBrushSizeChange,
  onBrushFeatherChange,
  onBrushStrengthChange,
  onUndoLastStroke,
  onClearStrokes,
}) => {
  const active = BRUSHES.find((b) => b.id === brushMode)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#d1d5db]">
          Retouch Brushes
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={strokeCount === 0}
            onClick={onUndoLastStroke}
            aria-label="Undo last brush stroke"
            className="inline-flex items-center gap-1 text-xs font-medium text-[#9ca3af] hover:text-white disabled:opacity-40 transition-colors"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Step Back</span>
          </button>
          {strokeCount > 0 && (
            <button
              type="button"
              onClick={onClearStrokes}
              className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
            >
              Clear ({strokeCount})
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {BRUSHES.map((b) => {
          const Icon = b.icon;
          const isSelected = b.id === brushMode;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onBrushModeChange(b.id)}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition-colors ${
                isSelected
                  ? 'border-[#e5a93c]/75 bg-[#232730] text-white'
                  : 'border-white/[0.06] bg-[#101216] text-[#9ca3af] hover:text-white'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-[#e5a93c]' : ''}`} />
              <span className="truncate">{b.label}</span>
            </button>
          );
        })}
      </div>

      <p className="rounded-md border border-white/[0.06] bg-[#0b0c0f] px-3 py-2 text-[11px] leading-relaxed text-[#9ca3af]">
        {active.hint}
      </p>

      <div className="border-t border-white/[0.08] pt-3">
        <AdjustmentSlider
          id="brush-size"
          label="Brush Size"
          min={2}
          max={24}
          defaultValue={7}
          unit="%"
          value={brushSize}
          onChange={onBrushSizeChange}
        />
        <AdjustmentSlider
          id="brush-feather"
          label="Softness / Feather"
          min={0}
          max={100}
          defaultValue={75}
          unit="%"
          value={brushFeather}
          onChange={onBrushFeatherChange}
        />
        <AdjustmentSlider
          id="brush-strength"
          label="Flow / Strength"
          min={10}
          max={100}
          defaultValue={65}
          unit="%"
          value={brushStrength}
          onChange={onBrushStrengthChange}
        />
      </div>
    </div>
  );
};
