import test from 'node:test';
import assert from 'node:assert/strict';

test('multi size helpers', async () => {
  const { SIZE_TARGETS, buildSizeFilename, scaleBitrateKbps, sameShape } = await import('./multiSize.ts');

  assert.deepEqual(SIZE_TARGETS.map((t) => t.id), ['16x9', '9x16', '1x1', '4x5']);
  assert.ok(SIZE_TARGETS.every((t) => t.width % 2 === 0 && t.height % 2 === 0), 'even sizes encode cleanly');

  const t = SIZE_TARGETS[1];
  assert.equal(buildSizeFilename('launch.mp4', t, 'mp4'), 'launch-9x16.mp4');
  assert.equal(buildSizeFilename('My Launch Video!.mov', t, '.mov'), 'My-Launch-Video-9x16.mov');
  assert.equal(buildSizeFilename('../../etc/passwd', t, 'mp4'), 'etcpasswd-9x16.mp4', 'no path pieces survive');
  assert.equal(buildSizeFilename('', t, 'mp4'), 'export-9x16.mp4');
  assert.equal(buildSizeFilename('v1.2.final.mp4', t, 'mp4'), 'v12final-9x16.mp4');

  const master = { width: 1920, height: 1080 };
  assert.equal(scaleBitrateKbps(12000, master, { width: 1080, height: 1080 }), 6750);
  assert.equal(scaleBitrateKbps(12000, master, master), 12000);
  assert.equal(scaleBitrateKbps(3000, master, { width: 1080, height: 1350 }), 2109 < 2000 ? 2000 : 2109);
  assert.equal(scaleBitrateKbps(1000, master, { width: 1080, height: 1080 }), 2000, 'floor');

  assert.equal(sameShape(master, { width: 1280, height: 720 }), true);
  assert.equal(sameShape(master, { width: 1080, height: 1920 }), false);
});
