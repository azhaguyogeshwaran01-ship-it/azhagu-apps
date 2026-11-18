import React from 'react';
import type { BasicAdjustments } from '../types/editor';
import { DEFAULT_ADJUSTMENTS } from '../utils/colorMath';
import { AdjustmentSlider } from './AdjustmentSlider';

interface AdjustPanelProps {
  adjustments: BasicAdjustments;
  onChange: (key: keyof BasicAdjustments, val: number) => void;
  onResetGroup: (keys: (keyof BasicAdjustments)[]) => void;
  onScrubStart: () => void;
  onScrubEnd: () => void;
}

export const LightColorPanel: React.FC<AdjustPanelProps> = ({
  adjustments,
  onChange,
  onResetGroup,
  onScrubStart,
  onScrubEnd,
}) => {
  const lightKeys: (keyof BasicAdjustments)[] = [
    'exposure',
    'contrast',
    'highlights',
    'shadows',
    'whites',
    'blacks',
  ];
  const colorKeys: (keyof BasicAdjustments)[] = [
    'temperature',
    'tint',
    'vibrance',
    'saturation',
  ];

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">Light & Tone</h3>
          <button
            type="button"
            onClick={() => onResetGroup(lightKeys)}
            className="text-[11px] font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
          >
            Reset
          </button>
        </div>
        <AdjustmentSlider
          id="adj-exposure"
          label="Exposure"
          min={-2}
          max={2}
          step={0.05}
          defaultValue={DEFAULT_ADJUSTMENTS.exposure}
          unit=" EV"
          value={adjustments.exposure}
          onChange={(v) => onChange('exposure', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-contrast"
          label="Contrast"
          min={-100}
          max={100}
          value={adjustments.contrast}
          onChange={(v) => onChange('contrast', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-highlights"
          label="Highlights"
          min={-100}
          max={100}
          value={adjustments.highlights}
          onChange={(v) => onChange('highlights', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-shadows"
          label="Shadows"
          min={-100}
          max={100}
          value={adjustments.shadows}
          onChange={(v) => onChange('shadows', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-whites"
          label="Whites"
          min={-100}
          max={100}
          value={adjustments.whites}
          onChange={(v) => onChange('whites', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-blacks"
          label="Blacks"
          min={-100}
          max={100}
          value={adjustments.blacks}
          onChange={(v) => onChange('blacks', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </section>

      <section className="border-t border-white/[0.08] pt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">White Balance & Color</h3>
          <button
            type="button"
            onClick={() => onResetGroup(colorKeys)}
            className="text-[11px] font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
          >
            Reset
          </button>
        </div>
        <AdjustmentSlider
          id="adj-temperature"
          label="Temperature"
          min={-100}
          max={100}
          value={adjustments.temperature}
          onChange={(v) => onChange('temperature', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-tint"
          label="Tint"
          min={-100}
          max={100}
          value={adjustments.tint}
          onChange={(v) => onChange('tint', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-vibrance"
          label="Vibrance"
          min={-100}
          max={100}
          value={adjustments.vibrance}
          onChange={(v) => onChange('vibrance', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-saturation"
          label="Saturation"
          min={-100}
          max={100}
          value={adjustments.saturation}
          onChange={(v) => onChange('saturation', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </section>
    </div>
  );
};

export const DetailEffectsPanel: React.FC<AdjustPanelProps> = ({
  adjustments,
  onChange,
  onResetGroup,
  onScrubStart,
  onScrubEnd,
}) => {
  const detailKeys: (keyof BasicAdjustments)[] = [
    'clarity',
    'sharpen',
    'noiseReduction',
  ];
  const fxKeys: (keyof BasicAdjustments)[] = [
    'fade',
    'vignetteAmount',
    'vignetteMidpoint',
    'grainAmount',
    'grainSize',
    'chromaticAberration',
  ];

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">Texture & Detail</h3>
          <button
            type="button"
            onClick={() => onResetGroup(detailKeys)}
            className="text-[11px] font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
          >
            Reset
          </button>
        </div>
        <AdjustmentSlider
          id="adj-clarity"
          label="Clarity"
          min={-100}
          max={100}
          value={adjustments.clarity}
          onChange={(v) => onChange('clarity', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-sharpen"
          label="Sharpening"
          min={0}
          max={100}
          value={adjustments.sharpen}
          onChange={(v) => onChange('sharpen', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-denoise"
          label="Noise Reduction"
          min={0}
          max={100}
          value={adjustments.noiseReduction}
          onChange={(v) => onChange('noiseReduction', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </section>

      <section className="border-t border-white/[0.08] pt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">Optics & Film FX</h3>
          <button
            type="button"
            onClick={() => onResetGroup(fxKeys)}
            className="text-[11px] font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
          >
            Reset
          </button>
        </div>
        <AdjustmentSlider
          id="adj-fade"
          label="Matte Fade"
          min={0}
          max={100}
          value={adjustments.fade}
          onChange={(v) => onChange('fade', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-vignette"
          label="Vignette"
          min={-100}
          max={100}
          value={adjustments.vignetteAmount}
          onChange={(v) => onChange('vignetteAmount', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-vignette-mid"
          label="Vignette Midpoint"
          min={0}
          max={100}
          defaultValue={DEFAULT_ADJUSTMENTS.vignetteMidpoint}
          value={adjustments.vignetteMidpoint}
          onChange={(v) => onChange('vignetteMidpoint', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-grain"
          label="Film Grain"
          min={0}
          max={100}
          value={adjustments.grainAmount}
          onChange={(v) => onChange('grainAmount', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-grain-size"
          label="Grain Size"
          min={10}
          max={100}
          defaultValue={DEFAULT_ADJUSTMENTS.grainSize}
          value={adjustments.grainSize}
          onChange={(v) => onChange('grainSize', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
        <AdjustmentSlider
          id="adj-ca"
          label="Chromatic Fringe"
          min={0}
          max={100}
          value={adjustments.chromaticAberration}
          onChange={(v) => onChange('chromaticAberration', v)}
          onScrubStart={onScrubStart}
          onScrubEnd={onScrubEnd}
        />
      </section>
    </div>
  );
};
