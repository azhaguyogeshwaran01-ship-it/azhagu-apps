import type {
  AspectPreset,
  BasicAdjustments,
  ColorGradeSettings,
  CropRect,
  CropSettings,
  CurvePoint,
  EditState,
  HslColorKey,
  HslMixer,
  PerformanceMode,
  PhotoPreset,
  ToneCurves,
} from '../types/editor';

export const HSL_COLOR_KEYS: HslColorKey[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
];

export const DEFAULT_ADJUSTMENTS: BasicAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  vibrance: 0,
  saturation: 0,
  clarity: 0,
  sharpen: 0,
  noiseReduction: 0,
  vignetteAmount: 0,
  vignetteMidpoint: 50,
  grainAmount: 0,
  grainSize: 35,
  fade: 0,
  chromaticAberration: 0,
};

export function createDefaultCurves(): ToneCurves {
  return {
    rgb: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    red: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    green: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    blue: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
  };
}

export function createDefaultHsl(): HslMixer {
  return {
    red: { hue: 0, saturation: 0, luminance: 0 },
    orange: { hue: 0, saturation: 0, luminance: 0 },
    yellow: { hue: 0, saturation: 0, luminance: 0 },
    green: { hue: 0, saturation: 0, luminance: 0 },
    aqua: { hue: 0, saturation: 0, luminance: 0 },
    blue: { hue: 0, saturation: 0, luminance: 0 },
    purple: { hue: 0, saturation: 0, luminance: 0 },
    magenta: { hue: 0, saturation: 0, luminance: 0 },
  };
}

export const DEFAULT_COLOR_GRADE: ColorGradeSettings = {
  shadowsHue: 215,
  shadowsSat: 0,
  midtonesHue: 40,
  midtonesSat: 0,
  highlightsHue: 42,
  highlightsSat: 0,
  balance: 0,
};

export const DEFAULT_CROP: CropSettings = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  rotation90: 0,
  straighten: 0,
  flipH: false,
  flipV: false,
  aspectPreset: 'free',
};

export function createDefaultEditState(): EditState {
  return {
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    curves: createDefaultCurves(),
    hsl: createDefaultHsl(),
    colorGrade: { ...DEFAULT_COLOR_GRADE },
    crop: { ...DEFAULT_CROP },
    activePresetId: null,
    presetIntensity: 100,
    activeAiMode: null,
    aiStrength: 80,
    retouchStrokes: [],
    overlayLayers: [],
    textLayers: [],
  };
}

