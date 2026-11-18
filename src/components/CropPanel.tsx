import React from 'react';
import { FlipHorizontal, FlipVertical, RotateCcw, RotateCw } from 'lucide-react';
import type { AspectPreset, CropSettings } from '../types/editor';
import {
  DEFAULT_CROP,
  fitCropToAspectRatio,
  getAspectRatioNumeric,
  getOrientedDimensions,
} from '../utils/colorMath';
import { AdjustmentSlider } from './AdjustmentSlider';

interface CropPanelProps {
  crop: CropSettings;
  origWidth: number;
  origHeight: number;
  onChange: (crop: CropSettings) => void;
  onCommit: () => void;
  onDone: () => void;
}

const ASPECT_OPTIONS: { id: AspectPreset; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '3:2', label: '3:2' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

export const CropPanel: React.FC<CropPanelProps> = ({
  crop,
  origWidth,
  origHeight,
  onChange,
  onCommit,
  onDone,
}) => {
  const oriented = getOrientedDimensions(origWidth, origHeight, crop.rotation90);

  const selectAspect = (preset: AspectPreset) => {
    const ratio = getAspectRatioNumeric(preset, oriented.width, oriented.height);
    const nextBox = fitCropToAspectRatio(
      crop,
      ratio,
      oriented.width,
      oriented.height
    );
    onChange({
      ...crop,
      ...nextBox,
      aspectPreset: preset,
    });
    onCommit();
  };

  const rotate90 = (delta: 1 | -1) => {
    const nextRot = (((crop.rotation90 + delta) % 4) + 4) % 4 as 0 | 1 | 2 | 3;
    const nextOriented = getOrientedDimensions(origWidth, origHeight, nextRot);
    const ratio = getAspectRatioNumeric(
      crop.aspectPreset,
      nextOriented.width,
      nextOriented.height
    );
    const nextBox = fitCropToAspectRatio(
      { x: 0, y: 0, width: 1, height: 1 },
      ratio,
      nextOriented.width,
      nextOriented.height
    );
    onChange({
      ...crop,
      ...nextBox,
      rotation90: nextRot,
    });
    onCommit();
  };

  const cropPixelW = Math.round(oriented.width * crop.width);
  const cropPixelH = Math.round(oriented.height * crop.height);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#d1d5db]">Aspect Ratio</span>
        <button
          type="button"
          onClick={() => {
            onChange({ ...DEFAULT_CROP });
            onCommit();
          }}
          className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
        >
          Reset Crop
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {ASPECT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => selectAspect(opt.id)}
            className={`rounded-md border px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              crop.aspectPreset === opt.id
                ? 'border-[#e5a93c]/70 bg-[#232730] text-white'
                : 'border-white/[0.06] bg-[#101216] text-[#9ca3af] hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="border-t border-white/[0.08] pt-3">
        <span className="mb-2 block text-xs font-semibold text-[#d1d5db]">
          Transform & Orientation
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          <button
            type="button"
            onClick={() => rotate90(-1)}
            aria-label="Rotate Left 90 degrees"
            className="flex flex-col items-center justify-center gap-1 rounded-md border border-white/[0.06] bg-[#101216] py-2 text-[11px] text-[#d1d5db] hover:border-white/20 hover:text-white transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>-90°</span>
          </button>
          <button
            type="button"
            onClick={() => rotate90(1)}
            aria-label="Rotate Right 90 degrees"
            className="flex flex-col items-center justify-center gap-1 rounded-md border border-white/[0.06] bg-[#101216] py-2 text-[11px] text-[#d1d5db] hover:border-white/20 hover:text-white transition-colors"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>+90°</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChange({ ...crop, flipH: !crop.flipH });
              onCommit();
            }}
            aria-label="Flip Horizontal"
            className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2 text-[11px] transition-colors ${
              crop.flipH
                ? 'border-[#e5a93c]/70 bg-[#232730] text-white'
                : 'border-white/[0.06] bg-[#101216] text-[#d1d5db] hover:border-white/20'
            }`}
          >
            <FlipHorizontal className="h-3.5 w-3.5" />
            <span>Flip H</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onChange({ ...crop, flipV: !crop.flipV });
              onCommit();
            }}
            aria-label="Flip Vertical"
            className={`flex flex-col items-center justify-center gap-1 rounded-md border py-2 text-[11px] transition-colors ${
              crop.flipV
                ? 'border-[#e5a93c]/70 bg-[#232730] text-white'
                : 'border-white/[0.06] bg-[#101216] text-[#d1d5db] hover:border-white/20'
            }`}
          >
            <FlipVertical className="h-3.5 w-3.5" />
            <span>Flip V</span>
          </button>
        </div>
      </div>

      <AdjustmentSlider
        id="crop-straighten"
        label="Straighten"
        min={-45}
        max={45}
        step={0.5}
        unit="°"
        value={crop.straighten}
        onChange={(v) => onChange({ ...crop, straighten: v })}
        onScrubEnd={onCommit}
      />

      <div className="flex items-center justify-between border-t border-white/[0.08] pt-3">
        <span className="font-mono text-xs text-[#9ca3af]">
          {cropPixelW} × {cropPixelH} px
        </span>
        <button
          type="button"
          onClick={onDone}
          className="rounded-md bg-[#e5a93c] px-4 py-1.5 text-xs font-semibold text-[#0e0f12] hover:bg-[#f0b950] transition-colors"
        >
          Apply Crop
        </button>
      </div>
    </div>
  );
};
