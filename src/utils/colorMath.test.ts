import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyPresetWithIntensity,
  buildCurveLutRGBA,
  computeProxyDimensions,
  createDefaultEditState,
  DEFAULT_CROP,
  evaluateSplineCurve,
  fitCropToAspectRatio,
  getCroppedExportDimensions,
  getOrientedDimensions,
  hasAnyColorEdits,
  hasAnyCropEdits,
} from './colorMath';
import type { PhotoPreset } from '../types/editor';

test('evaluateSplineCurve produces exact linear identity for default endpoints', () => {
  const lut = evaluateSplineCurve([
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]);
  assert.equal(lut.length, 256);
  assert.equal(lut[0], 0);
  assert.equal(lut[128], 128);
  assert.equal(lut[255], 255);
});

test('evaluateSplineCurve handles lifted blacks, unsorted points, and clamps [0, 255]', () => {
  const lut = evaluateSplineCurve([
    { x: 1, y: 0.95 },
    { x: 0.5, y: 0.6 },
    { x: 0, y: 0.1 },
  ]);
  assert.equal(lut[0], Math.round(0.1 * 255));
  assert.equal(lut[255], Math.round(0.95 * 255));
  assert.ok(lut[128] >= 145 && lut[128] <= 160);
  for (let i = 0; i < 256; i++) {
    assert.ok(lut[i] >= 0 && lut[i] <= 255);
  }
});

test('buildCurveLutRGBA packs 4 channels into 1024 bytes', () => {
  const state = createDefaultEditState();
  state.curves.red = [
    { x: 0, y: 0.2 },
    { x: 1, y: 1 },
  ];
  const rgba = buildCurveLutRGBA(state.curves);
  assert.equal(rgba.length, 256 * 4);
  assert.equal(rgba[0], Math.round(0.2 * 255)); // R
  assert.equal(rgba[1], 0); // G
  assert.equal(rgba[2], 0); // B
  assert.equal(rgba[3], 0); // Master RGB
});

test('applyPresetWithIntensity scales adjustments accurately at 0%, 50%, and 100%', () => {
  const samplePreset: PhotoPreset = {
    id: 'test-warm',
    name: 'Test Warm',
    category: 'film',
    description: 'Test',
    swatchColors: ['#111', '#888', '#eee'],
    adjustments: {
      exposure: 0.4,
      contrast: 20,
      temperature: 30,
    },
    colorGrade: {
      shadowsHue: 200,
      shadowsSat: 40,
    },
  };

  const zero = applyPresetWithIntensity(DEFAULT_CROP, samplePreset, 0);
  assert.equal(zero.adjustments.exposure, 0);
  assert.equal(zero.adjustments.contrast, 0);
  assert.equal(zero.colorGrade.shadowsSat, 0);

  const half = applyPresetWithIntensity(DEFAULT_CROP, samplePreset, 50);
  assert.equal(half.adjustments.exposure, 0.2);
  assert.equal(half.adjustments.contrast, 10);
  assert.equal(half.adjustments.temperature, 15);
  assert.equal(half.colorGrade.shadowsSat, 20);

  const full = applyPresetWithIntensity(DEFAULT_CROP, samplePreset, 100);
  assert.equal(full.adjustments.exposure, 0.4);
  assert.equal(full.adjustments.contrast, 20);
  assert.equal(full.activePresetId, 'test-warm');
});

test('computeProxyDimensions caps large 24MP images cleanly while preserving small images', () => {
  const large = computeProxyDimensions(6000, 4000, 1024);
  assert.equal(large.width, 1024);
  assert.equal(large.height, 683);

  const small = computeProxyDimensions(800, 600, 1600);
  assert.equal(small.width, 800);
  assert.equal(small.height, 600);
  assert.equal(small.scale, 1);
});

test('fitCropToAspectRatio enforces pixel aspect ratio inside [0, 1] bounds', () => {
  const box = fitCropToAspectRatio(
    { x: 0, y: 0, width: 1, height: 1 },
    16 / 9,
    4000,
    3000
  );
  assert.ok(box.x >= 0 && box.y >= 0);
  assert.ok(box.x + box.width <= 1.0001);
  assert.ok(box.y + box.height <= 1.0001);
  const pixelRatio = (box.width * 4000) / (box.height * 3000);
  assert.ok(Math.abs(pixelRatio - 16 / 9) < 0.01);
});

test('getOrientedDimensions and getCroppedExportDimensions calculate full and scaled output sizes', () => {
  const rotated = getOrientedDimensions(4000, 3000, 1);
  assert.deepEqual(rotated, { width: 3000, height: 4000 });

  const fullExport = getCroppedExportDimensions(
    4000,
    3000,
    { ...DEFAULT_CROP, rotation90: 1, width: 0.5, height: 0.5 },
    'full'
  );
  assert.deepEqual(fullExport, { width: 1500, height: 2000 });

  const webExport = getCroppedExportDimensions(
    4000,
    3000,
    DEFAULT_CROP,
    '1200'
  );
  assert.deepEqual(webExport, { width: 1200, height: 900 });
});

test('hasAnyColorEdits and hasAnyCropEdits detect pristine vs modified states', () => {
  const clean = createDefaultEditState();
  assert.equal(hasAnyColorEdits(clean), false);
  assert.equal(hasAnyCropEdits(clean.crop), false);

  clean.adjustments.clarity = 12;
  assert.equal(hasAnyColorEdits(clean), true);

  clean.crop.flipH = true;
  assert.equal(hasAnyCropEdits(clean.crop), true);
});
