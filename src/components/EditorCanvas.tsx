import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import type {
  CropSettings,
  SamplePhoto,
  TextOverlayLayer,
  ToolTab,
} from '../types/editor';
import { clamp } from '../utils/colorMath';

interface EditorCanvasProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  activeTool: ToolTab;
  crop: CropSettings;
  zoom: number;
  splitCompare: boolean;
  splitX: number;
  isPeekingOriginal: boolean;
  isLoadingImage: boolean;
  canvasSize: { width: number; height: number };
  samples: SamplePhoto[];
  activeSampleId: string;
  customPhotoTitle: string | null;
  brushSizePct: number;
  textLayers: TextOverlayLayer[];
  onSplitXChange: (x: number) => void;
  onCropChange: (nextCrop: CropSettings) => void;
  onCropCommit: () => void;
  onSelectSample: (sample: SamplePhoto) => void;
  onDropFile: (file: File) => void;
  onZoomWheel: (deltaY: number) => void;
  onRetouchStart: (nx: number, ny: number) => void;
  onRetouchMove: (nx: number, ny: number) => void;
  onRetouchEnd: () => void;
  onMoveTextLayer: (id: string, nx: number, ny: number) => void;
  onCommitTextMove: () => void;
}

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export const EditorCanvas: React.FC<EditorCanvasProps> = ({
  canvasRef,
  overlayCanvasRef,
  activeTool,
  crop,
  zoom,
  splitCompare,
  splitX,
  isPeekingOriginal,
  isLoadingImage,
  canvasSize,
  samples,
  activeSampleId,
  customPhotoTitle,
  brushSizePct,
  textLayers,
  onSplitXChange,
  onCropChange,
  onCropCommit,
  onSelectSample,
  onDropFile,
  onZoomWheel,
  onRetouchStart,
  onRetouchMove,
  onRetouchEnd,
  onMoveTextLayer,
  onCommitTextMove,
}) => {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0.5,
    y: 0.5,
    visible: false,
  });
  const isDrawingRef = useRef(false);
  const draggingTextIdRef = useRef<string | null>(null);
  const panStartRef = useRef({ clientX: 0, clientY: 0, panX: 0, panY: 0 });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const cropDragRef = useRef<{
    handle: CropHandle;
    startX: number;
    startY: number;
    origCrop: CropSettings;
  } | null>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onDropFile(file);
    }
  };

  const getNormalizedPointer = (clientX: number, clientY: number) => {
    const rect = frameRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0.5, y: 0.5 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTool === 'retouch') {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const pt = getNormalizedPointer(e.clientX, e.clientY);
      setBrushCursor({ x: pt.x, y: pt.y, visible: true });
      onRetouchStart(pt.x, pt.y);
      return;
    }

    if (activeTool === 'layers' && textLayers.length > 0) {
      const pt = getNormalizedPointer(e.clientX, e.clientY);
      const visibleTexts = textLayers.filter((t) => t.visible);
      // Pick closest text layer within generous hit radius
      let closestId: string | null = null;
      let bestDist = 0.2;
      for (const txt of visibleTexts) {
        const d = Math.hypot(txt.x - pt.x, txt.y - pt.y);
        if (d < bestDist) {
          bestDist = d;
          closestId = txt.id;
        }
      }
      if (closestId) {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        draggingTextIdRef.current = closestId;
        onMoveTextLayer(closestId, pt.x, pt.y);
      }
    }
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = getNormalizedPointer(e.clientX, e.clientY);
    if (activeTool === 'retouch') {
      setBrushCursor({ x: pt.x, y: pt.y, visible: true });
      if (isDrawingRef.current) {
        onRetouchMove(pt.x, pt.y);
      }
      return;
    }
    if (activeTool === 'layers' && draggingTextIdRef.current) {
      onMoveTextLayer(draggingTextIdRef.current, pt.x, pt.y);
    }
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onRetouchEnd();
    }
    if (draggingTextIdRef.current) {
      draggingTextIdRef.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      onCommitTextMove();
    }
  };

  const startSplitDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const update = (clientX: number) => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      onSplitXChange(clamp((clientX - rect.left) / rect.width, 0.02, 0.98));
    };
    update(e.clientX);

    const onMove = (ev: PointerEvent) => update(ev.clientX);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startCropDrag = (
    e: React.PointerEvent<HTMLDivElement>,
    handle: CropHandle
  ) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    cropDragRef.current = {
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origCrop: { ...crop },
    };
  };

  const moveCropDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = cropDragRef.current;
    const rect = frameRef.current?.getBoundingClientRect();
    if (!drag || !rect || rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - drag.startX) / rect.width;
    const dy = (e.clientY - drag.startY) / rect.height;
    const minSize = 0.1;
    const o = drag.origCrop;
    let nextX = o.x;
    let nextY = o.y;
    let nextW = o.width;
    let nextH = o.height;

    if (drag.handle === 'move') {
      nextX = clamp(o.x + dx, 0, 1 - o.width);
      nextY = clamp(o.y + dy, 0, 1 - o.height);
    } else if (drag.handle === 'nw') {
      const right = o.x + o.width;
      const bottom = o.y + o.height;
      nextX = clamp(o.x + dx, 0, right - minSize);
      nextY = clamp(o.y + dy, 0, bottom - minSize);
      nextW = right - nextX;
      nextH = bottom - nextY;
    } else if (drag.handle === 'ne') {
      const bottom = o.y + o.height;
      nextW = clamp(o.width + dx, minSize, 1 - o.x);
      nextY = clamp(o.y + dy, 0, bottom - minSize);
      nextH = bottom - nextY;
    } else if (drag.handle === 'sw') {
      const right = o.x + o.width;
      nextX = clamp(o.x + dx, 0, right - minSize);
      nextW = right - nextX;
      nextH = clamp(o.height + dy, minSize, 1 - o.y);
    } else if (drag.handle === 'se') {
      nextW = clamp(o.width + dx, minSize, 1 - o.x);
      nextH = clamp(o.height + dy, minSize, 1 - o.y);
    }

    onCropChange({
      ...crop,
      x: Number(nextX.toFixed(4)),
      y: Number(nextY.toFixed(4)),
      width: Number(nextW.toFixed(4)),
      height: Number(nextH.toFixed(4)),
    });
  };

  const endCropDrag = () => {
    if (cropDragRef.current) {
      cropDragRef.current = null;
      onCropCommit();
    }
  };

  const effectivePan = zoom <= 1 ? { x: 0, y: 0 } : pan;
  const aspectRatio =
    canvasSize.height > 0 ? canvasSize.width / canvasSize.height : 4 / 3;
  const interactiveOverlay =
    activeTool === 'retouch' ||
    (activeTool === 'layers' && textLayers.some((t) => t.visible));

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden darkroom-mat"
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Main Viewport Area */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6"
        onWheel={(e) => {
          if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
            onZoomWheel(e.deltaY);
          }
        }}
        onPointerDown={(e) => {
          if (zoom <= 1 || activeTool === 'crop' || activeTool === 'retouch') return;
          setIsPanning(true);
          panStartRef.current = {
            clientX: e.clientX,
            clientY: e.clientY,
            panX: effectivePan.x,
            panY: effectivePan.y,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!isPanning) return;
          setPan({
            x: panStartRef.current.panX + (e.clientX - panStartRef.current.clientX),
            y: panStartRef.current.panY + (e.clientY - panStartRef.current.clientY),
          });
        }}
        onPointerUp={() => setIsPanning(false)}
      >
        <div
          ref={frameRef}
          className="relative flex items-center justify-center shadow-2xl transition-transform duration-75"
          style={{
            aspectRatio: `${aspectRatio}`,
            maxWidth: '100%',
            maxHeight: '100%',
            height: aspectRatio < 1 ? '100%' : 'auto',
            width: aspectRatio >= 1 ? 'min(100%, 920px)' : 'auto',
            transform: `translate3d(${effectivePan.x}px, ${effectivePan.y}px, 0) scale(${zoom})`,
            cursor:
              activeTool === 'retouch'
                ? 'crosshair'
                : zoom > 1 && activeTool !== 'crop'
                  ? isPanning
                    ? 'grabbing'
                    : 'grab'
                  : 'default',
          }}
        >
          <canvas
            ref={canvasRef}
            data-testid="editor-canvas"
            className="block h-full w-full rounded-[2px] bg-[#0b0c0f] object-contain ring-1 ring-white/[0.08]"
          />

          {/* Photoshop Retouch, Blend & Typography Overlay Canvas */}
          <canvas
            ref={overlayCanvasRef}
            data-testid="photoshop-overlay-canvas"
            onPointerDown={handleOverlayPointerDown}
            onPointerMove={handleOverlayPointerMove}
            onPointerUp={handleOverlayPointerUp}
            onPointerLeave={() =>
              setBrushCursor((b) => (b.visible ? { ...b, visible: false } : b))
            }
            className={`absolute inset-0 h-full w-full touch-none ${
              interactiveOverlay ? 'pointer-events-auto z-10' : 'pointer-events-none z-10'
            }`}
          />

          {/* Live Brush Preview Ring */}
          {activeTool === 'retouch' && brushCursor.visible && (
            <div
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#e5a93c] shadow-[0_0_0_1px_rgba(0,0,0,0.65)]"
              style={{
                left: `${brushCursor.x * 100}%`,
                top: `${brushCursor.y * 100}%`,
                width: `${brushSizePct}%`,
                aspectRatio: '1 / 1',
              }}
            />
          )}

          {/* Before / After Original Indicator */}
          {isPeekingOriginal && (
            <div className="pointer-events-none absolute top-3 left-3 z-20 rounded bg-black/75 px-2.5 py-1 text-xs font-medium text-white">
              Original
            </div>
          )}

          {/* Split Compare Curtain */}
          {splitCompare && activeTool !== 'crop' && !isPeekingOriginal && (
            <>
              <div className="pointer-events-none absolute top-3 left-3 z-20 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-[#d1d5db]">
                Before
              </div>
              <div className="pointer-events-none absolute top-3 right-3 z-20 rounded bg-black/70 px-2 py-0.5 text-[11px] font-medium text-[#e5a93c]">
                After
              </div>
              <div
                role="slider"
                aria-label="Before and after split divider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(splitX * 100)}
                tabIndex={0}
                onPointerDown={startSplitDrag}
                className="absolute top-0 bottom-0 z-20 w-6 -translate-x-1/2 cursor-ew-resize touch-none"
                style={{ left: `${splitX * 100}%` }}
              >
                <div className="mx-auto h-full w-[2px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
                <div className="absolute top-1/2 left-1/2 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/80 bg-[#0e0f12]/90 text-[10px] font-bold text-white shadow-lg">
                  ↔
                </div>
              </div>
            </>
          )}

          {/* Interactive Crop Overlay */}
          {activeTool === 'crop' && (
            <div className="absolute inset-0 z-20 select-none">
              {/* Dimmed exterior masks */}
              <div
                className="pointer-events-none absolute inset-0 bg-black/55"
                style={{
                  clipPath: `polygon(
                    0% 0%, 100% 0%, 100% 100%, 0% 100%,
                    0% ${crop.y * 100}%,
                    ${crop.x * 100}% ${crop.y * 100}%,
                    ${crop.x * 100}% ${(crop.y + crop.height) * 100}%,
                    ${(crop.x + crop.width) * 100}% ${(crop.y + crop.height) * 100}%,
                    ${(crop.x + crop.width) * 100}% ${crop.y * 100}%,
                    0% ${crop.y * 100}%
                  )`,
                }}
              />

              {/* Draggable Crop Box */}
              <div
                onPointerDown={(e) => startCropDrag(e, 'move')}
                onPointerMove={moveCropDrag}
                onPointerUp={endCropDrag}
                className="absolute cursor-move border border-white/90 touch-none"
                style={{
                  left: `${crop.x * 100}%`,
                  top: `${crop.y * 100}%`,
                  width: `${crop.width * 100}%`,
                  height: `${crop.height * 100}%`,
                }}
              >
                {/* Rule of Thirds Grid */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-r border-b border-white/25" />
                  <div className="border-b border-white/25" />
                  <div className="border-r border-white/25" />
                  <div className="border-r border-white/25" />
                  <div />
                </div>

                {/* Corner Handles */}
                {(
                  [
                    ['nw', '-top-1.5 -left-1.5 cursor-nwse-resize'],
                    ['ne', '-top-1.5 -right-1.5 cursor-nesw-resize'],
                    ['sw', '-bottom-1.5 -left-1.5 cursor-nesw-resize'],
                    ['se', '-bottom-1.5 -right-1.5 cursor-nwse-resize'],
                  ] as const
                ).map(([h, posClass]) => (
                  <div
                    key={h}
                    onPointerDown={(e) => startCropDrag(e, h)}
                    onPointerMove={moveCropDrag}
                    onPointerUp={endCropDrag}
                    className={`absolute h-3.5 w-3.5 rounded-xs border border-[#0e0f12] bg-[#e5a93c] shadow ${posClass}`}
                  />
                ))}
              </div>
            </div>
          )}

          {isLoadingImage && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 text-xs font-medium text-white">
              Preparing image buffer...
            </div>
          )}
        </div>

        {/* Drag & Drop Upload Overlay */}
        {isDragOver && (
          <div className="pointer-events-none absolute inset-4 z-40 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e5a93c] bg-[#0e0f12]/90">
            <Upload className="h-7 w-7 text-[#e5a93c]" />
            <span className="text-sm font-semibold text-white">
              Drop JPEG, PNG, or WebP to edit locally
            </span>
          </div>
        )}
      </div>

      {/* Bottom Sample Filmstrip Switcher */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 border-t border-white/[0.08] bg-[#13151a] px-4">
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          {samples.map((s) => {
            const active = !customPhotoTitle && activeSampleId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSample(s)}
                aria-label={`Load sample photo ${s.title}`}
                className={`group flex items-center gap-2.5 rounded-md border px-2 py-1 text-left transition-colors shrink-0 ${
                  active
                    ? 'border-[#e5a93c]/70 bg-[#1c1f26]'
                    : 'border-white/[0.06] bg-[#0e0f12] hover:border-white/20'
                }`}
              >
                <img
                  src={s.url}
                  alt={s.title}
                  referrerPolicy="no-referrer"
                  className="h-9 w-12 rounded-xs object-cover bg-[#1c1f26]"
                />
                <div className="hidden sm:block pr-1">
                  <div className="text-xs font-medium text-[#f3f4f6] whitespace-nowrap">
                    {s.title}
                  </div>
                  <div className="text-[10px] text-[#9ca3af] whitespace-nowrap">
                    {s.cameraMeta}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {customPhotoTitle && (
          <div className="hidden md:flex items-center gap-2 text-xs text-[#9ca3af] shrink-0">
            <span className="text-[#e5a93c]">Loaded:</span>
            <span className="max-w-[180px] truncate text-white">{customPhotoTitle}</span>
          </div>
        )}
      </div>
    </div>
  );
};
