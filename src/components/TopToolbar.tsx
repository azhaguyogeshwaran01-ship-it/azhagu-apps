import React from 'react';
import {
  Columns2,
  Download,
  Eye,
  FolderOpen,
  RotateCcw,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { PerformanceMode } from '../types/editor';
import { PWAInstallButton } from './PWAControls';

interface TopToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  hasEdits: boolean;
  zoom: number;
  splitCompare: boolean;
  isPeekingOriginal: boolean;
  performanceMode: PerformanceMode;
  effectiveTier: 'standard' | 'eco';
  onOpenFile: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomChange: (nextZoom: number) => void;
  onToggleSplitCompare: () => void;
  onPeekOriginalChange: (peeking: boolean) => void;
  onPerformanceModeChange: (mode: PerformanceMode) => void;
  onResetAll: () => void;
  onOpenExport: () => void;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  canUndo,
  canRedo,
  hasEdits,
  zoom,
  splitCompare,
  isPeekingOriginal,
  performanceMode,
  effectiveTier,
  onOpenFile,
  onUndo,
  onRedo,
  onZoomChange,
  onToggleSplitCompare,
  onPeekOriginalChange,
  onPerformanceModeChange,
  onResetAll,
  onOpenExport,
}) => {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 sm:gap-4 border-b border-white/[0.08] bg-[#15171c] px-3 sm:px-4">
      {/* Left: Brand + Open Photo */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <span className="text-sm font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Lumina <span className="hidden sm:inline">Darkroom</span>
        </span>
        <button
          type="button"
          onClick={onOpenFile}
          aria-label="Open Photo"
          className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#1c1f26] px-2 sm:px-2.5 py-1.5 text-xs font-medium text-[#e5e7eb] hover:border-white/20 hover:text-white transition-colors whitespace-nowrap shrink-0"
        >
          <FolderOpen className="h-3.5 w-3.5 text-[#e5a93c]" />
          <span className="hidden sm:inline">Open Photo</span>
          <span className="sm:hidden">Open</span>
        </button>
      </div>

      {/* Center: History, Zoom & Comparison */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo edit"
          title="Undo (Ctrl+Z)"
          className="rounded-md p-1.5 text-[#d1d5db] hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo edit"
          title="Redo (Ctrl+Y)"
          className="rounded-md p-1.5 text-[#d1d5db] hover:bg-white/[0.06] hover:text-white disabled:opacity-35 disabled:pointer-events-none transition-colors"
        >
          <Redo2 className="h-4 w-4" />
        </button>

        <div className="hidden md:block mx-1.5 h-4 w-[1px] bg-white/[0.08]" />

        <div className="hidden md:flex items-center gap-1">
          <button
            type="button"
            onClick={() => onZoomChange(Math.max(0.25, Number((zoom - 0.25).toFixed(2))))}
            aria-label="Zoom out"
            className="rounded-md p-1.5 text-[#d1d5db] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(1)}
            aria-label="Reset zoom to Fit"
            className="min-w-[54px] rounded-md px-2 py-1 font-mono text-xs text-[#d1d5db] hover:bg-white/[0.06] hover:text-white transition-colors whitespace-nowrap"
          >
            {zoom === 1 ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </button>
          <button
            type="button"
            onClick={() => onZoomChange(Math.min(3, Number((zoom + 0.25).toFixed(2))))}
            aria-label="Zoom in"
            className="rounded-md p-1.5 text-[#d1d5db] hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        <div className="hidden md:block mx-1.5 h-4 w-[1px] bg-white/[0.08]" />

        <button
          type="button"
          onClick={onToggleSplitCompare}
          aria-pressed={splitCompare}
          aria-label="Split Compare"
          className={`inline-flex items-center gap-1.5 rounded-md px-2 sm:px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            splitCompare
              ? 'bg-[#e5a93c]/20 text-[#e5a93c] ring-1 ring-[#e5a93c]/50'
              : 'text-[#d1d5db] hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Split Compare</span>
        </button>

        <button
          type="button"
          onPointerDown={() => onPeekOriginalChange(true)}
          onPointerUp={() => onPeekOriginalChange(false)}
          onPointerLeave={() => onPeekOriginalChange(false)}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') onPeekOriginalChange(true);
          }}
          onKeyUp={() => onPeekOriginalChange(false)}
          aria-pressed={isPeekingOriginal}
          className={`hidden md:inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
            isPeekingOriginal
              ? 'bg-white/15 text-white'
              : 'text-[#9ca3af] hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Hold Original</span>
        </button>
      </div>

      {/* Right: Performance Profile, Reset, Export */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <div className="hidden lg:flex items-center gap-1.5">
          <label htmlFor="perf-mode" className="text-[11px] text-[#9ca3af] whitespace-nowrap">
            Preview
          </label>
          <select
            id="perf-mode"
            value={performanceMode}
            onChange={(e) => onPerformanceModeChange(e.target.value as PerformanceMode)}
            className="rounded-md border border-white/[0.08] bg-[#0e0f12] px-2 py-1 text-xs text-[#e5e7eb] focus:outline-none focus:ring-1 focus:ring-[#e5a93c]"
          >
            <option value="auto">
              Auto ({effectiveTier === 'eco' ? 'Eco 1024px' : 'HD 1600px'})
            </option>
            <option value="standard">Standard (1600px)</option>
            <option value="eco">Low-End / Eco (1024px)</option>
          </select>
        </div>

        <PWAInstallButton />

        <button
          type="button"
          onClick={onResetAll}
          disabled={!hasEdits}
          aria-label="Reset all edits"
          className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2 sm:px-2.5 py-1.5 text-xs font-medium text-[#d1d5db] hover:bg-white/[0.06] hover:text-white disabled:opacity-40 disabled:pointer-events-none transition-colors whitespace-nowrap shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#e5a93c] px-2.5 sm:px-3.5 py-1.5 text-xs font-semibold text-[#0e0f12] hover:bg-[#f0b950] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export</span>
        </button>
      </div>
    </header>
  );
};
