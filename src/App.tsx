import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Crop,
  Layers,
  Paintbrush,
  Palette,
  SlidersHorizontal,
  Sparkles,
  SunMedium,
  Wand2,
} from 'lucide-react';
import {
  DetailEffectsPanel,
  LightColorPanel,
} from './components/AdjustAndDetailPanels';
import { AiEnhancePanel } from './components/AiEnhancePanel';
import { ColorGradePanel } from './components/ColorGradePanel';
import { CropPanel } from './components/CropPanel';
import { CurveEditor } from './components/CurveEditor';
import { EditorCanvas } from './components/EditorCanvas';
import { ExportModal } from './components/ExportModal';
import { HistogramPanel } from './components/HistogramPanel';
import { HslPanel } from './components/HslPanel';
import { LayersPanel } from './components/LayersPanel';
import { PresetsPanel } from './components/PresetsPanel';
import { OfflineIndicator } from './components/PWAControls';
import { RetouchPanel } from './components/RetouchPanel';
import { TopToolbar } from './components/TopToolbar';
import { BUILTIN_PRESETS, SAMPLE_PHOTOS } from './data/presets';
import { compositePhotoshopLayers } from './engine/layerCompositor';
import { PhotoRenderEngine } from './engine/webglPipeline';
import type {
  AiEnhanceMode,
  BasicAdjustments,
  EditState,
  ExportOptions,
  HistogramData,
  ImageTelemetry,
  OverlayLayer,
  PerformanceMode,
  PhotoPreset,
  RetouchBrushMode,
  RetouchStroke,
  SamplePhoto,
  TextOverlayLayer,
  ToolTab,
} from './types/editor';
import {
  applyPresetWithIntensity,
  clamp,
  cloneEditState,
  createDefaultEditState,
  DEFAULT_ADJUSTMENTS,
  getCroppedExportDimensions,
  hasAnyColorEdits,
  hasAnyCropEdits,
  resolveEffectiveTier,
} from './utils/colorMath';
import {
  analyzeImageTelemetry,
  computeAiEnhanceState,
} from './utils/offlineAiEnhance';

const CUSTOM_PRESETS_KEY = 'lumina_custom_presets_v1';

const TOOL_TABS: {
  id: ToolTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
  { id: 'aiEnhance', label: 'Auto AI', icon: Wand2 },
  { id: 'presets', label: 'Presets', icon: Sparkles },
  { id: 'retouch', label: 'Retouch', icon: Paintbrush },
  { id: 'layers', label: 'Layers', icon: Layers },
  { id: 'curves', label: 'Curves', icon: Activity },
  { id: 'hsl', label: 'Color Mix', icon: SunMedium },
  { id: 'colorGrade', label: 'Grading', icon: Palette },
  { id: 'detail', label: 'Detail', icon: SunMedium },
  { id: 'crop', label: 'Crop', icon: Crop },
];

const EMPTY_HISTOGRAM: HistogramData = {
  r: new Array(64).fill(0),
  g: new Array(64).fill(0),
  b: new Array(64).fill(0),
  luma: new Array(64).fill(0),
  shadowClipPct: 0,
  highlightClipPct: 0,
};

