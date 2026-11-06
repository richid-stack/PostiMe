import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./audioFx.ts');

test('normalizeAudioFx fills gaps and clamps every value', async () => {
  const { normalizeAudioFx, DEFAULT_AUDIO_FX } = await load();
  assert.deepEqual(normalizeAudioFx(undefined), DEFAULT_AUDIO_FX);
  const wild = normalizeAudioFx({ lowCutHz: 9999, lowDb: 40, midDb: -40, highDb: NaN as any, compressor: { enabled: true, thresholdDb: -200, ratio: 99, attackMs: 0, releaseMs: 99999, makeupDb: 99 } as any });
  assert.equal(wild.lowCutHz, 400);
  assert.equal(wild.lowDb, 12);
  assert.equal(wild.midDb, -12);
  assert.equal(wild.highDb, 0);
  assert.equal(wild.compressor.thresholdDb, -50);
  assert.equal(wild.compressor.ratio, 20);
  assert.equal(wild.compressor.attackMs, 1);
  assert.equal(wild.compressor.releaseMs, 1000);
  assert.equal(wild.compressor.makeupDb, 24);
});

test('a low cut under 20 Hz counts as off', async () => {
  const { normalizeAudioFx } = await load();
  assert.equal(normalizeAudioFx({ lowCutHz: 12 }).lowCutHz, 0);
  assert.equal(normalizeAudioFx({ lowCutHz: 80.4 }).lowCutHz, 80);
});

test('isAudioFxActive only reports settings that change the sound', async () => {
  const { isAudioFxActive, DEFAULT_AUDIO_FX } = await load();
  assert.equal(isAudioFxActive(undefined), false);
  assert.equal(isAudioFxActive(DEFAULT_AUDIO_FX), false);
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, midDb: 0.01 }), false);
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, midDb: 3 }), true);
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, lowCutHz: 80 }), true);
  // A compressor that is switched off, or that does nothing at 1:1, changes nothing.
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, compressor: { ...DEFAULT_AUDIO_FX.compressor, enabled: false, ratio: 8 } }), false);
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, compressor: { ...DEFAULT_AUDIO_FX.compressor, enabled: true, ratio: 1 } }), false);
  assert.equal(isAudioFxActive({ ...DEFAULT_AUDIO_FX, compressor: { ...DEFAULT_AUDIO_FX.compressor, enabled: true, ratio: 4 } }), true);
});

test('every preset is valid and active', async () => {
  const { AUDIO_FX_PRESETS, normalizeAudioFx, isAudioFxActive } = await load();
  assert.ok(AUDIO_FX_PRESETS.length >= 5);
  const ids = new Set();
  for (const p of AUDIO_FX_PRESETS) {
    assert.ok(!ids.has(p.id));
    ids.add(p.id);
    assert.deepEqual(normalizeAudioFx(p.fx), p.fx, p.id);
    assert.ok(isAudioFxActive(p.fx), p.id);
  }
});

test('describeAudioFx names what is on', async () => {
  const { describeAudioFx, DEFAULT_AUDIO_FX } = await load();
  assert.equal(describeAudioFx(DEFAULT_AUDIO_FX), 'No audio effects');
  const text = describeAudioFx({ ...DEFAULT_AUDIO_FX, lowCutHz: 90, highDb: 3, compressor: { ...DEFAULT_AUDIO_FX.compressor, enabled: true } });
  assert.match(text, /low cut 90 Hz/);
  assert.match(text, /EQ high \+3 dB/);
  assert.match(text, /compressor 3:1 above -24 dB/);
});
