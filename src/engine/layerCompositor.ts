import type { EditState, LayerBlendMode, RetouchStroke } from '../types/editor';

function toCanvasBlendMode(mode: LayerBlendMode): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply';
    case 'screen':
      return 'screen';
    case 'overlay':
      return 'overlay';
    case 'soft-light':
      return 'soft-light';
    case 'color-dodge':
      return 'color-dodge';
    default:
      return 'source-over';
  }
}

function drawFeatheredBrushStroke(
  ctx: CanvasRenderingContext2D,
  baseSource: HTMLCanvasElement,
  stroke: RetouchStroke,
  w: number,
  h: number
) {
  if (stroke.points.length === 0) return;
  const radius = Math.max(4, (stroke.size * Math.min(w, h)) / 2);
  const innerStop = Math.max(0, 1 - stroke.feather * 0.9);

  if (stroke.mode === 'heal') {
    // Sample texture slightly offset from stroke centroid and paint feathered patch
    ctx.save();
    for (const pt of stroke.points) {
      const px = pt.x * w;
      const py = pt.y * h;
      const offset = radius * 1.15;
      const sx = Math.max(0, Math.min(w - radius * 2, px + offset - radius));
      const sy = Math.max(0, Math.min(h - radius * 2, py - offset * 0.6 - radius));

      // Create circular feathered mask via clip + radial alpha
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, stroke.strength * 0.92);
      ctx.filter = `blur(${Math.max(1, radius * 0.08).toFixed(1)}px)`;
      ctx.drawImage(
        baseSource,
        sx,
        sy,
        radius * 2,
        radius * 2,
        px - radius,
        py - radius,
        radius * 2,
        radius * 2
      );
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (stroke.mode === 'blur') {
    ctx.save();
    const blurPx = Math.max(3, radius * 0.32 * stroke.strength);
    for (const pt of stroke.points) {
      const px = pt.x * w;
      const py = pt.y * h;
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.globalAlpha = Math.min(1, 0.78 * stroke.strength);
      ctx.filter = `blur(${blurPx.toFixed(1)}px)`;
      ctx.drawImage(
        baseSource,
        Math.max(0, px - radius * 1.4),
        Math.max(0, py - radius * 1.4),
        radius * 2.8,
        radius * 2.8,
        px - radius * 1.4,
        py - radius * 1.4,
        radius * 2.8,
        radius * 2.8
      );
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  // Dodge, Burn, Saturate
  ctx.save();
  if (stroke.mode === 'dodge') {
    ctx.globalCompositeOperation = 'screen';
  } else if (stroke.mode === 'burn') {
    ctx.globalCompositeOperation = 'multiply';
  } else if (stroke.mode === 'saturate') {
    ctx.globalCompositeOperation = 'saturation';
  }

  for (const pt of stroke.points) {
    const px = pt.x * w;
    const py = pt.y * h;
    const grad = ctx.createRadialGradient(px, py, radius * innerStop * 0.2, px, py, radius);
    if (stroke.mode === 'dodge') {
      const a = 0.22 * stroke.strength;
      grad.addColorStop(0, `rgba(255, 248, 232, ${a})`);
      grad.addColorStop(1, 'rgba(255, 248, 232, 0)');
    } else if (stroke.mode === 'burn') {
      const a = 0.28 * stroke.strength;
      grad.addColorStop(0, `rgba(38, 32, 28, ${a})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      // For multiply, outer edge must be opaque white to leave outside unchanged;
      // use source-over dark vignette or soft-light black instead for clean additive strokes.
    } else {
      const a = 0.45 * stroke.strength;
      grad.addColorStop(0, `rgba(255, 80, 30, ${a})`);
      grad.addColorStop(1, 'rgba(255, 80, 30, 0)');
    }

    if (stroke.mode === 'burn') {
      ctx.globalCompositeOperation = 'soft-light';
      const burnGrad = ctx.createRadialGradient(px, py, 0, px, py, radius);
      burnGrad.addColorStop(0, `rgba(0, 0, 0, ${0.38 * stroke.strength})`);
      burnGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = burnGrad;
    } else {
      ctx.fillStyle = grad;
    }

    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Composites Photoshop-style retouch strokes, blend overlay layers, and text layers
 * onto a target 2D canvas. Works identically on both live preview and full-res export.
 */
export function compositePhotoshopLayers(
  ctx: CanvasRenderingContext2D,
  baseCanvas: HTMLCanvasElement,
  width: number,
  height: number,
  state: EditState,
  options: {
    drawBaseImage: boolean;
    splitX: number; // -1 disabled, 0..1 clips Photoshop layers to right side of split curtain
  }
) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);

  if (options.drawBaseImage) {
    ctx.drawImage(baseCanvas, 0, 0, width, height);
  }

  // Respect split comparison curtain: left side shows pure original before layers/retouch
  if (options.splitX >= 0) {
    ctx.beginPath();
    ctx.rect(options.splitX * width, 0, width * (1 - options.splitX), height);
    ctx.clip();
  }

  // 1. Retouch strokes (Spot Heal, Dodge, Burn, Bokeh Blur, Saturate)
  for (const stroke of state.retouchStrokes) {
    drawFeatheredBrushStroke(ctx, baseCanvas, stroke, width, height);
  }

  // 2. Adjustment / Color / Gradient Overlay Layers with Blend Modes
  for (const layer of state.overlayLayers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = toCanvasBlendMode(layer.blendMode);
    ctx.globalAlpha = layer.opacity / 100;

    if (layer.type === 'solid') {
      ctx.fillStyle = layer.colorA;
      ctx.fillRect(0, 0, width, height);
    } else if (layer.type === 'linear-gradient') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, layer.colorA);
      grad.addColorStop(1, layer.colorB);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      const grad = ctx.createRadialGradient(
        width * 0.25,
        height * 0.22,
        width * 0.04,
        width * 0.45,
        height * 0.45,
        Math.max(width, height) * 0.85
      );
      grad.addColorStop(0, layer.colorA);
      grad.addColorStop(1, layer.colorB);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  // 3. Typography / Watermark Text Layers
  for (const txt of state.textLayers) {
    if (!txt.visible || !txt.text.trim() || txt.opacity <= 0) continue;
    ctx.save();
    ctx.globalAlpha = txt.opacity / 100;
    const pxSize = Math.max(12, Math.round((txt.fontSize / 100) * width));
    const fontFamily =
      txt.fontFamily === 'serif'
        ? 'Georgia, "Times New Roman", serif'
        : txt.fontFamily === 'mono'
          ? '"JetBrains Mono", ui-monospace, monospace'
          : '"Plus Jakarta Sans", sans-serif';
    ctx.font = `600 ${pxSize}px ${fontFamily}`;
    ctx.fillStyle = txt.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.max(2, pxSize * 0.14);
    ctx.shadowOffsetY = Math.max(1, pxSize * 0.04);
    ctx.fillText(txt.text, txt.x * width, txt.y * height);
    ctx.restore();
  }

  ctx.restore();
}