export function cloneEditState(state: EditState): EditState {
  return {
    adjustments: { ...state.adjustments },
    curves: {
      rgb: state.curves.rgb.map((p) => ({ ...p })),
      red: state.curves.red.map((p) => ({ ...p })),
      green: state.curves.green.map((p) => ({ ...p })),
      blue: state.curves.blue.map((p) => ({ ...p })),
    },
    hsl: HSL_COLOR_KEYS.reduce((acc, key) => {
      acc[key] = { ...state.hsl[key] };
      return acc;
    }, {} as HslMixer),
    colorGrade: { ...state.colorGrade },
    crop: { ...state.crop },
    activePresetId: state.activePresetId,
    presetIntensity: state.presetIntensity,
    activeAiMode: state.activeAiMode,
    aiStrength: state.aiStrength,
    retouchStrokes: state.retouchStrokes.map((s) => ({
      ...s,
      points: s.points.map((pt) => ({ ...pt })),
    })),
    overlayLayers: state.overlayLayers.map((l) => ({ ...l })),
    textLayers: state.textLayers.map((t) => ({ ...t })),
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Monotonic cubic Hermite spline (Fritsch-Carlson) for smooth, artifact-free
 * 256-entry tone curve evaluation. Guarantees values remain clamped in [0, 255].
 */
export function evaluateSplineCurve(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  const sorted = [...points]
    .map((p) => ({ x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1) }))
    .sort((a, b) => a.x - b.x);

  if (sorted.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Deduplicate closely spaced X points
  const pts: CurvePoint[] = [];
  for (const pt of sorted) {
    if (pts.length === 0 || pt.x - pts[pts.length - 1].x > 0.002) {
      pts.push(pt);
    } else {
      pts[pts.length - 1] = pt;
    }
  }

  if (pts.length === 1) {
    const val = Math.round(pts[0].y * 255);
    lut.fill(val);
    return lut;
  }

  const n = pts.length;
  const dx = new Float64Array(n - 1);
  const dy = new Float64Array(n - 1);
  const slopes = new Float64Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-5, pts[i + 1].x - pts[i].x);
    dy[i] = pts[i + 1].y - pts[i].y;
    slopes[i] = dy[i] / dx[i];
  }

  const tangents = new Float64Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (slopes[i - 1] * slopes[i] <= 0) {
      tangents[i] = 0;
    } else {
      const m0 = slopes[i - 1];
      const m1 = slopes[i];
      const w1 = 2 * dx[i] + dx[i - 1];
      const w2 = dx[i] + 2 * dx[i - 1];
      tangents[i] = (w1 + w2) / (w1 / m0 + w2 / m1);
    }
  }

  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    if (x <= pts[0].x) {
      lut[i] = Math.round(clamp(pts[0].y, 0, 1) * 255);
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[i] = Math.round(clamp(pts[n - 1].y, 0, 1) * 255);
      continue;
    }

    // Find segment
    let seg = 0;
    while (seg < n - 2 && x > pts[seg + 1].x) {
      seg++;
    }

    const h = dx[seg];
    const t = (x - pts[seg].x) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y =
      h00 * pts[seg].y +
      h10 * h * tangents[seg] +
      h01 * pts[seg + 1].y +
      h11 * h * tangents[seg + 1];

    lut[i] = Math.round(clamp(y, 0, 1) * 255);
  }

  return lut;
}

/**
 * Packs RGB, Red, Green, Blue 256-entry curves into a 256x1 RGBA byte buffer
 * (R=red, G=green, B=blue, A=master rgb curve) for single-texture GPU lookup.
 */
export function buildCurveLutRGBA(curves: ToneCurves): Uint8Array {
  const rgb = evaluateSplineCurve(curves.rgb);
  const red = evaluateSplineCurve(curves.red);
  const green = evaluateSplineCurve(curves.green);
  const blue = evaluateSplineCurve(curves.blue);

  const rgba = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    rgba[i * 4 + 0] = red[i];
    rgba[i * 4 + 1] = green[i];
    rgba[i * 4 + 2] = blue[i];
    rgba[i * 4 + 3] = rgb[i];
  }
  return rgba;
}

/**
 * Blends a preset onto a clean color state (preserving geometry/crop) with an
 * intensity percentage from 0 to 100.
 */
