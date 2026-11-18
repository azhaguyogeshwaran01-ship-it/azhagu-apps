import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { PhotoPreset } from '../types/editor';
import { AdjustmentSlider } from './AdjustmentSlider';

interface PresetsPanelProps {
  presets: PhotoPreset[];
  customPresets: PhotoPreset[];
  activePresetId: string | null;
  presetIntensity: number;
  onSelectPreset: (preset: PhotoPreset) => void;
  onIntensityChange: (val: number) => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onResetToOriginal: () => void;
}

export const PresetsPanel: React.FC<PresetsPanelProps> = ({
  presets,
  customPresets,
  activePresetId,
  presetIntensity,
  onSelectPreset,
  onIntensityChange,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onResetToOriginal,
}) => {
  const [filterCat, setFilterCat] = useState<'all' | 'film' | 'editorial' | 'monochrome' | 'custom'>('all');
  const [newName, setNewName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const combined = [...customPresets, ...presets];
  const visible =
    filterCat === 'all'
      ? combined
      : combined.filter((p) => p.category === filterCat);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    onSaveCustomPreset(trimmed);
    setNewName('');
    setShowSaveForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onResetToOriginal}
          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            activePresetId === null
              ? 'border-[#e5a93c]/70 bg-[#232730] text-white'
              : 'border-white/[0.08] bg-[#101216] text-[#d1d5db] hover:border-white/20'
          }`}
        >
          Original (No Preset)
        </button>

        <button
          type="button"
          onClick={() => setShowSaveForm((s) => !s)}
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-[#101216] px-2.5 py-1.5 text-xs font-medium text-[#e5a93c] hover:bg-[#1c1f26] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>Save Look</span>
        </button>
      </div>

      {showSaveForm && (
        <form
          onSubmit={handleSave}
          className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-[#0b0c0f] p-2"
        >
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Preset name..."
            aria-label="Custom preset name"
            className="min-w-0 flex-1 rounded bg-[#15171c] px-2.5 py-1.5 text-xs text-white placeholder-[#6b7280] focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
          />
          <button
            type="submit"
            className="rounded bg-[#e5a93c] px-3 py-1.5 text-xs font-semibold text-[#0e0f12] hover:bg-[#f0b950] transition-colors"
          >
            Save
          </button>
        </form>
      )}

      {activePresetId && (
        <div className="border-b border-white/[0.08] pb-2">
          <AdjustmentSlider
            id="preset-intensity"
            label="Preset Intensity"
            min={0}
            max={100}
            defaultValue={100}
            unit="%"
            value={presetIntensity}
            onChange={onIntensityChange}
          />
        </div>
      )}

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {(
          [
            ['all', 'All'],
            ['film', 'Film'],
            ['editorial', 'Editorial'],
            ['monochrome', 'B&W'],
            ['custom', 'Saved'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setFilterCat(id)}
            className={`rounded px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
              filterCat === id
                ? 'bg-[#232730] text-white'
                : 'text-[#9ca3af] hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-6 text-center text-xs text-[#6b7280]">
          No saved presets yet. Dial in your look and click Save Look above.
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <div
                key={preset.id}
                className={`group flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                  isActive
                    ? 'border-[#e5a93c]/70 bg-[#1c1f26]'
                    : 'border-white/[0.06] bg-[#101216] hover:border-white/15'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10"
                    aria-hidden="true"
                  >
                    <span className="flex-1" style={{ backgroundColor: preset.swatchColors[0] }} />
                    <span className="flex-1" style={{ backgroundColor: preset.swatchColors[1] }} />
                    <span className="flex-1" style={{ backgroundColor: preset.swatchColors[2] }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-[#f3f4f6]">
                      {preset.name}
                    </div>
                    <div className="truncate text-[11px] text-[#9ca3af]">
                      {preset.description}
                    </div>
                  </div>
                </button>

                {preset.category === 'custom' && (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomPreset(preset.id)}
                    aria-label={`Delete preset ${preset.name}`}
                    className="rounded p-1 text-[#6b7280] hover:bg-white/5 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
