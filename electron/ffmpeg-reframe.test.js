const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeReframe, isFillEligible, buildFitFilter } = require('./ffmpeg-reframe');

test('reframe settings are cleaned up', () => {
    assert.deepEqual(normalizeReframe(undefined), { mode: 'fit', focusX: 0.5, focusY: 0.5 });
    assert.deepEqual(normalizeReframe({ mode: 'fill', focusX: 2, focusY: -1 }), { mode: 'fill', focusX: 1, focusY: 0 });
    assert.deepEqual(normalizeReframe({ mode: 'stretch', focusX: 'x' }), { mode: 'fit', focusX: 0.5, focusY: 0.5 });
});

test('only full-frame pictures are filled', () => {
    assert.equal(isFillEligible({ transform: { scale: 1 } }), true);
    assert.equal(isFillEligible({ transform: { scale: 1.4 } }), true);
    assert.equal(isFillEligible({}), true, 'no transform means full frame');
    assert.equal(isFillEligible({ transform: { scale: 0.16 } }), false, 'a logo keeps its shape');
    assert.equal(isFillEligible({ transform: { scale: 0.35 } }), false, 'picture in picture keeps its shape');
    assert.equal(isFillEligible({ textConfig: { content: 'x' }, transform: { scale: 1 } }), false);
});

test('the fit filter', () => {
    const fit = 'scale=1080:1920:force_original_aspect_ratio=decrease,setsar=1';
    assert.equal(buildFitFilter({ width: 1080, height: 1920, clip: {} }), fit);
    assert.equal(buildFitFilter({ width: 1080, height: 1920, reframe: { mode: 'fit' }, clip: {} }), fit);
    assert.equal(buildFitFilter({ width: 1080, height: 1920, reframe: { mode: 'fill' }, clip: { transform: { scale: 0.2 } } }), fit);
    const fill = buildFitFilter({ width: 1080, height: 1920, reframe: { mode: 'fill', focusX: 0.25, focusY: 0.5 }, clip: {} });
    assert.equal(fill, "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:x='(iw-1080)*0.25':y='(ih-1920)*0.5',setsar=1");
});
