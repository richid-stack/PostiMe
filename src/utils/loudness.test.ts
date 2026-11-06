import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./loudness.ts');

const sine = (hz: number, amp: number, seconds: number, rate: number) => {
  const out = new Float32Array(Math.round(seconds * rate));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * hz * i) / rate);
  return out;
};

test('K-weighting at 48 kHz matches the coefficients printed in BS.1770', async () => {
  const { kWeightingFilters } = await load();
  const [shelf, hp] = kWeightingFilters(48000);
  assert.ok(Math.abs(shelf.b0 - 1.53512485958697) < 1e-9);
  assert.ok(Math.abs(shelf.b1 - -2.69169618940638) < 1e-9);
  assert.ok(Math.abs(shelf.b2 - 1.19839281085285) < 1e-9);
  assert.ok(Math.abs(shelf.a1 - -1.69065929318241) < 1e-9);
  assert.ok(Math.abs(shelf.a2 - 0.73248077421585) < 1e-9);
  assert.ok(Math.abs(hp.a1 - -1.99004745483398) < 1e-9);
  assert.ok(Math.abs(hp.a2 - 0.99007225036621) < 1e-9);
});

test('a stereo 1 kHz sine at -23 dBFS reads about -23 LUFS (EBU Tech 3341 calibration)', async () => {
  const { measureLoudness } = await load();
  const amp = Math.pow(10, -23 / 20);
  const tone = sine(1000, amp, 6, 48000);
  const r = measureLoudness([tone, tone], 48000);
  assert.ok(Math.abs((r.integratedLufs as number) - -23) < 0.15, String(r.integratedLufs));
  assert.ok(Math.abs((r.peakDb as number) - -23) < 0.05);
  assert.ok(r.shortTermMaxLufs !== null);
});

test('one channel is 3 dB quieter than the same tone in two', async () => {
  const { measureLoudness } = await load();
  const tone = sine(1000, 0.1, 5, 48000);
  const one = measureLoudness([tone], 48000).integratedLufs as number;
  const two = measureLoudness([tone, tone], 48000).integratedLufs as number;
  assert.ok(Math.abs(two - one - 3.01) < 0.02);
});

test('doubling the amplitude adds 6 dB, at other sample rates too', async () => {
  const { measureLoudness } = await load();
  for (const rate of [44100, 48000, 16000]) {
    const a = measureLoudness([sine(500, 0.05, 4, rate)], rate).integratedLufs as number;
    const b = measureLoudness([sine(500, 0.1, 4, rate)], rate).integratedLufs as number;
    assert.ok(Math.abs(b - a - 6.02) < 0.02, `${rate}: ${b - a}`);
  }
});

test('the gate ignores silence between loud parts', async () => {
  const { measureLoudness } = await load();
  const rate = 48000;
  const loud = sine(1000, 0.1, 3, rate);
  const gap = new Float32Array(rate * 6);
  const mixed = new Float32Array(loud.length * 2 + gap.length);
  mixed.set(loud, 0);
  mixed.set(loud, loud.length + gap.length);
  const withGap = measureLoudness([mixed], rate).integratedLufs as number;
  const plain = measureLoudness([loud], rate).integratedLufs as number;
  // Blocks that straddle the edges of the loud parts are only part loud, so allow a fraction of a LU. Without gating this would read about 3 LU lower.
  assert.ok(Math.abs(withGap - plain) < 0.3, `${withGap} vs ${plain}`);
});

test('very short or silent audio gives no integrated figure', async () => {
  const { measureLoudness } = await load();
  assert.equal(measureLoudness([sine(1000, 0.5, 0.2, 48000)], 48000).integratedLufs, null);
  const silent = measureLoudness([new Float32Array(48000 * 2)], 48000);
  assert.equal(silent.integratedLufs, null);
  assert.equal(silent.peakDb, null);
  assert.equal(measureLoudness([], 48000).integratedLufs, null);
});

test('planGainToTarget gives the volume that reaches the target and flags clipping and the cap', async () => {
  const { planGainToTarget } = await load();
  const down = planGainToTarget(-10, -16);
  assert.ok(Math.abs(down.gainDb - -6) < 1e-9);
  assert.ok(Math.abs(down.volume - 0.501187) < 1e-4);
  assert.equal(down.clipsAtFullScale, false);
  const up = planGainToTarget(-28, -16, -4);
  assert.ok(Math.abs(up.gainDb - 12) < 1e-9);
  assert.equal(up.clipsAtFullScale, true);
  const capped = planGainToTarget(-60, -14);
  assert.equal(capped.volume, 4);
  assert.equal(capped.atMaxVolume, true);
});
