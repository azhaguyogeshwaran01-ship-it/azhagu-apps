import React from 'react';
import { Sparkles, Sun, Moon, Layers, Wind } from 'lucide-react';
import type { AiEnhanceMode, ImageTelemetry } from '../types/editor';
import { AdjustmentSlider } from './AdjustmentSlider';

interface AiEnhancePanelProps {
  activeAiMode: AiEnhanceMode | null;
  aiStrength: number;
  telemetry: ImageTelemetry | null;
  onSelectMode: (mode: AiEnhanceMode) => void;
  onStrengthChange: (strength: number) => void;
  onClearAi: () => void;
}

const AI_MODES: {
  id: AiEnhanceMode;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'auto-balance',
    title: 'Auto Smart Balance',
    desc: 'Balances exposure, dynamic range & white balance cast offline',
    icon: Sparkles,
  },
  {
    id: 'portrait-studio',
    title: 'Portrait Studio Relight',
    desc: 'Lifts midtones, softens skin texture & rolls off harsh highlights',
    icon: Sun,
  },
  {
    id: 'low-light',
    title: 'Low-Light Recover',
    desc: 'Rescues dark shadow detail while suppressing chroma noise',
    icon: Moon,
  },
  {
    id: 'hdr-crisp',
    title: 'HDR Crisp Detail',
    desc: 'Expands shadow-highlight latitude with local micro-contrast',
    icon: Layers,
  },
  {
    id: 'dehaze',
    title: 'Atmospheric Dehaze',
    desc: 'Removes fog/haze floor and restores deep contrast & color',
    icon: Wind,
  },
];

export const AiEnhancePanel: React.FC<AiEnhancePanelProps> = ({
  activeAiMode,
  aiStrength,
  telemetry,
  onSelectMode,
  onStrengthChange,
  onClearAi,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-semibold text-[#f3f4f6]">
            On-Device AI Enhance
          </h3>
          <p className="text-[11px] text-[#9ca3af]">
            Runs 100% offline in your browser
          </p>
        </div>
        {activeAiMode && (
          <button
            type="button"
            onClick={onClearAi}
            className="text-xs font-medium text-[#9ca3af] hover:text-[#e5a93c] transition-colors"
          >
            Reset AI
          </button>
        )}
      </div>

      {telemetry && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg border border-white/[0.06] bg-[#0b0c0f] px-3 py-2.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-[#6b7280]">Luminance</span>
            <span className="font-mono text-[#d1d5db]">
              {Math.round(telemetry.meanLuma * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6b7280]">Latitude</span>
            <span className="font-mono text-[#d1d5db]">
              {Math.round(telemetry.dynamicRange * 100)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6b7280]">Cast</span>
            <span className="font-mono text-[#d1d5db]">
              {Math.abs(telemetry.warmBias) < 0.08
                ? 'Neutral'
                : telemetry.warmBias > 0
                  ? 'Warm'
                  : 'Cool'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#6b7280]">Skin Region</span>
            <span className="font-mono text-[#d1d5db]">
              {Math.round(telemetry.skinRatio * 100)}%
            </span>
          </div>
        </div>
      )}

      {activeAiMode && (
        <div className="border-b border-white/[0.08] pb-2">
          <AdjustmentSlider
            id="ai-strength"
            label="AI Enhancement Strength"
            min={0}
            max={100}
            defaultValue={80}
            unit="%"
            value={aiStrength}
            onChange={onStrengthChange}
          />
        </div>
      )}

      <div className="space-y-2">
        {AI_MODES.map((m) => {
          const Icon = m.icon;
          const active = activeAiMode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectMode(m.id)}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                active
                  ? 'border-[#e5a93c]/75 bg-[#1c1f26]'
                  : 'border-white/[0.06] bg-[#101216] hover:border-white/20'
              }`}
            >
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  active ? 'text-[#e5a93c]' : 'text-[#9ca3af]'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-white">{m.title}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-[#9ca3af]">
                  {m.desc}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
