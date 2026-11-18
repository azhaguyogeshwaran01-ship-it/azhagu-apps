import React, { useState } from 'react';
import { Eye, EyeOff, Layers, Plus, Trash2, Type } from 'lucide-react';
import type {
  LayerBlendMode,
  OverlayLayer,
  TextOverlayLayer,
} from '../types/editor';
import { AdjustmentSlider } from './AdjustmentSlider';

interface LayersPanelProps {
  overlayLayers: OverlayLayer[];
  textLayers: TextOverlayLayer[];
  onAddOverlayLayer: (preset: 'sun-flare' | 'cool-wash' | 'amber-tint' | 'duotone') => void;
  onUpdateOverlayLayer: (id: string, patch: Partial<OverlayLayer>) => void;
  onDeleteOverlayLayer: (id: string) => void;
  onAddTextLayer: (text: string) => void;
  onUpdateTextLayer: (id: string, patch: Partial<TextOverlayLayer>) => void;
  onDeleteTextLayer: (id: string) => void;
}

const BLEND_MODES: { value: LayerBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'color-dodge', label: 'Color Dodge' },
];

export const LayersPanel: React.FC<LayersPanelProps> = ({
  overlayLayers,
  textLayers,
  onAddOverlayLayer,
  onUpdateOverlayLayer,
  onDeleteOverlayLayer,
  onAddTextLayer,
  onUpdateTextLayer,
  onDeleteTextLayer,
}) => {
  const [newText, setNewText] = useState('');

  const handleAddText = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newText.trim() || 'LUMINA STUDIO';
    onAddTextLayer(val);
    setNewText('');
  };

  return (
    <div className="space-y-5">
      {/* Adjustment / Blend Layers */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">
            Blend & Fill Layers
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => onAddOverlayLayer('sun-flare')}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#101216] px-2.5 py-1.5 text-xs text-[#e5e7eb] hover:border-[#e5a93c]/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#e5a93c]" />
            <span>Sun Flare</span>
          </button>
          <button
            type="button"
            onClick={() => onAddOverlayLayer('cool-wash')}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#101216] px-2.5 py-1.5 text-xs text-[#e5e7eb] hover:border-[#e5a93c]/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#60a5fa]" />
            <span>Cool Wash</span>
          </button>
          <button
            type="button"
            onClick={() => onAddOverlayLayer('amber-tint')}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#101216] px-2.5 py-1.5 text-xs text-[#e5e7eb] hover:border-[#e5a93c]/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#f59e0b]" />
            <span>Warm Fill</span>
          </button>
          <button
            type="button"
            onClick={() => onAddOverlayLayer('duotone')}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#101216] px-2.5 py-1.5 text-xs text-[#e5e7eb] hover:border-[#e5a93c]/60 transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-[#a78bfa]" />
            <span>Gradient Split</span>
          </button>
        </div>

        {overlayLayers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] px-3 py-3 text-center text-[11px] text-[#6b7280]">
            Add a light flare or gradient blend layer above to stack Photoshop-style blend modes.
          </div>
        ) : (
          <div className="space-y-2.5">
            {overlayLayers.map((layer) => (
              <div
                key={layer.id}
                className="space-y-2 rounded-lg border border-white/[0.08] bg-[#101216] p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateOverlayLayer(layer.id, { visible: !layer.visible })
                      }
                      aria-label={`Toggle ${layer.name} visibility`}
                      className="text-[#9ca3af] hover:text-white"
                    >
                      {layer.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5 text-[#6b7280]" />
                      )}
                    </button>
                    <Layers className="h-3.5 w-3.5 text-[#e5a93c] shrink-0" />
                    <span className="truncate text-xs font-medium text-white">
                      {layer.name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDeleteOverlayLayer(layer.id)}
                    aria-label={`Remove ${layer.name}`}
                    className="text-[#6b7280] hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    htmlFor={`blend-${layer.id}`}
                    className="text-[11px] text-[#9ca3af] shrink-0"
                  >
                    Blend
                  </label>
                  <select
                    id={`blend-${layer.id}`}
                    value={layer.blendMode}
                    onChange={(e) =>
                      onUpdateOverlayLayer(layer.id, {
                        blendMode: e.target.value as LayerBlendMode,
                      })
                    }
                    className="flex-1 rounded border border-white/[0.08] bg-[#0b0c0f] px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
                  >
                    {BLEND_MODES.map((bm) => (
                      <option key={bm.value} value={bm.value}>
                        {bm.label}
                      </option>
                    ))}
                  </select>
                </div>

                <AdjustmentSlider
                  id={`opacity-${layer.id}`}
                  label="Opacity"
                  min={0}
                  max={100}
                  defaultValue={50}
                  unit="%"
                  value={layer.opacity}
                  onChange={(v) => onUpdateOverlayLayer(layer.id, { opacity: v })}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Text & Watermark Layers */}
      <section className="space-y-2.5 border-t border-white/[0.08] pt-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-[#d1d5db]">
            Typography & Watermark
          </h3>
        </div>

        <form onSubmit={handleAddText} className="flex items-center gap-2">
          <input
            type="text"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Add text or watermark..."
            aria-label="Text layer content"
            className="min-w-0 flex-1 rounded-md border border-white/[0.08] bg-[#0b0c0f] px-2.5 py-1.5 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-md bg-[#e5a93c] px-2.5 py-1.5 text-xs font-semibold text-[#0e0f12] hover:bg-[#f0b950] transition-colors shrink-0"
          >
            <Type className="h-3.5 w-3.5" />
            <span>Add</span>
          </button>
        </form>

        {textLayers.map((txt) => (
          <div
            key={txt.id}
            className="space-y-2 rounded-lg border border-white/[0.08] bg-[#101216] p-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => onUpdateTextLayer(txt.id, { visible: !txt.visible })}
                aria-label={`Toggle text ${txt.text} visibility`}
                className="text-[#9ca3af] hover:text-white"
              >
                {txt.visible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5 text-[#6b7280]" />
                )}
              </button>
              <input
                type="text"
                value={txt.text}
                aria-label="Edit text layer"
                onChange={(e) => onUpdateTextLayer(txt.id, { text: e.target.value })}
                className="min-w-0 flex-1 rounded border border-white/[0.06] bg-[#0b0c0f] px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
              />
              <button
                type="button"
                onClick={() => onDeleteTextLayer(txt.id)}
                aria-label={`Delete text ${txt.text}`}
                className="text-[#6b7280] hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <select
                aria-label="Text font family"
                value={txt.fontFamily}
                onChange={(e) =>
                  onUpdateTextLayer(txt.id, {
                    fontFamily: e.target.value as TextOverlayLayer['fontFamily'],
                  })
                }
                className="flex-1 rounded border border-white/[0.08] bg-[#0b0c0f] px-2 py-1 text-xs text-white"
              >
                <option value="sans">Sans-Serif</option>
                <option value="serif">Editorial Serif</option>
                <option value="mono">Monospace</option>
              </select>
              <input
                type="color"
                aria-label="Text color"
                value={txt.color}
                onChange={(e) => onUpdateTextLayer(txt.id, { color: e.target.value })}
                className="h-7 w-9 cursor-pointer rounded border border-white/10 bg-transparent"
              />
            </div>

            <AdjustmentSlider
              id={`txt-size-${txt.id}`}
              label="Size"
              min={2}
              max={14}
              step={0.5}
              defaultValue={5}
              unit="%"
              value={txt.fontSize}
              onChange={(v) => onUpdateTextLayer(txt.id, { fontSize: v })}
            />
            <AdjustmentSlider
              id={`txt-op-${txt.id}`}
              label="Opacity"
              min={10}
              max={100}
              defaultValue={90}
              unit="%"
              value={txt.opacity}
              onChange={(v) => onUpdateTextLayer(txt.id, { opacity: v })}
            />
            <p className="text-[10px] text-[#6b7280]">
              Drag text directly on the canvas to reposition.
            </p>
          </div>
        ))}
      </section>
    </div>
  );
};
