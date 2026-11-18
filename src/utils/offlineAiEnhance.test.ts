import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeImageTelemetry,
  computeAiEnhanceState,
} from './offlineAiEnhance';
import { createDefaultEditState } from './colorMath';

function makeSolidBuffer(r: number, g: number, b: number, count = 100): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    buf[i * 4] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = 255;
  }
  return buf;
}

test('analyzeImageTelemetry detects dark underexposed buffers and warm color casts', () => {
  const darkWarm = makeSolidBuffer(48, 32, 20, 100);
  const telemetry = analyzeImageTelemetry(darkWarm);

  assert.ok(telemetry.meanLuma < 0.2);
  assert.ok(telemetry.warmBias > 0.3);
  assert.equal(telemetry.dynamicRange, 0);
});

test('analyzeImageTelemetry detects skin-tone pixel regions', () => {
  const skinBuf = makeSolidBuffer(210, 150, 118, 100);
  const telemetry = analyzeImageTelemetry(skinBuf);

  assert.equal(telemetry.skinRatio, 1);
  assert.ok(telemetry.meanLuma > 0.5);
});

test('computeAiEnhanceState boosts exposure on dark images and scales with strength', () => {
  const darkBuf = makeSolidBuffer(35, 35, 35, 100);
  const telemetry = analyzeImageTelemetry(darkBuf);
  const base = createDefaultEditState();

  const full = computeAiEnhanceState(base, telemetry, 'low-light', 100);
  const half = computeAiEnhanceState(base, telemetry, 'low-light', 50);

  assert.ok(full.adjustments.exposure > 0.3);
  assert.ok(full.adjustments.shadows >= 40);
  assert.ok(full.adjustments.noiseReduction >= 40);
  assert.ok(Math.abs(half.adjustments.exposure - full.adjustments.exposure * 0.5) < 0.02);
  assert.equal(full.activeAiMode, 'low-light');
});

test('computeAiEnhanceState dehaze mode lowers black floor and adds clarity', () => {
  const hazyBuf = makeSolidBuffer(140, 145, 150, 100);
  const telemetry = analyzeImageTelemetry(hazyBuf);
  const base = createDefaultEditState();

  const dehazed = computeAiEnhanceState(base, telemetry, 'dehaze', 100);
  assert.ok(dehazed.adjustments.blacks < -15);
  assert.ok(dehazed.adjustments.clarity > 20);
  assert.ok(dehazed.adjustments.contrast > 15);
});
