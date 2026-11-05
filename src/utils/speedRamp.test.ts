import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./speedRamp.ts');

test('every preset covers the source exactly, in order, with no gaps', async () => {
  const { RAMP_PRESETS, buildRampSegments } = await load();
  for (const preset of RAMP_PRESETS) {
    const segs = buildRampSegments({ sourceIn: 2, sourceOut: 12, preset: preset.id });
    assert.ok(segs.length >= 2, preset.id);
    assert.equal(segs[0].sourceIn, 2);
    assert.equal(segs[segs.length - 1].sourceOut, 12);
    for (let i = 1; i < segs.length; i++) assert.equal(segs[i].sourceIn, segs[i - 1].sourceOut, `${preset.id} gap at ${i}`);
    assert.ok(segs.every((s: any) => s.sourceOut > s.sourceIn));
  }
});

test('speeds stay inside what the editor allows and follow the curve', async () => {
  const { buildRampSegments, RAMP_SPEED_MIN, RAMP_SPEED_MAX } = await load();
  const hit = buildRampSegments({ sourceIn: 0, sourceOut: 12, preset: 'slow-hit' });
  const speeds = hit.map((s: any) => s.speed);
  assert.ok(speeds.every((s: number) => s >= RAMP_SPEED_MIN && s <= RAMP_SPEED_MAX));
  assert.ok(speeds[0] > 0.8 && speeds[speeds.length - 1] > 0.8, 'near normal at the ends');
  assert.ok(Math.min(...speeds) < 0.3, 'about a quarter in the middle');
  const mid = speeds.indexOf(Math.min(...speeds));
  assert.ok(mid >= 4 && mid <= 7, 'slowest near the middle');
  const whoosh = buildRampSegments({ sourceIn: 0, sourceOut: 12, preset: 'whoosh' }).map((s: any) => s.speed);
  assert.ok(Math.max(...whoosh) > 2.7 && Math.max(...whoosh) <= 3);
  const fast = buildRampSegments({ sourceIn: 0, sourceOut: 12, preset: 'ease-fast' }).map((s: any) => s.speed);
  assert.ok(fast.every((s: number, i: number) => i === 0 || s >= fast[i - 1]), 'only gets faster');
});

test('neighbouring pieces never jump by more than about a quarter', async () => {
  const { RAMP_PRESETS, buildRampSegments } = await load();
  for (const preset of RAMP_PRESETS) {
    const speeds = buildRampSegments({ sourceIn: 0, sourceOut: 20, preset: preset.id, steps: 16 }).map((s: any) => s.speed);
    for (let i = 1; i < speeds.length; i++) {
      const ratio = Math.max(speeds[i], speeds[i - 1]) / Math.min(speeds[i], speeds[i - 1]);
      assert.ok(ratio < 1.45, `${preset.id} step ${i} ratio ${ratio}`);
    }
  }
});

test('timeline length is the sum of each piece at its speed', async () => {
  const { buildRampSegments, totalRampLength } = await load();
  const segs = buildRampSegments({ sourceIn: 0, sourceOut: 10, preset: 'slow-hit' });
  const expected = segs.reduce((sum: number, s: any) => sum + (s.sourceOut - s.sourceIn) / s.speed, 0);
  assert.ok(Math.abs(totalRampLength(segs) - expected) < 1e-9);
  assert.ok(totalRampLength(segs) > 10, 'slowing down makes the clip longer');
  const fast = buildRampSegments({ sourceIn: 0, sourceOut: 10, preset: 'ease-fast' });
  assert.ok(totalRampLength(fast) < 10, 'speeding up makes it shorter');
});

test('short clips get fewer pieces and no piece is under a tenth of a second', async () => {
  const { buildRampSegments, MIN_SEGMENT_SECONDS } = await load();
  const segs = buildRampSegments({ sourceIn: 0, sourceOut: 1.5, preset: 'whoosh' });
  assert.ok(segs.length >= 2 && segs.length < 12);
  assert.ok(segs.every((s: any) => s.length >= MIN_SEGMENT_SECONDS - 1e-9));
});

test('bad input gives no pieces', async () => {
  const { buildRampSegments } = await load();
  assert.deepEqual(buildRampSegments({ sourceIn: 5, sourceOut: 5, preset: 'whoosh' }), []);
  assert.deepEqual(buildRampSegments({ sourceIn: 5, sourceOut: 3, preset: 'whoosh' }), []);
  assert.deepEqual(buildRampSegments({ sourceIn: 0, sourceOut: 4, preset: 'nope' as any }), []);
});
