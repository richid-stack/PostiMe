const test = require('node:test');
const assert = require('node:assert/strict');

const { decodePngDataUrl, placeTitleClip } = require('./ffmpeg-title');

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('decodePngDataUrl returns the PNG bytes and refuses anything else', () => {
  const bytes = decodePngDataUrl(`data:image/png;base64,${tinyPng.toString('base64')}`);
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.length, tinyPng.length);
  assert.equal(decodePngDataUrl('data:image/jpeg;base64,AAAA'), null);
  assert.equal(decodePngDataUrl('file:///etc/passwd'), null);
  assert.equal(decodePngDataUrl(undefined), null);
  assert.equal(decodePngDataUrl(`data:image/png;base64,${Buffer.from('not a png at all').toString('base64')}`), null);
});

test('placeTitleClip moves the position and every x and y keyframe by the block offset', () => {
  const clip = {
    id: 't',
    textRaster: { centerX: 30, centerY: 90 },
    transform: { scale: 1.5, opacity: 0.8, position: { x: 50, y: 50 } },
    keyframes: [
      { id: 'a', property: 'x', time: 0, value: 40 },
      { id: 'b', property: 'y', time: 0, value: 55 },
      { id: 'c', property: 'opacity', time: 0, value: 0.2 },
    ],
  };
  const placed = placeTitleClip(clip);
  assert.deepEqual(placed.transform.position, { x: 30, y: 90 });
  assert.equal(placed.transform.scale, 1.5);
  assert.equal(placed.transform.opacity, 0.8);
  assert.equal(placed.keyframes.find((k) => k.id === 'a').value, 20);
  assert.equal(placed.keyframes.find((k) => k.id === 'b').value, 95);
  assert.equal(placed.keyframes.find((k) => k.id === 'c').value, 0.2);
  // the input is not changed
  assert.equal(clip.keyframes[0].value, 40);
  assert.deepEqual(clip.transform.position, { x: 50, y: 50 });
});

test('placeTitleClip copes with a title that has no transform or keyframes', () => {
  const placed = placeTitleClip({ id: 't', textRaster: { centerX: 50, centerY: 50 } });
  assert.deepEqual(placed.transform.position, { x: 50, y: 50 });
  assert.equal(placed.keyframes, undefined);
});
