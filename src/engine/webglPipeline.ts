import type { EditState, ExportOptions, HistogramData } from '../types/editor';
import {
  buildCurveLutRGBA,
  computeProxyDimensions,
  getCroppedExportDimensions,
  getOrientedDimensions,
  HSL_COLOR_KEYS,
} from '../utils/colorMath';
import { compositePhotoshopLayers } from './layerCompositor';

const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Single-pass GPU fragment shader combining geometry, tone mapping, curves LUT,
// 8-band HSL mixer, 3-way color grading, clarity/sharpen/denoise, optics & split compare.
const FRAGMENT_SHADER = `
precision highp float;

varying vec2 v_uv;

uniform sampler2D u_image;
uniform sampler2D u_curveLut;
uniform vec2 u_texSize;

// Geometry
uniform vec4 u_cropRect; // x, y, w, h in oriented normalized coords
uniform float u_rotation90; // 0, 1, 2, 3
uniform float u_straightenRad;
uniform vec2 u_flip; // (flipH ? -1 : 1, flipV ? -1 : 1)
uniform float u_imageAspect; // orientedW / orientedH
uniform float u_showFullForCrop;

// Split compare: -1 disabled, else 0..1 screen X threshold
uniform float u_splitX;

// Basic Light & Color
uniform float u_exposure;
uniform float u_contrast;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;
uniform float u_temperature;
uniform float u_tint;
uniform float u_vibrance;
uniform float u_saturation;

// Detail & FX
uniform float u_clarity;
uniform float u_sharpen;
uniform float u_noiseReduction;
uniform float u_vignetteAmount;
uniform float u_vignetteMidpoint;
uniform float u_grainAmount;
uniform float u_grainSize;
uniform float u_fade;
uniform float u_chromaticAberration;
uniform float u_fastPreview; // 1.0 skips multi-tap kernels during active drag on eco mode

// 8-band HSL Mixer (hue, sat, lum)
uniform vec3 u_hsl[8];

// 3-Way Color Grading (hue 0..1, sat 0..1)
uniform vec2 u_gradeShadows;
uniform vec2 u_gradeMidtones;
uniform vec2 u_gradeHighlights;
uniform float u_gradeBalance;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 rgb2hsl(vec3 c) {
  float maxC = max(max(c.r, c.g), c.b);
  float minC = min(min(c.r, c.g), c.b);
  float l = (maxC + minC) * 0.5;
  float s = 0.0;
  float h = 0.0;
  if (maxC != minC) {
    float d = maxC - minC;
    s = l > 0.5 ? d / (2.0 - maxC - minC) : d / (maxC + minC);
    if (maxC == c.r) {
      h = (c.g - c.b) / d + (c.g < c.b ? 6.0 : 0.0);
    } else if (maxC == c.g) {
      h = (c.b - c.r) / d + 2.0;
    } else {
      h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;
  }
  return vec3(h, s, l);
}

float hue2rgb(float p, float q, float t) {
  if (t < 0.0) t += 1.0;
  if (t > 1.0) t -= 1.0;
  if (t < 1.0 / 6.0) return p + (q - p) * 6.0 * t;
  if (t < 1.0 / 2.0) return q;
  if (t < 2.0 / 3.0) return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
  return p;
}

vec3 hsl2rgb(vec3 hsl) {
  if (hsl.y <= 0.0001) return vec3(hsl.z);
  float q = hsl.z < 0.5 ? hsl.z * (1.0 + hsl.y) : hsl.z + hsl.y - hsl.z * hsl.y;
  float p = 2.0 * hsl.z - q;
  return vec3(
    hue2rgb(p, q, hsl.x + 1.0 / 3.0),
    hue2rgb(p, q, hsl.x),
    hue2rgb(p, q, hsl.x - 1.0 / 3.0)
  );
}

float hueDistance(float h1, float h2) {
  float d = abs(h1 - h2);
  return min(d, 1.0 - d);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Map oriented UV [0,1] into raw texture UV applying rotation90, flip, straighten
vec2 mapOrientedToRaw(vec2 orientedUv) {
  vec2 p = orientedUv - 0.5;
  // Flip
  p.x *= u_flip.x;
  p.y *= u_flip.y;

  // Straighten around center preserving aspect
  if (abs(u_straightenRad) > 0.0001) {
    float c = cos(-u_straightenRad);
    float s = sin(-u_straightenRad);
    vec2 pa = vec2(p.x * u_imageAspect, p.y);
    vec2 pr = vec2(pa.x * c - pa.y * s, pa.x * s + pa.y * c);
    p = vec2(pr.x / u_imageAspect, pr.y);
  }

  vec2 uv = p + 0.5;

  // Inverse 90-degree clockwise rotations
  float r = floor(u_rotation90 + 0.5);
  if (r > 0.5 && r < 1.5) {
    uv = vec2(uv.y, 1.0 - uv.x);
  } else if (r > 1.5 && r < 2.5) {
    uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  } else if (r > 2.5) {
    uv = vec2(1.0 - uv.y, uv.x);
  }
  return uv;
}

vec3 sampleRawClamped(vec2 rawUv) {
  vec2 clamped = clamp(rawUv, vec2(0.0), vec2(1.0));
  return texture2D(u_image, clamped).rgb;
}

void main() {
  // Determine oriented UV
  vec2 orientedUv = u_showFullForCrop > 0.5
    ? v_uv
    : u_cropRect.xy + v_uv * u_cropRect.zw;

  vec2 rawUv = mapOrientedToRaw(orientedUv);

  // Subtle dark border if straighten pulls corner slightly outside [0,1]
  if (rawUv.x < 0.0 || rawUv.x > 1.0 || rawUv.y < 0.0 || rawUv.y > 1.0) {
    gl_FragColor = vec4(0.055, 0.058, 0.07, 1.0);
    return;
  }

  vec3 origCol = sampleRawClamped(rawUv);

  // Before/After split view: left side shows original ungraded pixels
  if (u_splitX >= 0.0 && v_uv.x < u_splitX) {
    gl_FragColor = vec4(origCol, 1.0);
    return;
  }

  vec3 col = origCol;

  // 1. Chromatic aberration (subtle radial R/B dispersion)
  if (u_chromaticAberration > 0.001 && u_fastPreview < 0.5) {
    vec2 dir = (rawUv - 0.5) * (u_chromaticAberration * 0.0045);
    col.r = sampleRawClamped(rawUv + dir).r;
    col.b = sampleRawClamped(rawUv - dir).b;
  }

  // 2. Local spatial pass: Clarity, Sharpen, Noise Reduction (skipped during drag on Eco mode)
  if (u_fastPreview < 0.5 && (abs(u_clarity) > 0.001 || u_sharpen > 0.001 || u_noiseReduction > 0.001)) {
    vec2 px = 1.0 / max(u_texSize, vec2(1.0));
    vec3 n1 = sampleRawClamped(rawUv + vec2(px.x, 0.0));
    vec3 n2 = sampleRawClamped(rawUv - vec2(px.x, 0.0));
    vec3 n3 = sampleRawClamped(rawUv + vec2(0.0, px.y));
    vec3 n4 = sampleRawClamped(rawUv - vec2(0.0, px.y));
    vec3 avg4 = (n1 + n2 + n3 + n4) * 0.25;

    if (u_noiseReduction > 0.001) {
      float diff = length(col - avg4);
      float edgeMask = 1.0 - smoothstep(0.02, 0.16, diff);
      col = mix(col, avg4, u_noiseReduction * 0.75 * edgeMask);
    }

    if (u_sharpen > 0.001) {
      vec3 detail = col - avg4;
      col += detail * (u_sharpen * 1.35);
    }

    if (abs(u_clarity) > 0.001) {
      vec2 widePx = px * 2.5;
      vec3 w1 = sampleRawClamped(rawUv + vec2(widePx.x, widePx.y));
      vec3 w2 = sampleRawClamped(rawUv + vec2(-widePx.x, widePx.y));
      vec3 w3 = sampleRawClamped(rawUv + vec2(widePx.x, -widePx.y));
      vec3 w4 = sampleRawClamped(rawUv + vec2(-widePx.x, -widePx.y));
      vec3 blurWide = (w1 + w2 + w3 + w4 + avg4) * 0.2;
      float midMask = 1.0 - abs(luma(col) * 2.0 - 1.0);
      col += (col - blurWide) * (u_clarity * 0.85 * midMask);
    }
    col = clamp(col, 0.0, 1.0);
  }

  // 3. White balance (Temperature & Tint)
  if (abs(u_temperature) > 0.001 || abs(u_tint) > 0.001) {
    float t = u_temperature * 0.32;
    float g = u_tint * 0.24;
    col.r *= (1.0 + t * 0.55 + g * 0.25);
    col.g *= (1.0 - g * 0.45);
    col.b *= (1.0 - t * 0.55 + g * 0.25);
  }

  // 4. Exposure (photographic EV multiplier)
  if (abs(u_exposure) > 0.001) {
    col *= pow(2.0, u_exposure);
  }

  // 5. Highlights, Shadows, Whites, Blacks
  float lum = luma(clamp(col, 0.0, 1.0));
  if (abs(u_highlights) > 0.001) {
    float hiMask = smoothstep(0.45, 0.95, lum);
    col += col * (u_highlights * 0.55 * hiMask);
  }
  if (abs(u_shadows) > 0.001) {
    float shMask = 1.0 - smoothstep(0.05, 0.58, lum);
    col += (1.0 - col) * (u_shadows * 0.42 * shMask) * (col + 0.12);
  }
  if (abs(u_whites) > 0.001) {
    float wMask = smoothstep(0.65, 1.0, lum);
    col += u_whites * 0.28 * wMask;
  }
  if (abs(u_blacks) > 0.001) {
    float bMask = 1.0 - smoothstep(0.0, 0.35, lum);
    col += u_blacks * 0.22 * bMask;
  }

  // 6. Contrast (smooth filmic pivot around 0.5)
  if (abs(u_contrast) > 0.001) {
    float cFactor = 1.0 + u_contrast * 0.85;
    col = (col - 0.5) * cFactor + 0.5;
  }

  col = clamp(col, 0.0, 1.0);

  // 7. Tone Curve LUT lookup (Master RGB + R, G, B channels)
  float rCurve = texture2D(u_curveLut, vec2(col.r, 0.5)).r;
  float gCurve = texture2D(u_curveLut, vec2(col.g, 0.5)).g;
  float bCurve = texture2D(u_curveLut, vec2(col.b, 0.5)).b;
  col = vec3(
    texture2D(u_curveLut, vec2(rCurve, 0.5)).a,
    texture2D(u_curveLut, vec2(gCurve, 0.5)).a,
    texture2D(u_curveLut, vec2(bCurve, 0.5)).a
  );

  // 8. 8-Band HSL Color Mixer
  vec3 hsl = rgb2hsl(col);
  if (hsl.y > 0.01) {
    // Hue centers: Red(0), Orange(0.083), Yellow(0.167), Green(0.333), Aqua(0.5), Blue(0.667), Purple(0.778), Magenta(0.917)
    float centers[8];
    centers[0] = 0.0;
    centers[1] = 0.0833;
    centers[2] = 0.1667;
    centers[3] = 0.3333;
    centers[4] = 0.5;
    centers[5] = 0.6667;
    centers[6] = 0.7778;
    centers[7] = 0.9167;

    float hueShift = 0.0;
    float satShift = 0.0;
    float lumShift = 0.0;
    float satWeight = smoothstep(0.02, 0.18, hsl.y);

    for (int i = 0; i < 8; i++) {
      float d = hueDistance(hsl.x, centers[i]);
      float w = max(0.0, 1.0 - d / 0.125);
      w = w * w * (3.0 - 2.0 * w);
      hueShift += u_hsl[i].x * w;
      satShift += u_hsl[i].y * w;
      lumShift += u_hsl[i].z * w;
    }

    hsl.x = fract(hsl.x + hueShift * 0.08 * satWeight);
    hsl.y = clamp(hsl.y * (1.0 + satShift * 0.85), 0.0, 1.0);
    hsl.z = clamp(hsl.z + lumShift * 0.25 * satWeight * (1.0 - abs(hsl.z * 2.0 - 1.0)), 0.0, 1.0);
    col = hsl2rgb(hsl);
  }

  // 9. 3-Way Color Grading (Shadows / Midtones / Highlights)
  if (u_gradeShadows.y > 0.001 || u_gradeMidtones.y > 0.001 || u_gradeHighlights.y > 0.001) {
    float gLum = clamp(luma(col) + u_gradeBalance * 0.2, 0.0, 1.0);
    float sW = 1.0 - smoothstep(0.0, 0.5, gLum);
    float hW = smoothstep(0.5, 1.0, gLum);
    float mW = max(0.0, 1.0 - sW - hW);

    vec3 sTint = hsl2rgb(vec3(u_gradeShadows.x, 0.75, 0.5)) - 0.5;
    vec3 mTint = hsl2rgb(vec3(u_gradeMidtones.x, 0.75, 0.5)) - 0.5;
    vec3 hTint = hsl2rgb(vec3(u_gradeHighlights.x, 0.75, 0.5)) - 0.5;

    col += sTint * (u_gradeShadows.y * 0.35 * sW);
    col += mTint * (u_gradeMidtones.y * 0.32 * mW);
    col += hTint * (u_gradeHighlights.y * 0.35 * hW);
    col = clamp(col, 0.0, 1.0);
  }

  // 10. Vibrance & Saturation
  if (abs(u_vibrance) > 0.001) {
    float avg = (col.r + col.g + col.b) / 3.0;
    float mx = max(col.r, max(col.g, col.b));
    float amt = (abs(mx - avg) * -3.0) * u_vibrance;
    // Protect skin tones slightly
    col = mix(col, vec3(mx), amt * -0.35);
    float l = luma(col);
    float sat = mx - min(col.r, min(col.g, col.b));
    col = mix(vec3(l), col, 1.0 + u_vibrance * (1.0 - sat) * 0.85);
  }

  if (abs(u_saturation) > 0.001) {
    float l = luma(col);
    col = mix(vec3(l), col, 1.0 + u_saturation);
  }

  // 11. Matte Fade (lifts black floor gently)
  if (u_fade > 0.001) {
    float lift = u_fade * 0.14;
    col = col * (1.0 - lift * 0.65) + lift;
  }

  // 12. Procedural Film Grain
  if (u_grainAmount > 0.001) {
    vec2 grainCoord = floor(v_uv * (u_texSize / max(1.0, u_grainSize * 2.5)));
    float n = hash12(grainCoord) - 0.5;
    float midWeight = 1.0 - abs(luma(col) * 2.0 - 1.0) * 0.5;
    col += n * (u_grainAmount * 0.24 * midWeight);
  }

  // 13. Vignette
  if (abs(u_vignetteAmount) > 0.001) {
    float dist = distance(v_uv, vec2(0.5));
    float mid = mix(0.25, 0.78, u_vignetteMidpoint);
    float vig = smoothstep(mid - 0.25, mid + 0.42, dist);
    col = mix(col, col * (1.0 + u_vignetteAmount * 0.85), vig);
  }

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

interface ProgramUniforms {
  u_image: WebGLUniformLocation | null;
  u_curveLut: WebGLUniformLocation | null;
  u_texSize: WebGLUniformLocation | null;
  u_cropRect: WebGLUniformLocation | null;
  u_rotation90: WebGLUniformLocation | null;
  u_straightenRad: WebGLUniformLocation | null;
  u_flip: WebGLUniformLocation | null;
  u_imageAspect: WebGLUniformLocation | null;
  u_showFullForCrop: WebGLUniformLocation | null;
  u_splitX: WebGLUniformLocation | null;
  u_exposure: WebGLUniformLocation | null;
  u_contrast: WebGLUniformLocation | null;
  u_highlights: WebGLUniformLocation | null;
  u_shadows: WebGLUniformLocation | null;
  u_whites: WebGLUniformLocation | null;
  u_blacks: WebGLUniformLocation | null;
  u_temperature: WebGLUniformLocation | null;
  u_tint: WebGLUniformLocation | null;
  u_vibrance: WebGLUniformLocation | null;
  u_saturation: WebGLUniformLocation | null;
  u_clarity: WebGLUniformLocation | null;
  u_sharpen: WebGLUniformLocation | null;
  u_noiseReduction: WebGLUniformLocation | null;
  u_vignetteAmount: WebGLUniformLocation | null;
  u_vignetteMidpoint: WebGLUniformLocation | null;
  u_grainAmount: WebGLUniformLocation | null;
  u_grainSize: WebGLUniformLocation | null;
  u_fade: WebGLUniformLocation | null;
  u_chromaticAberration: WebGLUniformLocation | null;
  u_fastPreview: WebGLUniformLocation | null;
  u_hsl: (WebGLUniformLocation | null)[];
  u_gradeShadows: WebGLUniformLocation | null;
  u_gradeMidtones: WebGLUniformLocation | null;
  u_gradeHighlights: WebGLUniformLocation | null;
  u_gradeBalance: WebGLUniformLocation | null;
}

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext): {
  program: WebGLProgram;
  uniforms: ProgramUniforms;
  posAttr: number;
} | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Program link error:', gl.getProgramInfoLog(program));
    return null;
  }

  const posAttr = gl.getAttribLocation(program, 'a_position');
  const uniforms: ProgramUniforms = {
    u_image: gl.getUniformLocation(program, 'u_image'),
    u_curveLut: gl.getUniformLocation(program, 'u_curveLut'),
    u_texSize: gl.getUniformLocation(program, 'u_texSize'),
    u_cropRect: gl.getUniformLocation(program, 'u_cropRect'),
    u_rotation90: gl.getUniformLocation(program, 'u_rotation90'),
    u_straightenRad: gl.getUniformLocation(program, 'u_straightenRad'),
    u_flip: gl.getUniformLocation(program, 'u_flip'),
    u_imageAspect: gl.getUniformLocation(program, 'u_imageAspect'),
    u_showFullForCrop: gl.getUniformLocation(program, 'u_showFullForCrop'),
    u_splitX: gl.getUniformLocation(program, 'u_splitX'),
    u_exposure: gl.getUniformLocation(program, 'u_exposure'),
    u_contrast: gl.getUniformLocation(program, 'u_contrast'),
    u_highlights: gl.getUniformLocation(program, 'u_highlights'),
    u_shadows: gl.getUniformLocation(program, 'u_shadows'),
    u_whites: gl.getUniformLocation(program, 'u_whites'),
    u_blacks: gl.getUniformLocation(program, 'u_blacks'),
    u_temperature: gl.getUniformLocation(program, 'u_temperature'),
    u_tint: gl.getUniformLocation(program, 'u_tint'),
    u_vibrance: gl.getUniformLocation(program, 'u_vibrance'),
    u_saturation: gl.getUniformLocation(program, 'u_saturation'),
    u_clarity: gl.getUniformLocation(program, 'u_clarity'),
    u_sharpen: gl.getUniformLocation(program, 'u_sharpen'),
    u_noiseReduction: gl.getUniformLocation(program, 'u_noiseReduction'),
    u_vignetteAmount: gl.getUniformLocation(program, 'u_vignetteAmount'),
    u_vignetteMidpoint: gl.getUniformLocation(program, 'u_vignetteMidpoint'),
    u_grainAmount: gl.getUniformLocation(program, 'u_grainAmount'),
    u_grainSize: gl.getUniformLocation(program, 'u_grainSize'),
    u_fade: gl.getUniformLocation(program, 'u_fade'),
    u_chromaticAberration: gl.getUniformLocation(program, 'u_chromaticAberration'),
    u_fastPreview: gl.getUniformLocation(program, 'u_fastPreview'),
    u_hsl: HSL_COLOR_KEYS.map((_, idx) => gl.getUniformLocation(program, `u_hsl[${idx}]`)),
    u_gradeShadows: gl.getUniformLocation(program, 'u_gradeShadows'),
    u_gradeMidtones: gl.getUniformLocation(program, 'u_gradeMidtones'),
    u_gradeHighlights: gl.getUniformLocation(program, 'u_gradeHighlights'),
    u_gradeBalance: gl.getUniformLocation(program, 'u_gradeBalance'),
  };

  return { program, uniforms, posAttr };
}

function createProxyCanvas(
  source: HTMLImageElement,
  maxDim: number
): HTMLCanvasElement {
  const { width, height } = computeProxyDimensions(
    source.naturalWidth || source.width,
    source.naturalHeight || source.height,
    maxDim
  );
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
  }
  return c;
}

function uploadUniforms(
  gl: WebGLRenderingContext,
  uniforms: ProgramUniforms,
  state: EditState,
  origW: number,
  origH: number,
  texW: number,
  texH: number,
  options: {
    showFullForCrop: boolean;
    splitX: number;
    fastPreview: boolean;
  }
) {
  const adj = state.adjustments;
  const crop = state.crop;
  const oriented = getOrientedDimensions(origW, origH, crop.rotation90);

  gl.uniform2f(uniforms.u_texSize, texW, texH);
  gl.uniform4f(uniforms.u_cropRect, crop.x, crop.y, crop.width, crop.height);
  gl.uniform1f(uniforms.u_rotation90, crop.rotation90);
  gl.uniform1f(uniforms.u_straightenRad, (crop.straighten * Math.PI) / 180);
  gl.uniform2f(uniforms.u_flip, crop.flipH ? -1 : 1, crop.flipV ? -1 : 1);
  gl.uniform1f(
    uniforms.u_imageAspect,
    oriented.height > 0 ? oriented.width / oriented.height : 1
  );
  gl.uniform1f(uniforms.u_showFullForCrop, options.showFullForCrop ? 1.0 : 0.0);
  gl.uniform1f(uniforms.u_splitX, options.splitX);

  gl.uniform1f(uniforms.u_exposure, adj.exposure);
  gl.uniform1f(uniforms.u_contrast, adj.contrast / 100);
  gl.uniform1f(uniforms.u_highlights, adj.highlights / 100);
  gl.uniform1f(uniforms.u_shadows, adj.shadows / 100);
  gl.uniform1f(uniforms.u_whites, adj.whites / 100);
  gl.uniform1f(uniforms.u_blacks, adj.blacks / 100);
  gl.uniform1f(uniforms.u_temperature, adj.temperature / 100);
  gl.uniform1f(uniforms.u_tint, adj.tint / 100);
  gl.uniform1f(uniforms.u_vibrance, adj.vibrance / 100);
  gl.uniform1f(uniforms.u_saturation, adj.saturation / 100);

  gl.uniform1f(uniforms.u_clarity, adj.clarity / 100);
  gl.uniform1f(uniforms.u_sharpen, adj.sharpen / 100);
  gl.uniform1f(uniforms.u_noiseReduction, adj.noiseReduction / 100);
  gl.uniform1f(uniforms.u_vignetteAmount, adj.vignetteAmount / 100);
  gl.uniform1f(uniforms.u_vignetteMidpoint, adj.vignetteMidpoint / 100);
  gl.uniform1f(uniforms.u_grainAmount, adj.grainAmount / 100);
  gl.uniform1f(uniforms.u_grainSize, adj.grainSize);
  gl.uniform1f(uniforms.u_fade, adj.fade / 100);
  gl.uniform1f(uniforms.u_chromaticAberration, adj.chromaticAberration / 100);
  gl.uniform1f(uniforms.u_fastPreview, options.fastPreview ? 1.0 : 0.0);

  HSL_COLOR_KEYS.forEach((key, idx) => {
    const band = state.hsl[key];
    gl.uniform3f(
      uniforms.u_hsl[idx],
      band.hue / 100,
      band.saturation / 100,
      band.luminance / 100
    );
  });

  gl.uniform2f(
    uniforms.u_gradeShadows,
    state.colorGrade.shadowsHue / 360,
    state.colorGrade.shadowsSat / 100
  );
  gl.uniform2f(
    uniforms.u_gradeMidtones,
    state.colorGrade.midtonesHue / 360,
    state.colorGrade.midtonesSat / 100
  );
  gl.uniform2f(
    uniforms.u_gradeHighlights,
    state.colorGrade.highlightsHue / 360,
    state.colorGrade.highlightsSat / 100
  );
  gl.uniform1f(uniforms.u_gradeBalance, state.colorGrade.balance / 100);
}

export class PhotoRenderEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private programInfo: ReturnType<typeof createProgram> | null = null;
  private quadBuffer: WebGLBuffer | null = null;
  private imageTexture: WebGLTexture | null = null;
  private curveTexture: WebGLTexture | null = null;
  private sourceImage: HTMLImageElement | null = null;
  private proxyCanvas: HTMLCanvasElement | null = null;
  private proxyMaxDim = 1600;
  private fallbackCtx: CanvasRenderingContext2D | null = null;
  private histCanvas: HTMLCanvasElement;
  private histCtx: CanvasRenderingContext2D | null;
  private lastCurveKey = '';

  constructor(canvas: HTMLCanvasElement, proxyMaxDim = 1600) {
    this.canvas = canvas;
    this.proxyMaxDim = proxyMaxDim;
    this.histCanvas = document.createElement('canvas');
    this.histCanvas.width = 140;
    this.histCanvas.height = 140;
    this.histCtx = this.histCanvas.getContext('2d', { willReadFrequently: true });
    this.initContext();
  }

  public isWebGLActive(): boolean {
    return Boolean(this.gl && this.programInfo);
  }

  private initContext() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (!gl) {
      this.fallbackCtx = this.canvas.getContext('2d');
      return;
    }

    const prog = createProgram(gl);
    if (!prog) {
      this.fallbackCtx = this.canvas.getContext('2d');
      return;
    }

    this.gl = gl;
    this.programInfo = prog;

    // Fullscreen quad
    this.quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    this.imageTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.curveTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  public setProxyMaxDim(maxDim: number) {
    if (this.proxyMaxDim === maxDim) return;
    this.proxyMaxDim = maxDim;
    if (this.sourceImage) {
      this.setSourceImage(this.sourceImage);
    }
  }

  public setSourceImage(img: HTMLImageElement) {
    this.sourceImage = img;
    this.proxyCanvas = createProxyCanvas(img, this.proxyMaxDim);

    if (this.gl && this.imageTexture) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.proxyCanvas
      );
    }
  }

  public render(
    state: EditState,
    options: {
      showFullForCrop: boolean;
      splitX: number;
      fastPreview: boolean;
    }
  ): { width: number; height: number } {
    if (!this.sourceImage || !this.proxyCanvas) {
      return { width: 1, height: 1 };
    }

    const proxyW = this.proxyCanvas.width;
    const proxyH = this.proxyCanvas.height;
    const oriented = getOrientedDimensions(proxyW, proxyH, state.crop.rotation90);

    const targetW = options.showFullForCrop
      ? oriented.width
      : Math.max(1, Math.round(oriented.width * state.crop.width));
    const targetH = options.showFullForCrop
      ? oriented.height
      : Math.max(1, Math.round(oriented.height * state.crop.height));

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    if (this.gl && this.programInfo && this.imageTexture && this.curveTexture) {
      const gl = this.gl;
      const { program, uniforms, posAttr } = this.programInfo;

      gl.viewport(0, 0, targetW, targetH);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.enableVertexAttribArray(posAttr);
      gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
      gl.uniform1i(uniforms.u_image, 0);

      // Only rebuild & upload 256x1 LUT texture when curves actually changed
      const curveKey = JSON.stringify(state.curves);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTexture);
      if (curveKey !== this.lastCurveKey) {
        this.lastCurveKey = curveKey;
        const lutBytes = buildCurveLutRGBA(state.curves);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          256,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          lutBytes
        );
      }
      gl.uniform1i(uniforms.u_curveLut, 1);

      uploadUniforms(gl, uniforms, state, proxyW, proxyH, proxyW, proxyH, options);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      return { width: targetW, height: targetH };
    }

    // Canvas2D fallback if WebGL is unavailable
    if (this.fallbackCtx) {
      const ctx = this.fallbackCtx;
      ctx.save();
      ctx.clearRect(0, 0, targetW, targetH);
      const bright = 100 + state.adjustments.exposure * 35;
      const cont = 100 + state.adjustments.contrast * 0.7;
      const sat = 100 + state.adjustments.saturation;
      ctx.filter = `brightness(${bright}%) contrast(${cont}%) saturate(${sat}%)`;
      ctx.drawImage(this.proxyCanvas, 0, 0, targetW, targetH);
      ctx.restore();
    }

    return { width: targetW, height: targetH };
  }

  public sampleHistogram(): HistogramData {
    const empty = {
      r: new Array(64).fill(0),
      g: new Array(64).fill(0),
      b: new Array(64).fill(0),
      luma: new Array(64).fill(0),
      shadowClipPct: 0,
      highlightClipPct: 0,
    };
    if (!this.histCtx || this.canvas.width === 0 || this.canvas.height === 0) {
      return empty;
    }

    const w = 120;
    const h = 120;
    this.histCanvas.width = w;
    this.histCanvas.height = h;
    this.histCtx.drawImage(this.canvas, 0, 0, w, h);
    const data = this.histCtx.getImageData(0, 0, w, h).data;

    const rBins = new Float64Array(64);
    const gBins = new Float64Array(64);
    const bBins = new Float64Array(64);
    const lBins = new Float64Array(64);
    let shadowClip = 0;
    let highlightClip = 0;
    const totalPixels = w * h;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

      rBins[r >> 2]++;
      gBins[g >> 2]++;
      bBins[b >> 2]++;
      lBins[l >> 2]++;

      if (l <= 3) shadowClip++;
      if (l >= 252) highlightClip++;
    }

    let maxBin = 1;
    for (let i = 1; i < 63; i++) {
      maxBin = Math.max(maxBin, rBins[i], gBins[i], bBins[i], lBins[i]);
    }
    maxBin = Math.max(maxBin, rBins[0] * 0.5, rBins[63] * 0.5);

    const normalize = (arr: Float64Array) =>
      Array.from(arr, (v) => Math.min(1, v / maxBin));

    return {
      r: normalize(rBins),
      g: normalize(gBins),
      b: normalize(bBins),
      luma: normalize(lBins),
      shadowClipPct: Number(((shadowClip / totalPixels) * 100).toFixed(1)),
      highlightClipPct: Number(((highlightClip / totalPixels) * 100).toFixed(1)),
    };
  }

  public sampleSourceRGBA(): Uint8ClampedArray | null {
    if (!this.histCtx || !this.proxyCanvas) return null;
    const w = 120;
    const h = 120;
    this.histCanvas.width = w;
    this.histCanvas.height = h;
    this.histCtx.drawImage(this.proxyCanvas, 0, 0, w, h);
    return this.histCtx.getImageData(0, 0, w, h).data;
  }

  /**
   * Full-resolution offscreen GPU export: renders the original full-res source image
   * through the exact same shader pipeline (including sharpen/clarity) and encodes a Blob.
   */
  public async exportFullResolution(
    state: EditState,
    exportOptions: ExportOptions
  ): Promise<{ blob: Blob; width: number; height: number }> {
    if (!this.sourceImage) {
      throw new Error('No source image loaded');
    }

    const origW = this.sourceImage.naturalWidth || this.sourceImage.width;
    const origH = this.sourceImage.naturalHeight || this.sourceImage.height;
    const outSize = getCroppedExportDimensions(
      origW,
      origH,
      state.crop,
      exportOptions.resolutionScale
    );

    const offscreen = document.createElement('canvas');
    offscreen.width = outSize.width;
    offscreen.height = outSize.height;

    const gl = offscreen.getContext('webgl', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });

    if (gl) {
      const prog = createProgram(gl);
      if (prog) {
        // Respect WebGL MAX_TEXTURE_SIZE safely on very large panoramas
        const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
        const texDims = computeProxyDimensions(origW, origH, Math.min(maxTex, 8192));
        const uploadSource =
          texDims.scale < 1
            ? createProxyCanvas(this.sourceImage, texDims.width)
            : this.sourceImage;

        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
          gl.STATIC_DRAW
        );

        const imgTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imgTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, uploadSource);

        const lutTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, lutTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          256,
          1,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          buildCurveLutRGBA(state.curves)
        );

        gl.viewport(0, 0, outSize.width, outSize.height);
        gl.useProgram(prog.program);
        gl.enableVertexAttribArray(prog.posAttr);
        gl.vertexAttribPointer(prog.posAttr, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1i(prog.uniforms.u_image, 0);
        gl.uniform1i(prog.uniforms.u_curveLut, 1);

        uploadUniforms(
          gl,
          prog.uniforms,
          state,
          texDims.width,
          texDims.height,
          texDims.width,
          texDims.height,
          {
            showFullForCrop: false,
            splitX: -1,
            fastPreview: false,
          }
        );

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.finish();

        // Clean up offscreen GPU resources immediately
        gl.deleteTexture(imgTex);
        gl.deleteTexture(lutTex);
        gl.deleteBuffer(quad);
        gl.deleteProgram(prog.program);
      }
    } else {
      const ctx = offscreen.getContext('2d');
      ctx?.drawImage(this.sourceImage, 0, 0, outSize.width, outSize.height);
    }

    let exportTarget: HTMLCanvasElement = offscreen;
    const hasPhotoshopLayers =
      state.retouchStrokes.length > 0 ||
      state.overlayLayers.some((l) => l.visible && l.opacity > 0) ||
      state.textLayers.some((t) => t.visible && t.text.trim().length > 0);

    if (hasPhotoshopLayers) {
      const compCanvas = document.createElement('canvas');
      compCanvas.width = outSize.width;
      compCanvas.height = outSize.height;
      const compCtx = compCanvas.getContext('2d');
      if (compCtx) {
        compositePhotoshopLayers(compCtx, offscreen, outSize.width, outSize.height, state, {
          drawBaseImage: true,
          splitX: -1,
        });
        exportTarget = compCanvas;
      }
    }

    const blob = await new Promise<Blob>((resolve, reject) => {
      exportTarget.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('Failed to encode exported image'));
        },
        exportOptions.format,
        exportOptions.quality
      );
    });

    return { blob, width: outSize.width, height: outSize.height };
  }

  public dispose() {
    if (this.gl) {
      if (this.imageTexture) this.gl.deleteTexture(this.imageTexture);
      if (this.curveTexture) this.gl.deleteTexture(this.curveTexture);
      if (this.quadBuffer) this.gl.deleteBuffer(this.quadBuffer);
      if (this.programInfo) this.gl.deleteProgram(this.programInfo.program);
    }
  }
}
