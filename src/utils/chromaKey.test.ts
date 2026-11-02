import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  applyChromaKeyToImageData,
  despillPixel,
  keyAlpha,
  resolveChromaKey,
} from './chromaKey.ts';

const require = createRequire(import.meta.url);
const { resolveChromaKeyParams, buildFfmpegChromaKeyFilter } = require('../../electron/ffmpeg-chroma.js');

const green = resolveChromaKey({ color: '#00c030', tolerance: 0.35, softness: 0.25, despill: 0.5 });
const px = (r: number, g: number, b: number): [number, number, number] => [r / 255, g / 255, b / 255];

test('the screen colour is removed and skin is kept', () => {
  assert.equal(keyAlpha(...px(0, 192, 48), green), 0);
  assert.equal(keyAlpha(...px(217, 160, 122), green), 1);
});

test('unevenly lit green keys as one colour', () => {
  assert.equal(keyAlpha(...px(0, 122, 30), green), 0, 'shadowed screen');
  assert.equal(keyAlpha(...px(40, 235, 90), green), 0, 'hot-spot screen');
});

test('alpha ramps through the soft edge', () => {
  // Walk from the key colour toward neutral grey; alpha must rise monotonically from 0 to 1.
  let previous = -1;
  for (let step = 0; step <= 20; step += 1) {
    const t = step / 20;
    const alpha = keyAlpha(...px(0 + 128 * t, 192 - 64 * t, 48 + 80 * t), green);
    assert.ok(alpha >= previous - 1e-9, `alpha dipped at step ${step}`);
    previous = alpha;
  }
  assert.equal(previous, 1);
});

test('zero softness gives a hard edge', () => {
  const hard = resolveChromaKey({ color: '#00ff00', tolerance: 0.3, softness: 0 });
  for (const [r, g, b] of [[0, 255, 0], [120, 200, 120], [200, 150, 120]]) {
    const alpha = keyAlpha(...px(r, g, b), hard);
    assert.ok(alpha === 0 || alpha === 1);
  }
});

test('despill pulls green out of a kept pixel and leaves skin alone', () => {
  const [, g] = despillPixel(...px(180, 210, 120), green);
  assert.ok(g * 255 < 210, 'green channel should drop');
  const skin = despillPixel(...px(217, 160, 122), green);
  assert.deepEqual(skin.map((c) => Math.round(c * 255)), [217, 160, 122]);
});

test('a blue screen despills the blue channel', () => {
  const blue = resolveChromaKey({ color: '#0040ff', tolerance: 0.35, despill: 1 });
  assert.equal(blue.spillChannel, 2);
  const [, , b] = despillPixel(...px(100, 120, 230), blue);
  assert.ok(Math.abs(b * 255 - 120) < 1);
});

test('applyChromaKeyToImageData writes alpha in place', () => {
  const data = new Uint8ClampedArray([0, 192, 48, 255, 217, 160, 122, 255]);
  applyChromaKeyToImageData(data, { color: '#00c030', tolerance: 0.35, softness: 0.25, despill: 0.5 });
  assert.equal(data[3], 0);
  assert.equal(data[7], 255);
});

test('the preview and the export agree on the parameters', () => {
  for (const config of [
    { color: '#00c030', tolerance: 0.35, softness: 0.25, despill: 0.5 },
    { color: '#0040ff', tolerance: 0.6, softness: 0, despill: 1 },
    { color: '#00ff00', tolerance: 0.35 },
  ]) {
    const preview = resolveChromaKey(config);
    const exported = resolveChromaKeyParams(config);
    assert.ok(Math.abs(preview.similarity - exported.similarity) < 1e-9);
    assert.ok(Math.abs(preview.blend - exported.blend) < 1e-9);
    assert.equal(preview.spillChannel, exported.spillChannel);
  }
});

test('export filter chain keys, then despills green and blue but not red', () => {
  assert.match(buildFfmpegChromaKeyFilter({ color: '#00ff00', tolerance: 0.35 }), /^chromakey=color=0x00ff00:similarity=0\.1750:blend=0\.0750,format=gbrap,despill=type=green/);
  assert.match(buildFfmpegChromaKeyFilter({ color: '#0000ff', tolerance: 0.35 }), /despill=type=blue/);
  assert.doesNotMatch(buildFfmpegChromaKeyFilter({ color: '#ff0000', tolerance: 0.35 }), /despill/);
  assert.doesNotMatch(buildFfmpegChromaKeyFilter({ color: '#00ff00', tolerance: 0.35, despill: 0 }), /despill/);
});