function loadCustomPresets(): PhotoPreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [editState, setEditState] = useState<EditState>(() => createDefaultEditState());
  const [activeTool, setActiveTool] = useState<ToolTab>('adjust');
  const [activeSample, setActiveSample] = useState<SamplePhoto>(SAMPLE_PHOTOS[0]);
  const [customPhotoTitle, setCustomPhotoTitle] = useState<string | null>(null);
  const [origDims, setOrigDims] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 900,
  });
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 900,
  });
  const [isLoadingImage, setIsLoadingImage] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(1);
  const [splitCompare, setSplitCompare] = useState<boolean>(false);
  const [splitX, setSplitX] = useState<number>(0.5);
  const [isPeekingOriginal, setIsPeekingOriginal] = useState<boolean>(false);
  const [performanceMode, setPerformanceMode] = useState<PerformanceMode>('auto');
  const [histogram, setHistogram] = useState<HistogramData>(EMPTY_HISTOGRAM);
  const [telemetry, setTelemetry] = useState<ImageTelemetry | null>(null);
  const [customPresets, setCustomPresets] = useState<PhotoPreset[]>(() =>
    loadCustomPresets()
  );
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Brush tool state
  const [brushMode, setBrushMode] = useState<RetouchBrushMode>('heal');
  const [brushSize, setBrushSize] = useState<number>(7);
  const [brushFeather, setBrushFeather] = useState<number>(75);
  const [brushStrength, setBrushStrength] = useState<number>(65);

  // Undo / Redo history stack
  const [historyPast, setHistoryPast] = useState<EditState[]>([]);
  const [historyFuture, setHistoryFuture] = useState<EditState[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PhotoRenderEngine | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const histTimerRef = useRef<number | null>(null);
  const isScrubbingRef = useRef<boolean>(false);
  const scrubSnapshotRef = useRef<EditState | null>(null);
  const activeStrokeIdRef = useRef<string | null>(null);
  const latestStateRef = useRef<EditState>(editState);
  latestStateRef.current = editState;

  const effectiveTier = resolveEffectiveTier(performanceMode);
  const proxyMaxDim = effectiveTier === 'eco' ? 1024 : 1600;

  // Schedule single coalesced GPU render + Photoshop overlay composite + throttled histogram
  const scheduleRender = useCallback(
    (immediateHistogram = false) => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        const engine = engineRef.current;
        const baseCanvas = canvasRef.current;
        const overlayCanvas = overlayCanvasRef.current;
        if (!engine || !baseCanvas) return;

        const currentState = latestStateRef.current;
        const renderState = isPeekingOriginal
          ? {
              ...createDefaultEditState(),
              crop: currentState.crop,
            }
          : currentState;

        const activeSplitX =
          splitCompare && activeTool !== 'crop' && !isPeekingOriginal ? splitX : -1;

        const renderedSize = engine.render(renderState, {
          showFullForCrop: activeTool === 'crop',
          splitX: activeSplitX,
          fastPreview: effectiveTier === 'eco' && isScrubbingRef.current,
        });

        setCanvasSize((prev) =>
          prev.width === renderedSize.width && prev.height === renderedSize.height
            ? prev
            : renderedSize
        );

        // Composite Photoshop Retouch, Blend Layers & Text Layers over WebGL output
        if (overlayCanvas) {
          if (
            overlayCanvas.width !== renderedSize.width ||
            overlayCanvas.height !== renderedSize.height
          ) {
            overlayCanvas.width = renderedSize.width;
            overlayCanvas.height = renderedSize.height;
          }
          const oCtx = overlayCanvas.getContext('2d');
          if (oCtx) {
            if (isPeekingOriginal || activeTool === 'crop') {
              oCtx.clearRect(0, 0, renderedSize.width, renderedSize.height);
            } else {
              compositePhotoshopLayers(
                oCtx,
                baseCanvas,
                renderedSize.width,
                renderedSize.height,
                currentState,
                {
                  drawBaseImage: false,
                  splitX: activeSplitX,
                }
              );
            }
          }
        }

        if (immediateHistogram) {
          setHistogram(engine.sampleHistogram());
        } else {
          if (histTimerRef.current !== null) {
            window.clearTimeout(histTimerRef.current);
          }
          histTimerRef.current = window.setTimeout(() => {
            histTimerRef.current = null;
            if (engineRef.current) {
              setHistogram(engineRef.current.sampleHistogram());
            }
          }, 95);
        }
      });
    },
    [activeTool, effectiveTier, isPeekingOriginal, splitCompare, splitX]
  );

  // Initialize WebGL engine once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new PhotoRenderEngine(canvas, proxyMaxDim);
    engineRef.current = engine;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (histTimerRef.current !== null) clearTimeout(histTimerRef.current);
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update proxy texture resolution when performance mode changes
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setProxyMaxDim(proxyMaxDim);
    scheduleRender(true);
  }, [proxyMaxDim, scheduleRender]);

  // Re-render whenever state or viewport flags change
  useEffect(() => {
    scheduleRender(false);
  }, [editState, activeTool, splitCompare, splitX, isPeekingOriginal, scheduleRender]);

  // Load an image URL into the engine + compute offline AI telemetry
  const loadImageUrl = useCallback(
    (url: string, revokeAfterLoad = false) => {
      setIsLoadingImage(true);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const w = img.naturalWidth || img.width;
        const h = img.naturalHeight || img.height;
        setOrigDims({ width: w, height: h });
        if (engineRef.current) {
          engineRef.current.setSourceImage(img);
          const rgba = engineRef.current.sampleSourceRGBA();
          if (rgba) {
            setTelemetry(analyzeImageTelemetry(rgba));
          }
        }
        setIsLoadingImage(false);
        scheduleRender(true);
        if (revokeAfterLoad) {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => {
        setIsLoadingImage(false);
      };
      img.src = url;
    },
    [scheduleRender]
  );

  // Load default sample on initial mount
  useEffect(() => {
    loadImageUrl(SAMPLE_PHOTOS[0].url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // History helpers
  const commitSnapshot = useCallback((previousState: EditState) => {
    setHistoryPast((prev) => [...prev.slice(-39), cloneEditState(previousState)]);
    setHistoryFuture([]);
  }, []);

  const beginScrub = useCallback(() => {
    isScrubbingRef.current = true;
    if (!scrubSnapshotRef.current) {
      scrubSnapshotRef.current = cloneEditState(latestStateRef.current);
    }
  }, []);

  const endScrub = useCallback(() => {
    isScrubbingRef.current = false;
    const snap = scrubSnapshotRef.current;
    scrubSnapshotRef.current = null;
    if (snap && JSON.stringify(snap) !== JSON.stringify(latestStateRef.current)) {
      commitSnapshot(snap);
    }
    scheduleRender(true);
  }, [commitSnapshot, scheduleRender]);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((fut) => [cloneEditState(latestStateRef.current), ...fut]);
      setEditState(cloneEditState(previous));
      return past.slice(0, -1);
    });
  }, []);

  const handleRedo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const [next, ...rest] = fut;
      setHistoryPast((past) => [...past, cloneEditState(latestStateRef.current)]);
      setEditState(cloneEditState(next));
      return rest;
    });
  }, []);

  // Keyboard shortcuts for Undo / Redo
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (target.getAttribute('type') !== 'range') return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const handleFilePicked = (file: File) => {
    const objUrl = URL.createObjectURL(file);
    setCustomPhotoTitle(file.name);
    setEditState(createDefaultEditState());
    setHistoryPast([]);
    setHistoryFuture([]);
    setZoom(1);
    loadImageUrl(objUrl, true);
  };

  const handleSelectSample = (sample: SamplePhoto) => {
    setActiveSample(sample);
    setCustomPhotoTitle(null);
    setEditState(createDefaultEditState());
    setHistoryPast([]);
    setHistoryFuture([]);
    setZoom(1);
    loadImageUrl(sample.url);
  };

  const updateAdjustment = (key: keyof BasicAdjustments, value: number) => {
    setEditState((prev) => ({
      ...prev,
      adjustments: {
        ...prev.adjustments,
        [key]: value,
      },
    }));
  };

  const resetAdjustmentGroup = (keys: (keyof BasicAdjustments)[]) => {
    commitSnapshot(editState);
    setEditState((prev) => {
      const nextAdj = { ...prev.adjustments };
      for (const k of keys) {
        nextAdj[k] = DEFAULT_ADJUSTMENTS[k];
      }
      return { ...prev, adjustments: nextAdj };
    });
  };

  const allPresets = useMemo(
    () => [...customPresets, ...BUILTIN_PRESETS],
    [customPresets]
  );

  const handleSelectPreset = (preset: PhotoPreset) => {
    commitSnapshot(editState);
    setEditState((prev) => {
      const blended = applyPresetWithIntensity(prev.crop, preset, 100);
      return {
        ...blended,
        retouchStrokes: prev.retouchStrokes,
        overlayLayers: prev.overlayLayers,
        textLayers: prev.textLayers,
      };
    });
  };

  const handlePresetIntensity = (intensity: number) => {
    const active = allPresets.find((p) => p.id === editState.activePresetId);
    if (!active) return;
    setEditState((prev) => {
      const blended = applyPresetWithIntensity(prev.crop, active, intensity);
      return {
        ...blended,
        retouchStrokes: prev.retouchStrokes,
        overlayLayers: prev.overlayLayers,
        textLayers: prev.textLayers,
      };
    });
  };

  // Offline AI Enhance handlers
  const handleSelectAiMode = (mode: AiEnhanceMode) => {
    const tel =
      telemetry ??
      (engineRef.current?.sampleSourceRGBA()
        ? analyzeImageTelemetry(engineRef.current.sampleSourceRGBA()!)
        : null);
    if (!tel) return;
    commitSnapshot(editState);
    setEditState((prev) => computeAiEnhanceState(prev, tel, mode, prev.aiStrength));
  };

  const handleAiStrengthChange = (strength: number) => {
    if (!editState.activeAiMode || !telemetry) return;
    setEditState((prev) =>
      computeAiEnhanceState(prev, telemetry, prev.activeAiMode!, strength)
    );
  };

  // Photoshop Retouch Brush handlers
  const handleRetouchStart = (nx: number, ny: number) => {
    beginScrub();
    const id = `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    activeStrokeIdRef.current = id;
    const newStroke: RetouchStroke = {
      id,
      mode: brushMode,
      size: brushSize / 100,
      feather: brushFeather / 100,
      strength: brushStrength / 100,
      points: [{ x: nx, y: ny }],
    };
    setEditState((prev) => ({
      ...prev,
      retouchStrokes: [...prev.retouchStrokes, newStroke],
    }));
  };

  const handleRetouchMove = (nx: number, ny: number) => {
    const sid = activeStrokeIdRef.current;
    if (!sid) return;
    setEditState((prev) => {
      const idx = prev.retouchStrokes.findIndex((s) => s.id === sid);
      if (idx < 0) return prev;
      const target = prev.retouchStrokes[idx];
      const last = target.points[target.points.length - 1];
      if (last && Math.hypot(last.x - nx, last.y - ny) < 0.008) return prev;
      const updated = [...prev.retouchStrokes];
      updated[idx] = { ...target, points: [...target.points, { x: nx, y: ny }] };
      return { ...prev, retouchStrokes: updated };
    });
  };

  const handleRetouchEnd = () => {
    activeStrokeIdRef.current = null;
    endScrub();
  };

  // Photoshop Blend & Text Layers handlers
  const handleAddOverlayLayer = (
    preset: 'sun-flare' | 'cool-wash' | 'amber-tint' | 'duotone'
  ) => {
    commitSnapshot(editState);
    const id = `layer-${Date.now()}`;
    const layerMap: Record<typeof preset, OverlayLayer> = {
      'sun-flare': {
        id,
        name: 'Warm Sun Flare',
        type: 'radial-glow',
        colorA: 'rgba(255, 198, 108, 0.85)',
        colorB: 'rgba(255, 140, 40, 0)',
        blendMode: 'screen',
        opacity: 55,
        visible: true,
      },
      'cool-wash': {
        id,
        name: 'Cool Twilight Wash',
        type: 'solid',
        colorA: '#1d4ed8',
        colorB: '#1d4ed8',
        blendMode: 'soft-light',
        opacity: 30,
        visible: true,
      },
      'amber-tint': {
        id,
        name: 'Golden Amber Fill',
        type: 'solid',
        colorA: '#d97706',
        colorB: '#d97706',
        blendMode: 'overlay',
        opacity: 25,
        visible: true,
      },
      duotone: {
        id,
        name: 'Cinema Split Gradient',
        type: 'linear-gradient',
        colorA: 'rgba(14, 116, 144, 0.75)',
        colorB: 'rgba(234, 88, 12, 0.7)',
        blendMode: 'soft-light',
        opacity: 45,
        visible: true,
      },
    };
    setEditState((prev) => ({
      ...prev,
      overlayLayers: [layerMap[preset], ...prev.overlayLayers],
    }));
  };

  const handleAddTextLayer = (text: string) => {
    commitSnapshot(editState);
    const newText: TextOverlayLayer = {
      id: `txt-${Date.now()}`,
      text,
      x: 0.5,
      y: 0.86,
      fontSize: 5,
      fontFamily: 'sans',
      color: '#ffffff',
      opacity: 90,
      visible: true,
    };
    setEditState((prev) => ({
      ...prev,
      textLayers: [...prev.textLayers, newText],
    }));
  };

  const handleSaveCustomPreset = (name: string) => {
    const newPreset: PhotoPreset = {
      id: `custom-${Date.now()}`,
      name,
      category: 'custom',
      description: 'Custom studio look',
      swatchColors: ['#e5a93c', '#374151', '#f3f4f6'],
      adjustments: { ...editState.adjustments },
      curves: {
        rgb: editState.curves.rgb.map((p) => ({ ...p })),
        red: editState.curves.red.map((p) => ({ ...p })),
        green: editState.curves.green.map((p) => ({ ...p })),
        blue: editState.curves.blue.map((p) => ({ ...p })),
      },
      hsl: { ...editState.hsl },
      colorGrade: { ...editState.colorGrade },
    };
    const next = [newPreset, ...customPresets];
    setCustomPresets(next);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore quota error
    }
    setEditState((prev) => ({
      ...prev,
      activePresetId: newPreset.id,
      presetIntensity: 100,
    }));
  };

  const handleDeleteCustomPreset = (id: string) => {
    const next = customPresets.filter((p) => p.id !== id);
    setCustomPresets(next);
    try {
      localStorage.setItem(CUSTOM_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    if (editState.activePresetId === id) {
      setEditState((prev) => ({ ...prev, activePresetId: null }));
    }
  };

  const handleResetAll = () => {
    commitSnapshot(editState);
    setEditState(createDefaultEditState());
  };

  const handleExport = async (options: ExportOptions) => {
    if (!engineRef.current) return;
    setIsExporting(true);
    try {
      const { blob } = await engineRef.current.exportFullResolution(
        editState,
        options
      );
      const ext =
        options.format === 'image/png'
          ? 'png'
          : options.format === 'image/webp'
            ? 'webp'
            : 'jpg';
      const baseName = (customPhotoTitle || activeSample.title)
        .replace(/\.[^/.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      const dlUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = dlUrl;
      link.download = `${baseName}-edited.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(dlUrl);
      setIsExportOpen(false);
    } finally {
      setIsExporting(false);
    }
  };

  const croppedOutDims = getCroppedExportDimensions(
    origDims.width,
    origDims.height,
    editState.crop,
    'full'
  );
  const editedFlag =
    hasAnyColorEdits(editState) || hasAnyCropEdits(editState.crop);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-[#0e0f12] text-[#f3f4f6]"
      data-active-tool={activeTool}
      data-tier={effectiveTier}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFilePicked(f);
          e.target.value = '';
        }}
        className="hidden"
      />

      <TopToolbar
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        hasEdits={editedFlag}
        zoom={zoom}
        splitCompare={splitCompare}
        isPeekingOriginal={isPeekingOriginal}
        performanceMode={performanceMode}
        effectiveTier={effectiveTier}
        onOpenFile={() => fileInputRef.current?.click()}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomChange={setZoom}
        onToggleSplitCompare={() => setSplitCompare((s) => !s)}
        onPeekOriginalChange={setIsPeekingOriginal}
        onPerformanceModeChange={setPerformanceMode}
        onResetAll={handleResetAll}
        onOpenExport={() => setIsExportOpen(true)}
      />

      <main className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Left Vertical Tool Rail (Desktop) */}
        <nav
          aria-label="Photo editing tools"
          className="studio-scroll flex shrink-0 items-center gap-1 overflow-x-auto border-b border-white/[0.08] bg-[#13151a] px-2 py-1.5 lg:w-[78px] lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:border-r lg:border-b-0 lg:px-1.5 lg:py-2.5"
        >
          {TOOL_TABS.map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                aria-current={active ? 'page' : undefined}
                className={`flex shrink-0 flex-row items-center gap-1.5 rounded-lg px-2.5 py-2 text-[11px] font-medium transition-colors lg:w-full lg:flex-col lg:gap-1 lg:px-1 lg:py-2 ${
                  active
                    ? 'bg-[#232730] text-[#e5a93c]'
                    : 'text-[#9ca3af] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{tool.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Center Darkroom Canvas Viewport */}
        <EditorCanvas
          canvasRef={canvasRef}
          overlayCanvasRef={overlayCanvasRef}
          activeTool={activeTool}
          crop={editState.crop}
          zoom={zoom}
          splitCompare={splitCompare}
          splitX={splitX}
          isPeekingOriginal={isPeekingOriginal}
          isLoadingImage={isLoadingImage}
          canvasSize={canvasSize}
          samples={SAMPLE_PHOTOS}
          activeSampleId={activeSample.id}
          customPhotoTitle={customPhotoTitle}
          brushSizePct={brushSize}
          textLayers={editState.textLayers}
          onSplitXChange={setSplitX}
          onCropChange={(nextCrop) =>
            setEditState((prev) => ({ ...prev, crop: nextCrop }))
          }
          onCropCommit={() => {
            if (scrubSnapshotRef.current) {
              endScrub();
            } else {
              scheduleRender(true);
            }
          }}
          onSelectSample={handleSelectSample}
          onDropFile={handleFilePicked}
          onZoomWheel={(deltaY) =>
            setZoom((z) =>
              clamp(Number((z + (deltaY < 0 ? 0.1 : -0.1)).toFixed(2)), 0.25, 3)
            )
          }
          onRetouchStart={handleRetouchStart}
          onRetouchMove={handleRetouchMove}
          onRetouchEnd={handleRetouchEnd}
          onMoveTextLayer={(id, nx, ny) => {
            beginScrub();
            setEditState((prev) => ({
              ...prev,
              textLayers: prev.textLayers.map((t) =>
                t.id === id ? { ...t, x: nx, y: ny } : t
              ),
            }));
          }}
          onCommitTextMove={endScrub}
        />

        {/* Right Inspector Sidebar */}
        <aside
          aria-label="Inspector controls"
          className="flex h-[38vh] shrink-0 flex-col border-t border-white/[0.08] bg-[#15171c] lg:h-auto lg:w-[320px] lg:border-t-0 lg:border-l"
        >
          <HistogramPanel
            data={histogram}
            dimensionsLabel={`${croppedOutDims.width} × ${croppedOutDims.height}`}
          />

          <div className="studio-scroll min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {activeTool === 'adjust' && (
              <LightColorPanel
                adjustments={editState.adjustments}
                onChange={updateAdjustment}
                onResetGroup={resetAdjustmentGroup}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            )}

            {activeTool === 'aiEnhance' && (
              <AiEnhancePanel
                activeAiMode={editState.activeAiMode}
                aiStrength={editState.aiStrength}
                telemetry={telemetry}
                onSelectMode={handleSelectAiMode}
                onStrengthChange={handleAiStrengthChange}
                onClearAi={() => {
                  commitSnapshot(editState);
                  setEditState((prev) => ({
                    ...createDefaultEditState(),
                    crop: prev.crop,
                    retouchStrokes: prev.retouchStrokes,
                    overlayLayers: prev.overlayLayers,
                    textLayers: prev.textLayers,
                  }));
                }}
              />
            )}

            {activeTool === 'presets' && (
              <PresetsPanel
                presets={BUILTIN_PRESETS}
                customPresets={customPresets}
                activePresetId={editState.activePresetId}
                presetIntensity={editState.presetIntensity}
                onSelectPreset={handleSelectPreset}
                onIntensityChange={handlePresetIntensity}
                onSaveCustomPreset={handleSaveCustomPreset}
                onDeleteCustomPreset={handleDeleteCustomPreset}
                onResetToOriginal={() => {
                  commitSnapshot(editState);
                  setEditState((prev) => ({
                    ...createDefaultEditState(),
                    crop: prev.crop,
                    retouchStrokes: prev.retouchStrokes,
                    overlayLayers: prev.overlayLayers,
                    textLayers: prev.textLayers,
                  }));
                }}
              />
            )}

            {activeTool === 'retouch' && (
              <RetouchPanel
                brushMode={brushMode}
                brushSize={brushSize}
                brushFeather={brushFeather}
                brushStrength={brushStrength}
                strokeCount={editState.retouchStrokes.length}
                onBrushModeChange={setBrushMode}
                onBrushSizeChange={setBrushSize}
                onBrushFeatherChange={setBrushFeather}
                onBrushStrengthChange={setBrushStrength}
                onUndoLastStroke={() => {
                  if (editState.retouchStrokes.length === 0) return;
                  commitSnapshot(editState);
                  setEditState((prev) => ({
                    ...prev,
                    retouchStrokes: prev.retouchStrokes.slice(0, -1),
                  }));
                }}
                onClearStrokes={() => {
                  commitSnapshot(editState);
                  setEditState((prev) => ({ ...prev, retouchStrokes: [] }));
                }}
              />
            )}

            {activeTool === 'layers' && (
              <LayersPanel
                overlayLayers={editState.overlayLayers}
                textLayers={editState.textLayers}
                onAddOverlayLayer={handleAddOverlayLayer}
                onUpdateOverlayLayer={(id, patch) => {
                  setEditState((prev) => ({
                    ...prev,
                    overlayLayers: prev.overlayLayers.map((l) =>
                      l.id === id ? { ...l, ...patch } : l
                    ),
                  }));
                }}
                onDeleteOverlayLayer={(id) => {
                  commitSnapshot(editState);
                  setEditState((prev) => ({
                    ...prev,
                    overlayLayers: prev.overlayLayers.filter((l) => l.id !== id),
                  }));
                }}
                onAddTextLayer={handleAddTextLayer}
                onUpdateTextLayer={(id, patch) => {
                  setEditState((prev) => ({
                    ...prev,
                    textLayers: prev.textLayers.map((t) =>
                      t.id === id ? { ...t, ...patch } : t
                    ),
                  }));
                }}
                onDeleteTextLayer={(id) => {
                  commitSnapshot(editState);
                  setEditState((prev) => ({
                    ...prev,
                    textLayers: prev.textLayers.filter((t) => t.id !== id),
                  }));
                }}
              />
            )}

            {activeTool === 'curves' && (
              <CurveEditor
                curves={editState.curves}
                onChange={(curves) => setEditState((prev) => ({ ...prev, curves }))}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            )}

            {activeTool === 'hsl' && (
              <HslPanel
                hsl={editState.hsl}
                onChange={(hsl) => setEditState((prev) => ({ ...prev, hsl }))}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            )}

            {activeTool === 'colorGrade' && (
              <ColorGradePanel
                colorGrade={editState.colorGrade}
                onChange={(colorGrade) =>
                  setEditState((prev) => ({ ...prev, colorGrade }))
                }
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            )}

            {activeTool === 'detail' && (
              <DetailEffectsPanel
                adjustments={editState.adjustments}
                onChange={updateAdjustment}
                onResetGroup={resetAdjustmentGroup}
                onScrubStart={beginScrub}
                onScrubEnd={endScrub}
              />
            )}

            {activeTool === 'crop' && (
              <CropPanel
                crop={editState.crop}
                origWidth={origDims.width}
                origHeight={origDims.height}
                onChange={(crop) => setEditState((prev) => ({ ...prev, crop }))}
                onCommit={() => commitSnapshot(editState)}
                onDone={() => setActiveTool('adjust')}
              />
            )}
          </div>
        </aside>
      </main>

      <ExportModal
        isOpen={isExportOpen}
        photoTitle={customPhotoTitle || activeSample.title}
        origWidth={origDims.width}
        origHeight={origDims.height}
        crop={editState.crop}
        isExporting={isExporting}
        onClose={() => setIsExportOpen(false)}
        onExport={handleExport}
      />

      <OfflineIndicator />
    </div>
  );
}
