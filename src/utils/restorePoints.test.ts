import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./restorePoints.ts');
const clip = (id: string, start: number, end: number, o: any = {}) => ({ id, mediaId: 'm' + id, trackId: 't1', start, end, duration: end - start, speed: 1, effect: null, ...o }) as any;
const track = (id: string) => ({ id, name: id, type: 'video' }) as any;

test('fingerprint ignores key order and drawn title images but notices real edits', async () => {
  const { fingerprintTimeline } = await load();
  const a = [clip('1', 0, 5, { volume: 1, blendMode: 'normal' })];
  const sameButReordered = [{ blendMode: 'normal', volume: 1, ...clip('1', 0, 5) }];
  assert.equal(fingerprintTimeline(a, [track('t1')]), fingerprintTimeline(sameButReordered, [track('t1')]));
  assert.equal(fingerprintTimeline(a, [track('t1')]), fingerprintTimeline([{ ...a[0], textRaster: { dataUrl: 'x' } }], [track('t1')]));
  assert.notEqual(fingerprintTimeline(a, [track('t1')]), fingerprintTimeline([clip('1', 0, 6, { volume: 1, blendMode: 'normal' })], [track('t1')]));
  assert.notEqual(fingerprintTimeline(a, [track('t1')]), fingerprintTimeline(a, [track('t1'), track('t2')]));
});

test('buildRestorePoint copies, summarises and drops drawn title images', async () => {
  const { buildRestorePoint } = await load();
  const clips = [clip('1', 0, 5, { textRaster: { dataUrl: 'big' } }), clip('2', 5, 12)];
  const p = buildRestorePoint({ clips, tracks: [track('t1')], kind: 'manual', label: '  Before the recut  ', now: new Date('2026-11-05T10:00:00Z') });
  assert.equal(p.label, 'Before the recut');
  assert.deepEqual(p.summary, { clips: 2, tracks: 1, seconds: 12 });
  assert.equal('textRaster' in p.clips[0], false);
  clips[1].end = 99; // later edits must not change the saved point
  assert.equal(p.clips[1].end, 12);
  assert.equal(p.createdAt, '2026-11-05T10:00:00.000Z');
});

test('shouldAutoCapture needs clips, a change and enough time', async () => {
  const { buildRestorePoint, shouldAutoCapture } = await load();
  const t0 = new Date('2026-11-05T10:00:00Z');
  const clips = [clip('1', 0, 5)];
  const tracks = [track('t1')];
  assert.equal(shouldAutoCapture({ points: [], clips: [], tracks, now: t0.getTime() }), false);
  assert.equal(shouldAutoCapture({ points: [], clips, tracks, now: t0.getTime() }), true);
  const point = buildRestorePoint({ clips, tracks, kind: 'auto', now: t0 });
  const later = t0.getTime() + 10 * 60_000;
  assert.equal(shouldAutoCapture({ points: [point], clips, tracks, now: later }), false, 'unchanged');
  const edited = [clip('1', 0, 8)];
  assert.equal(shouldAutoCapture({ points: [point], clips: edited, tracks, now: t0.getTime() + 60_000 }), false, 'too soon');
  assert.equal(shouldAutoCapture({ points: [point], clips: edited, tracks, now: later }), true);
});

test('pruneRestorePoints drops only old automatic points', async () => {
  const { pruneRestorePoints } = await load();
  const mk = (id: string, kind: string) => ({ id, kind }) as any;
  const list = [mk('a1', 'auto'), mk('m1', 'manual'), mk('a2', 'auto'), mk('b1', 'before-restore'), mk('a3', 'auto'), mk('a4', 'auto')];
  assert.deepEqual(pruneRestorePoints(list, 2).map((p: any) => p.id), ['a1', 'm1', 'a2', 'b1']);
  assert.equal(pruneRestorePoints(list, 20).length, 6);
});

test('describeRestore counts clips brought back, removed and changed', async () => {
  const { describeRestore, describeChange } = await load();
  const now = [clip('1', 0, 5), clip('2', 5, 9), clip('3', 9, 12)];
  const point = { clips: [clip('1', 0, 5), clip('2', 5, 11), clip('4', 11, 14)] };
  const change = describeRestore(now, point);
  assert.deepEqual(change, { brought: 1, removed: 1, changed: 1, same: false });
  assert.equal(describeChange(change), 'Restoring brings back 1 clip, removes 1, changes 1');
  assert.equal(describeChange(describeRestore(now, { clips: now })), 'Same clips as now');
  assert.equal(describeChange({ brought: 3, removed: 0, changed: 0, same: false }), 'Restoring brings back 3 clips');
});

test('countMissingMedia ignores titles and counts clips whose media is gone', async () => {
  const { countMissingMedia } = await load();
  const point = { clips: [clip('1', 0, 1), clip('2', 1, 2), clip('3', 2, 3, { textConfig: { content: 'x' }, mediaId: '' })] };
  assert.equal(countMissingMedia(point, ['m1']), 1);
  assert.equal(countMissingMedia(point, ['m1', 'm2']), 0);
});

test('formatAge words recent and old times', async () => {
  const { formatAge } = await load();
  const now = new Date('2026-11-05T12:00:00Z').getTime();
  assert.equal(formatAge('2026-11-05T11:59:50Z', now), 'just now');
  assert.equal(formatAge('2026-11-05T11:48:00Z', now), '12 min ago');
  assert.equal(formatAge('2026-11-05T09:00:00Z', now), '3 hours ago');
  assert.equal(formatAge('2026-11-03T12:00:00Z', now), '2 days ago');
});

test('parseRestorePoints survives bad data and sorts newest first', async () => {
  const { parseRestorePoints, buildRestorePoint } = await load();
  assert.deepEqual(parseRestorePoints('not json'), []);
  assert.deepEqual(parseRestorePoints(null), []);
  const older = buildRestorePoint({ clips: [clip('1', 0, 1)], tracks: [], kind: 'auto', now: new Date('2026-11-05T09:00:00Z') });
  const newer = buildRestorePoint({ clips: [clip('1', 0, 2)], tracks: [], kind: 'manual', now: new Date('2026-11-05T10:00:00Z') });
  const parsed = parseRestorePoints(JSON.stringify({ points: [older, { junk: true }, newer, { ...older, id: 'x', kind: 'weird' }] }));
  assert.equal(parsed.length, 3);
  assert.equal(parsed[0].id, newer.id);
  assert.equal(parsed.find((p: any) => p.id === 'x').kind, 'auto');
});