export function applyPresetWithIntensity(
  currentCrop: CropSettings,
  preset: PhotoPreset,
  intensityPct: number
): EditState {
  const t = clamp(intensityPct / 100, 0, 1);
  const next = createDefaultEditState();
  next.crop = { ...currentCrop };
  next.activePresetId = preset.id;
  next.presetIntensity = clamp(intensityPct, 0, 100);

  (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof BasicAdjustments)[]).forEach((key) => {
    const baseVal = DEFAULT_ADJUSTMENTS[key];
    const targetVal = preset.adjustments[key] ?? baseVal;
    next.adjustments[key] = Number((baseVal + (targetVal - baseVal) * t).toFixed(2));
  });

  if (preset.colorGrade) {
    next.colorGrade = {
      shadowsHue: preset.colorGrade.shadowsHue ?? DEFAULT_COLOR_GRADE.shadowsHue,
      shadowsSat: Math.round((preset.colorGrade.shadowsSat ?? 0) * t),
      midtonesHue: preset.colorGrade.midtonesHue ?? DEFAULT_COLOR_GRADE.midtonesHue,
      midtonesSat: Math.round((preset.colorGrade.midtonesSat ?? 0) * t),
      highlightsHue: preset.colorGrade.highlightsHue ?? DEFAULT_COLOR_GRADE.highlightsHue,
      highlightsSat: Math.round((preset.colorGrade.highlightsSat ?? 0) * t),
      balance: Math.round((preset.colorGrade.balance ?? 0) * t),
    };
  }

  if (preset.hsl) {
    for (const key of HSL_COLOR_KEYS) {
      const target = preset.hsl[key];
      if (target) {
        next.hsl[key] = {
          hue: Math.round(target.hue * t),
          saturation: Math.round(target.saturation * t),
          luminance: Math.round(target.luminance * t),
        };
      }
    }
  }

  if (preset.curves) {
    const channels: (keyof ToneCurves)[] = ['rgb', 'red', 'green', 'blue'];
    for (const ch of channels) {
      const targetPts = preset.curves[ch];
      if (targetPts && targetPts.length >= 2) {
        // Blend curve points by sampling target LUT against linear ramp
        const targetLut = evaluateSplineCurve(targetPts);
        if (t >= 0.99) {
          next.curves[ch] = targetPts.map((p) => ({ ...p }));
        } else if (t <= 0.01) {
          next.curves[ch] = [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ];
        } else {
          // Sample 5 anchor points along blended spline for crisp interactive curve handles
          const anchors = [0, 0.25, 0.5, 0.75, 1];
          next.curves[ch] = anchors.map((ax) => {
            const idx = Math.round(ax * 255);
            const targetY = targetLut[idx] / 255;
            return {
              x: ax,
              y: Number((ax + (targetY - ax) * t).toFixed(3)),
            };
          });
        }
      }
    }
  }

  return next;
}

/**
 * Computes proxy preview dimensions capped by maxDim while preserving aspect ratio.
 */
export function computeProxyDimensions(
  origW: number,
  origH: number,
  maxDim: number
): { width: number; height: number; scale: number } {
  if (origW <= 0 || origH <= 0) {
    return { width: 1, height: 1, scale: 1 };
  }
  const largest = Math.max(origW, origH);
  if (largest <= maxDim) {
    return { width: origW, height: origH, scale: 1 };
  }
  const scale = maxDim / largest;
  return {
    width: Math.max(1, Math.round(origW * scale)),
    height: Math.max(1, Math.round(origH * scale)),
    scale,
  };
}

export function getOrientedDimensions(
  w: number,
  h: number,
  rotation90: 0 | 1 | 2 | 3
): { width: number; height: number } {
  return rotation90 % 2 === 1 ? { width: h, height: w } : { width: w, height: h };
}

export function getAspectRatioNumeric(
  preset: AspectPreset,
  orientedW: number,
  orientedH: number
): number | null {
  switch (preset) {
    case 'free':
      return null;
    case 'original':
      return orientedH > 0 ? orientedW / orientedH : 1;
    case '1:1':
      return 1;
    case '4:5':
      return 4 / 5;
    case '3:2':
      return 3 / 2;
    case '16:9':
      return 16 / 9;
    case '9:16':
      return 9 / 16;
  }
}

/**
 * Fits a normalized crop box [0,1] to a desired pixel aspect ratio (relative to oriented image dimensions).
 */
