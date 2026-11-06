const test = require('node:test');
const assert = require('node:assert/strict');
const { buildAudioFxFilters, normalizeAudioFx } = require('./audio-fx-filters');
const { buildClipAudioChain } = require('./ffmpeg-audio-graph');

const comp = (over = {}) => ({ enabled: true, thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 200, makeupDb: 0, ...over });

test('no settings, or settings that change nothing, add no filters', () => {
  assert.deepEqual(buildAudioFxFilters(undefined), []);
  assert.deepEqual(buildAudioFxFilters(null), []);
  assert.deepEqual(buildAudioFxFilters({}), []);
  assert.deepEqual(buildAudioFxFilters({ lowCutHz: 10, lowDb: 0.02, compressor: comp({ enabled: false }) }), []);
  assert.deepEqual(buildAudioFxFilters({ compressor: comp({ ratio: 1, makeupDb: 0 }) }), []);
});

test('each setting maps to one filter, in signal order', () => {
  const filters = buildAudioFxFilters({ lowCutHz: 90, lowDb: 3, midDb: -4, highDb: 2, compressor: comp({ makeupDb: 6 }) });
  assert.equal(filters.length, 5);
  assert.equal(filters[0], 'highpass=f=90');
  assert.match(filters[1], /^bass=g=3:f=120/);
  assert.match(filters[2], /^equalizer=f=1200:t=q:w=0\.9:g=-4/);
  assert.match(filters[3], /^treble=g=2:f=6000/);
  assert.match(filters[4], /^acompressor=threshold=0\.1:ratio=4:attack=10:release=200:makeup=1\.9953$/);
});

test('values are clamped to what FFmpeg and the app accept', () => {
  const filters = buildAudioFxFilters({ lowCutHz: 5000, lowDb: 99, compressor: comp({ thresholdDb: -999, ratio: 99, makeupDb: 99 }) });
  assert.equal(filters[0], 'highpass=f=400');
  assert.match(filters[1], /^bass=g=12:/);
  const compressor = filters[2];
  assert.match(compressor, /ratio=20/);
  const threshold = Number(compressor.match(/threshold=([\d.e-]+)/)[1]);
  assert.ok(threshold >= 0.000976563, `threshold ${threshold} is under FFmpeg's minimum`);
  const makeup = Number(compressor.match(/makeup=([\d.]+)/)[1]);
  assert.ok(makeup <= 64);
});

test('normalizeAudioFx tolerates junk', () => {
  assert.equal(normalizeAudioFx('nonsense').lowCutHz, 0);
  assert.equal(normalizeAudioFx({ compressor: 'x' }).compressor.enabled, false);
});

test('the clip chain puts the effects after trimming and before the volume and delay', () => {
  const chain = buildClipAudioChain({
    start: 1, visibleDuration: 4, sourceIn: 0, sourceOut: 4, speed: 1, playbackDuration: 4, volume: 0.5, volumeKeyframes: [],
    audioFx: { lowCutHz: 100, midDb: 3 },
  }, () => '');
  const order = ['aformat=', 'highpass=f=100', 'equalizer=', 'volume=0.5', 'adelay=1000'].map((part) => chain.indexOf(part));
  assert.ok(order.every((index) => index >= 0), chain);
  assert.deepEqual([...order].sort((a, b) => a - b), order, chain);
});

test('a clip without effects produces the same chain as before', () => {
  const base = { start: 0, visibleDuration: 4, sourceIn: 0, sourceOut: 4, speed: 1, playbackDuration: 4, volume: 1, volumeKeyframes: [] };
  assert.equal(buildClipAudioChain({ ...base, audioFx: undefined }, () => ''), buildClipAudioChain({ ...base, audioFx: { lowDb: 0 } }, () => ''));
});
