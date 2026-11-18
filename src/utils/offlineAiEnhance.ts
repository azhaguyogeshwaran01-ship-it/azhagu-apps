import type {
  AiEnhanceMode,
  BasicAdjustments,
  EditState,
  ImageTelemetry,
} from '../types/editor';
import {
  clamp,
  createDefaultEditState,
  DEFAULT_ADJUSTMENTS,
} from './colorMath';

/**
 * Computes real pixel statistics from an RGBA buffer (typically downsampled ~140x140
 * so analysis completes in < 3ms on any low-end device, 100% offline).
 */
export function analyzeImageTelemetry(
  rgba: Uint8ClampedArray | Uint8Array
): ImageTelemetry {
  const totalPixels = Math.floor(rgba.length / 4);
  if (totalPixels <= 0) {
    return {
      meanLuma: 0.5,
      dynamicRange: 0.8,
      p5: 0.05,
      p95: 0.9,
      warmBias: 0,
      tintBias: 0,
      meanSat: 0.3,
      skinRatio: 0,
      hazeFloor: 0,
    };
  }

  const lumaHist = new Uint32Array(256);
  const darkChannelHist = new Uint32Array(256);
  let sumLuma = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let skinCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const r = rgba[idx] / 255;
    const g = rgba[idx + 1] / 255;
    const b = rgba[idx + 2] / 255;

    const luma = clamp(0.2126 * r + 0.7152 * g + 0.0722 * b, 0, 1);
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const sat = maxC > 0.01 ? (maxC - minC) / maxC : 0;

    sumLuma += luma;
    sumR += r;
    sumG += g;
    sumB += b;
    sumSat += sat;

    lumaHist[Math.round(luma * 255)]++;
    darkChannelHist[Math.round(minC * 255)]++;

    // Standard perceptual RGB skin-tone heuristic
    const r255 = rgba[idx];
    const g255 = rgba[idx + 1];
    const b255 = rgba[idx + 2];
    if (
      r255 > 95 &&
      g255 > 40 &&
      b255 > 20 &&
      Math.max(r255, g255, b255) - Math.min(r255, g255, b255) > 15 &&
      Math.abs(r255 - g255) > 15 &&
      r255 > g255 &&
      r255 > b255
    ) {
      skinCount++;
    }
  }

  const percentile = (hist: Uint32Array, pct: number) => {
    const target = totalPixels * pct;
    let acc = 0;
    for (let i = 0; i < 256; i++) {
      acc += hist[i];
      if (acc >= target) return i / 255;
    }
    return 1;
  };

  const p5 = percentile(lumaHist, 0.05);
  const p95 = percentile(lumaHist, 0.95);
  const hazeFloor = percentile(darkChannelHist, 0.05);

  const avgR = sumR / totalPixels;
  const avgG = sumG / totalPixels;
  const avgB = sumB / totalPixels;
  const avgAll = Math.max(0.05, (avgR + avgG + avgB) / 3);

  // Gray-world cast estimate
  const warmBias = clamp((avgR - avgB) / avgAll, -1, 1);
  const tintBias = clamp(((avgR + avgB) * 0.5 - avgG) / avgAll, -1, 1);

  return {
    meanLuma: Number((sumLuma / totalPixels).toFixed(3)),
    dynamicRange: Number(Math.max(0, p95 - p5).toFixed(3)),
    p5: Number(p5.toFixed(3)),
    p95: Number(p95.toFixed(3)),
    warmBias: Number(warmBias.toFixed(3)),
    tintBias: Number(tintBias.toFixed(3)),
    meanSat: Number((sumSat / totalPixels).toFixed(3)),
    skinRatio: Number((skinCount / totalPixels).toFixed(3)),
    hazeFloor: Number(hazeFloor.toFixed(3)),
  };
}

/**
 * Generates targeted non-destructive adjustments using on-device pixel telemetry
 * and scales them cleanly by strength (0..100%).
 */