export function fitCropToAspectRatio(
  current: CropRect,
  targetPixelAspect: number | null,
  orientedW: number,
  orientedH: number
): CropRect {
  const minSize = 0.08;
  const x = clamp(current.x, 0, 1 - minSize);
  const y = clamp(current.y, 0, 1 - minSize);
  const width = clamp(current.width, minSize, 1 - x);
  const height = clamp(current.height, minSize, 1 - y);

  if (!targetPixelAspect || orientedW <= 0 || orientedH <= 0) {
    return { x, y, width, height };
  }

  // In normalized coords, (width * orientedW) / (height * orientedH) = targetPixelAspect
  // So normalized ratio normRatio = width / height = targetPixelAspect * (orientedH / orientedW)
  const normRatio = targetPixelAspect * (orientedH / orientedW);
  const cx = x + width / 2;
  const cy = y + height / 2;

  let nextW = width;
  let nextH = nextW / normRatio;

  if (nextH > 1) {
    nextH = 1;
    nextW = nextH * normRatio;
  }
  if (nextW > 1) {
    nextW = 1;
    nextH = nextW / normRatio;
  }
  if (nextW < minSize) {
    nextW = minSize;
    nextH = nextW / normRatio;
  }
  if (nextH < minSize) {
    nextH = minSize;
    nextW = nextH * normRatio;
  }

  const nextX = clamp(cx - nextW / 2, 0, 1 - nextW);
  const nextY = clamp(cy - nextH / 2, 0, 1 - nextH);

  return {
    x: Number(nextX.toFixed(4)),
    y: Number(nextY.toFixed(4)),
    width: Number(nextW.toFixed(4)),
    height: Number(nextH.toFixed(4)),
  };
}

export function getCroppedExportDimensions(
  origW: number,
  origH: number,
  crop: CropSettings,
  resolutionScale: 'full' | '2048' | '1200'
): { width: number; height: number } {
  const oriented = getOrientedDimensions(origW, origH, crop.rotation90);
  const rawW = Math.max(1, Math.round(oriented.width * crop.width));
  const rawH = Math.max(1, Math.round(oriented.height * crop.height));

  if (resolutionScale === 'full') {
    return { width: rawW, height: rawH };
  }

  const cap = resolutionScale === '2048' ? 2048 : 1200;
  const scaled = computeProxyDimensions(rawW, rawH, cap);
  return { width: scaled.width, height: scaled.height };
}

export function detectDevicePerformanceTier(): 'standard' | 'eco' {
  if (typeof navigator === 'undefined') return 'standard';
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 4 || memory <= 4) {
    return 'eco';
  }
  return 'standard';
}

export function resolveEffectiveTier(mode: PerformanceMode): 'standard' | 'eco' {
  if (mode === 'auto') {
    return detectDevicePerformanceTier();
  }
  return mode;
}

export function hasAnyColorEdits(state: EditState): boolean {
  for (const key of Object.keys(DEFAULT_ADJUSTMENTS) as (keyof BasicAdjustments)[]) {
    if (Math.abs(state.adjustments[key] - DEFAULT_ADJUSTMENTS[key]) > 0.001) {
      return true;
    }
  }
  for (const ch of ['rgb', 'red', 'green', 'blue'] as (keyof ToneCurves)[]) {
    const pts = state.curves[ch];
    if (
      pts.length !== 2 ||
      Math.abs(pts[0].x) > 0.001 ||
      Math.abs(pts[0].y) > 0.001 ||
      Math.abs(pts[1].x - 1) > 0.001 ||
      Math.abs(pts[1].y - 1) > 0.001
    ) {
      return true;
    }
  }
  for (const key of HSL_COLOR_KEYS) {
    const h = state.hsl[key];
    if (h.hue !== 0 || h.saturation !== 0 || h.luminance !== 0) {
      return true;
    }
  }
  if (
    state.colorGrade.shadowsSat > 0 ||
    state.colorGrade.midtonesSat > 0 ||
    state.colorGrade.highlightsSat > 0 ||
    state.colorGrade.balance !== 0
  ) {
    return true;
  }
  if (
    state.activeAiMode !== null ||
    state.retouchStrokes.length > 0 ||
    state.overlayLayers.length > 0 ||
    state.textLayers.length > 0
  ) {
    return true;
  }
  return false;
}

export function hasAnyCropEdits(crop: CropSettings): boolean {
  return (
    Math.abs(crop.x) > 0.001 ||
    Math.abs(crop.y) > 0.001 ||
    Math.abs(crop.width - 1) > 0.001 ||
    Math.abs(crop.height - 1) > 0.001 ||
    crop.rotation90 !== 0 ||
    Math.abs(crop.straighten) > 0.01 ||
    crop.flipH ||
    crop.flipV
  );
}
