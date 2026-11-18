import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import type { CropSettings, ExportOptions } from '../types/editor';
import { getCroppedExportDimensions } from '../utils/colorMath';

interface ExportModalProps {
  isOpen: boolean;
  photoTitle: string;
  origWidth: number;
  origHeight: number;
  crop: CropSettings;
  isExporting: boolean;
  onClose: () => void;
  onExport: (options: ExportOptions) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  photoTitle,
  origWidth,
  origHeight,
  crop,
  isExporting,
  onClose,
  onExport,
}) => {
  const [format, setFormat] = useState<ExportOptions['format']>('image/jpeg');
  const [quality, setQuality] = useState<number>(92);
  const [resolutionScale, setResolutionScale] =
    useState<ExportOptions['resolutionScale']>('full');

  if (!isOpen) return null;

  const targetDims = getCroppedExportDimensions(
    origWidth,
    origHeight,
    crop,
    resolutionScale
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-[#15171c] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2
              id="export-dialog-title"
              className="text-base font-semibold text-white"
            >
              Export Full-Resolution Image
            </h2>
            <p className="mt-0.5 text-xs text-[#9ca3af] truncate max-w-[300px]">
              {photoTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="rounded-md p-1.5 text-[#9ca3af] hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Format selector */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#d1d5db]">
              File Format
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['image/jpeg', 'JPEG'],
                  ['image/png', 'PNG'],
                  ['image/webp', 'WebP'],
                ] as const
              ).map(([mime, label]) => (
                <button
                  key={mime}
                  type="button"
                  onClick={() => setFormat(mime)}
                  className={`rounded-md border py-2 text-xs font-semibold transition-colors ${
                    format === mime
                      ? 'border-[#e5a93c]/80 bg-[#232730] text-white'
                      : 'border-white/[0.08] bg-[#0e0f12] text-[#9ca3af] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Resolution Scale */}
          <div>
            <span className="mb-1.5 block text-xs font-medium text-[#d1d5db]">
              Output Resolution
            </span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['full', '100% Full'],
                  ['2048', '2048px Web'],
                  ['1200', '1200px Share'],
                ] as const
              ).map(([scale, label]) => (
                <button
                  key={scale}
                  type="button"
                  onClick={() => setResolutionScale(scale)}
                  className={`rounded-md border py-2 text-xs font-medium transition-colors ${
                    resolutionScale === scale
                      ? 'border-[#e5a93c]/80 bg-[#232730] text-white'
                      : 'border-white/[0.08] bg-[#0e0f12] text-[#9ca3af] hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Quality Slider (for JPEG / WebP) */}
          {format !== 'image/png' && (
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label
                  htmlFor="export-quality"
                  className="text-xs font-medium text-[#d1d5db]"
                >
                  Compression Quality
                </label>
                <span className="font-mono text-xs text-[#e5a93c]">
                  {quality}%
                </span>
              </div>
              <input
                id="export-quality"
                type="range"
                min={20}
                max={100}
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                className="studio-slider"
              />
            </div>
          )}

          {/* Output summary */}
          <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#0e0f12] px-3.5 py-2.5 text-xs">
            <span className="text-[#9ca3af]">Export Dimensions</span>
            <span className="font-mono font-medium text-white">
              {targetDims.width} × {targetDims.height} px
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/[0.08] px-4 py-2 text-xs font-medium text-[#d1d5db] hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() =>
              onExport({
                format,
                quality: quality / 100,
                resolutionScale,
              })
            }
            className="inline-flex items-center gap-2 rounded-md bg-[#e5a93c] px-4 py-2 text-xs font-semibold text-[#0e0f12] hover:bg-[#f0b950] disabled:opacity-60 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            <span>{isExporting ? 'Rendering...' : 'Download Photo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