export function computeAiEnhanceState(
  currentState: EditState,
  telemetry: ImageTelemetry,
  mode: AiEnhanceMode,
  strengthPct: number
): EditState {
  const next = createDefaultEditState();
  next.crop = { ...currentState.crop };
  next.retouchStrokes = currentState.retouchStrokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p })),
  }));
  next.overlayLayers = currentState.overlayLayers.map((l) => ({ ...l }));
  next.textLayers = currentState.textLayers.map((t) => ({ ...t }));
  next.activeAiMode = mode;
  next.aiStrength = clamp(strengthPct, 0, 100);

  const t = clamp(strengthPct / 100, 0, 1);
  const targetAdj: Partial<BasicAdjustments> = {};

  if (mode === 'auto-balance') {
    // Target pleasant 0.48-0.52 mean luminance + balanced contrast & white balance neutralization
    const expDelta = clamp((0.48 - telemetry.meanLuma) * 1.45, -0.7, 0.9);
    const contrastBoost = telemetry.dynamicRange < 0.68 ? 24 : 10;
    const shadowLift = telemetry.p5 < 0.1 ? 26 : 12;
    const highlightRec = telemetry.p95 > 0.85 ? -22 : -8;
    const tempFix = clamp(-telemetry.warmBias * 18, -18, 18);
    const tintFix = clamp(-telemetry.tintBias * 14, -12, 12);
    const vibBoost = telemetry.meanSat < 0.35 ? 24 : 12;

    targetAdj.exposure = Number(expDelta.toFixed(2));
    targetAdj.contrast = contrastBoost;
    targetAdj.shadows = shadowLift;
    targetAdj.highlights = highlightRec;
    targetAdj.whites = telemetry.p95 < 0.82 ? 16 : 4;
    targetAdj.blacks = telemetry.p5 > 0.08 ? -14 : 0;
    targetAdj.temperature = Math.round(tempFix);
    targetAdj.tint = Math.round(tintFix);
    targetAdj.vibrance = vibBoost;
    targetAdj.clarity = 14;
    targetAdj.sharpen = 16;
  } else if (mode === 'portrait-studio') {
    // Warm soft key light, skin-smoothing bilateral-like denoise, soft highlight rolloff
    const expDelta = clamp((0.52 - telemetry.meanLuma) * 1.2, -0.35, 0.65);
    targetAdj.exposure = Number(expDelta.toFixed(2));
    targetAdj.contrast = 8;
    targetAdj.highlights = -24;
    targetAdj.shadows = 28;
    targetAdj.temperature = 8;
    targetAdj.tint = 4;
    targetAdj.vibrance = 14;
    targetAdj.saturation = -4;
    targetAdj.clarity = -10; // softens skin micro-blemishes gently
    targetAdj.noiseReduction = 28;
    targetAdj.sharpen = 12;
    targetAdj.vignetteAmount = -14;
    targetAdj.vignetteMidpoint = 55;

    next.curves.rgb = [
      { x: 0, y: Number((0.02 * t).toFixed(3)) },
      { x: 0.25, y: Number((0.25 + 0.03 * t).toFixed(3)) },
      { x: 0.75, y: Number((0.75 + 0.02 * t).toFixed(3)) },
      { x: 1, y: 1 },
    ];
  } else if (mode === 'low-light') {
    // Rescues underexposed shadow regions while suppressing chroma/luma grain
    const expDelta = clamp((0.46 - telemetry.meanLuma) * 1.85, 0.2, 1.25);
    targetAdj.exposure = Number(expDelta.toFixed(2));
    targetAdj.contrast = 12;
    targetAdj.highlights = -26;
    targetAdj.shadows = 46;
    targetAdj.blacks = 12;
    targetAdj.vibrance = 16;
    targetAdj.noiseReduction = 48;
    targetAdj.clarity = 10;
    targetAdj.sharpen = 18;
  } else if (mode === 'hdr-crisp') {
    // Full dynamic range compression + crisp micro-contrast + vivid local detail
    targetAdj.exposure = Number(clamp((0.49 - telemetry.meanLuma) * 0.9, -0.4, 0.5).toFixed(2));
    targetAdj.contrast = 18;
    targetAdj.highlights = -42;
    targetAdj.shadows = 42;
    targetAdj.whites = 14;
    targetAdj.blacks = -16;
    targetAdj.vibrance = 22;
    targetAdj.clarity = 34;
    targetAdj.sharpen = 32;
  } else if (mode === 'dehaze') {
    // Dark-channel haze removal: deepens black floor, restores atmospheric contrast & color
    const hazeStrength = clamp(telemetry.hazeFloor * 4.5 + 0.35, 0.35, 1.0);
    targetAdj.contrast = Math.round(28 * hazeStrength);
    targetAdj.blacks = Math.round(-30 * hazeStrength);
    targetAdj.shadows = -10;
    targetAdj.highlights = -16;
    targetAdj.clarity = Math.round(32 * hazeStrength);
    targetAdj.vibrance = Math.round(26 * hazeStrength);
    targetAdj.saturation = 8;
    targetAdj.sharpen = 20;
  }

  (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof BasicAdjustments)[]).forEach((k) => {
    const base = DEFAULT_ADJUSTMENTS[k];
    const target = targetAdj[k] ?? base;
    next.adjustments[k] = Number((base + (target - base) * t).toFixed(2));
  });

  return next;
}
