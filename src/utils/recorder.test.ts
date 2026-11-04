import test from 'node:test';
import assert from 'node:assert/strict';

test('recorder helpers', async () => {
  const { pickRecorderMimeType, buildRecordingFileName, formatRecordingTime, levelFromSamples, extensionForMimeType } = await import('./recorder.ts');

  assert.equal(pickRecorderMimeType('camera', () => true), 'video/webm;codecs=vp9,opus');
  assert.equal(pickRecorderMimeType('camera', (t: string) => t === 'video/webm'), 'video/webm');
  assert.equal(pickRecorderMimeType('screen', (t: string) => t === 'video/mp4'), 'video/mp4');
  assert.equal(pickRecorderMimeType('audio', (t: string) => t.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(pickRecorderMimeType('audio', (t: string) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickRecorderMimeType('camera', () => false), '');
  assert.equal(pickRecorderMimeType('camera', () => { throw new Error('boom'); }), '');

  assert.equal(extensionForMimeType('video/webm;codecs=vp9,opus', 'camera'), 'webm');
  assert.equal(extensionForMimeType('audio/mp4', 'audio'), 'm4a');
  assert.equal(extensionForMimeType('', 'audio'), 'webm');

  const when = new Date(2026, 10, 4, 14, 5, 9);
  assert.equal(buildRecordingFileName('camera', 'video/webm;codecs=vp9,opus', when), 'Camera 2026-11-04 14.05.09.webm');
  assert.equal(buildRecordingFileName('audio', 'audio/mp4', when), 'Voice 2026-11-04 14.05.09.m4a');
  assert.equal(buildRecordingFileName('screen', '', when), 'Screen 2026-11-04 14.05.09.webm');

  assert.equal(formatRecordingTime(0), '0:00');
  assert.equal(formatRecordingTime(7.9), '0:07');
  assert.equal(formatRecordingTime(723), '12:03');
  assert.equal(formatRecordingTime(3723), '1:02:03');
  assert.equal(formatRecordingTime(-4), '0:00');
  assert.equal(formatRecordingTime(NaN), '0:00');

  assert.equal(levelFromSamples([]), 0);
  assert.equal(levelFromSamples(new Uint8Array(256).fill(128)), 0);
  const loud = new Uint8Array(256).map((_, i) => (i % 2 ? 255 : 0));
  assert.equal(levelFromSamples(loud), 1);
  const quiet = new Uint8Array(256).map((_, i) => (i % 2 ? 140 : 116));
  const level = levelFromSamples(quiet);
  assert.ok(level > 0.1 && level < 0.6, `quiet level ${level}`);
});
