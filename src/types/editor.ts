export type ToolTab =
  | 'adjust'
  | 'aiEnhance'
  | 'presets'
  | 'curves'
  | 'hsl'
  | 'colorGrade'
  | 'retouch'
  | 'layers'
  | 'detail'
  | 'crop';

export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue';

export type HslColorKey =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'aqua'
  | 'blue'
  | 'purple'
  | 'magenta';

export type PerformanceMode = 'auto' | 'standard' | 'eco';

export type AspectPreset = 'free' | 'original' | '1:1' | '4:5' | '3:2' | '16:9' | '9:16';

export type AiEnhanceMode =
  | 'auto-balance'
  | 'portrait-studio'
  | 'low-light'
  | 'hdr-crisp'
  | 'dehaze';

export type RetouchBrushMode = 'heal' | 'dodge' | 'burn' | 'saturate' | 'blur';

export type LayerBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'soft-light'
  | 'color-dodge';

export interface RetouchPoint {
  x: number; // normalized 0..1 of displayed canvas
  y: number; // normalized 0..1
}

export interface RetouchStroke {
  id: string;
  mode: RetouchBrushMode;
  size: number; // normalized diameter fraction (e.g. 0.04)
  feather: number; // 0..1
  strength: number; // 0..1
  points: RetouchPoint[];
}

export interface OverlayLayer {
  id: string;
  name: string;
  type: 'solid' | 'linear-gradient' | 'radial-glow';
  colorA: string;
  colorB: string;
  blendMode: LayerBlendMode;
  opacity: number; // 0..100
  visible: boolean;
}

export interface TextOverlayLayer {
  id: string;
  text: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  fontSize: number; // relative % of image width (e.g. 2..14)
  fontFamily: 'sans' | 'serif' | 'mono';
  color: string;
  opacity: number; // 0..100
  visible: boolean;
}

export interface ImageTelemetry {
  meanLuma: number; // 0..1
  dynamicRange: number; // 0..1 (p95 - p5)
  p5: number;
  p95: number;
  warmBias: number; // -1..1 (+ warm, - cool)
  tintBias: number; // -1..1 (+ magenta, - green)
  meanSat: number; // 0..1
  skinRatio: number; // 0..1
  hazeFloor: number; // 0..1
}

export interface CurvePoint {
  x: number; // 0..1
  y: number; // 0..1
}

export interface ToneCurves {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface HslAdjustment {
  hue: number; // -100..100
  saturation: number; // -100..100
  luminance: number; // -100..100
}

export type HslMixer = Record<HslColorKey, HslAdjustment>;

export interface ColorGradeSettings {
  shadowsHue: number; // 0..360
  shadowsSat: number; // 0..100
  midtonesHue: number; // 0..360
  midtonesSat: number; // 0..100
  highlightsHue: number; // 0..360
  highlightsSat: number; // 0..100
  balance: number; // -100..100
}

export interface CropRect {
  x: number; // 0..1
  y: number; // 0..1
  width: number; // 0..1
  height: number; // 0..1
}

export interface CropSettings extends CropRect {
  rotation90: 0 | 1 | 2 | 3; // clockwise 90-deg steps
  straighten: number; // -45..45 degrees
  flipH: boolean;
  flipV: boolean;
  aspectPreset: AspectPreset;
}

export interface BasicAdjustments {
  exposure: number; // -2.0..2.0 EV
  contrast: number; // -100..100
  highlights: number; // -100..100
  shadows: number; // -100..100
  whites: number; // -100..100
  blacks: number; // -100..100
  temperature: number; // -100..100
  tint: number; // -100..100
  vibrance: number; // -100..100
  saturation: number; // -100..100
  clarity: number; // -100..100
  sharpen: number; // 0..100
  noiseReduction: number; // 0..100
  vignetteAmount: number; // -100..100
  vignetteMidpoint: number; // 0..100
  grainAmount: number; // 0..100
  grainSize: number; // 10..100
  fade: number; // 0..100
  chromaticAberration: number; // 0..100
}

export interface EditState {
  adjustments: BasicAdjustments;
  curves: ToneCurves;
  hsl: HslMixer;
  colorGrade: ColorGradeSettings;
  crop: CropSettings;
  activePresetId: string | null;
  presetIntensity: number; // 0..100
  activeAiMode: AiEnhanceMode | null;
  aiStrength: number; // 0..100
  retouchStrokes: RetouchStroke[];
  overlayLayers: OverlayLayer[];
  textLayers: TextOverlayLayer[];
}

export interface PhotoPreset {
  id: string;
  name: string;
  category: 'film' | 'editorial' | 'monochrome' | 'custom';
  description: string;
  swatchColors: [string, string, string];
  adjustments: Partial<BasicAdjustments>;
  curves?: Partial<ToneCurves>;
  hsl?: Partial<HslMixer>;
  colorGrade?: Partial<ColorGradeSettings>;
}

export interface SamplePhoto {
  id: string;
  title: string;
  url: string;
  cameraMeta: string;
  category: string;
}

export interface HistogramData {
  r: number[]; // normalized 0..1, 64 bins
  g: number[];
  b: number[];
  luma: number[];
  shadowClipPct: number;
  highlightClipPct: number;
}

export interface ExportOptions {
  format: 'image/jpeg' | 'image/png' | 'image/webp';
  quality: number; // 0.1..1.0
  resolutionScale: 'full' | '2048' | '1200';
}
