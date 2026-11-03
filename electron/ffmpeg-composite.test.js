const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BLEND_MODE_MAP,
  resolveBlendMode,
  escapeFilterPath,
  serializeCubeLut,
  buildLutFilter,
  buildCompositeFilters,
} = require('./ffmpeg-composite');

const base = {
  tag: 'c0',
  canvasLabel: 'cv_in',
  clipLabel: 'clip_in',
  nextLabel: 'cv_out',
  xExpr: '10',
  yExpr: '20',
  start: 1,
  end: 3,
  width: 1920,
  height: 1080,
  fps: 30,
  totalDuration: 10,
};

test('resolveBlendMode maps editor names and rejects the ones FFmpeg cannot do', () => {
  assert.equal(resolveBlendMode('normal'), null);
  assert.equal(resolveBlendMode(undefined), null);
  assert.equal(resolveBlendMode('multiply'), 'multiply');
  assert.equal(resolveBlendMode('color-dodge'), 'dodge');
  assert.equal(resolveBlendMode('soft-light'), 'softlight');
  assert.equal(resolveBlendMode('hue'), null);
  for (const mode of Object.keys(BLEND_MODE_MAP)) assert.ok(resolveBlendMode(mode));
});

test('escapeFilterPath quotes colons, backslashes and apostrophes', () => {
  assert.equal(escapeFilterPath('/tmp/lut.cube'), "'/tmp/lut.cube'");
  assert.equal(escapeFilterPath('C:\\Users\\Rosie\\Temp\\lut.cube'), "'C\\:/Users/Rosie/Temp/lut.cube'");
  assert.equal(escapeFilterPath("/tmp/Rosie's lut.cube"), "'/tmp/Rosie'\\''s lut.cube'");
});

test('serializeCubeLut writes a 3D .cube file FFmpeg can read', () => {
  const text = serializeCubeLut({
    title: 'swap "demo"',
    size: 2,
    is3d: true,
    domainMin: [0, 0, 0],
    domainMax: [1, 1, 1],
    data: Float32Array.from([0, 0, 0, 1, 0, 0]),
  });
  assert.deepEqual(text.trimEnd().split('\n'), [
    "TITLE \"swap 'demo'\"",
    'LUT_3D_SIZE 2',
    'DOMAIN_MIN 0 0 0',
    'DOMAIN_MAX 1 1 1',
    '0.000000 0.000000 0.000000',
    '1.000000 0.000000 0.000000',
  ]);
});

test('serializeCubeLut accepts data that went through JSON and 1D tables', () => {
  const text = serializeCubeLut({ size: 2, is3d: false, data: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 1 } });
  assert.match(text, /^LUT_1D_SIZE 2\n/);
  assert.match(text, /1\.000000 1\.000000 1\.000000\n$/);
});

test('buildLutFilter picks the filter for the table type', () => {
  assert.equal(buildLutFilter('/tmp/a.cube', true), "lut3d=file='/tmp/a.cube':interp=tetrahedral");
  assert.equal(buildLutFilter('/tmp/a.cube', false), "lut1d=file='/tmp/a.cube'");
});

test('normal mode with constant opacity is a single timed overlay', () => {
  const filters = buildCompositeFilters(base);
  assert.deepEqual(filters, ["[cv_in][clip_in]overlay=x='10':y='20':enable='between(t,1,3)':eof_action=pass[cv_out]"]);
});

test('opacity keyframes overlay at full strength then blend with the untouched canvas', () => {
  const filters = buildCompositeFilters({ ...base, opacityExpr: 'op(T)' });
  assert.equal(filters.length, 3);
  assert.match(filters[0], /^\[cv_in\]split=2\[c0_cv0\]\[c0_cv1\]$/);
  assert.match(filters[1], /^\[c0_cv0\]\[clip_in\]overlay=.*\[c0_full\]$/);
  assert.match(filters[2], /^\[c0_cv1\]\[c0_full\]blend=all_expr='A\*\(1-\(op\(T\)\)\)\+B\*\(op\(T\)\)':enable='between\(t,1,3\)'\[cv_out\]$/);
});

test('a blend mode blends in RGB, masks with the clip alpha and overlays', () => {
  const filters = buildCompositeFilters({ ...base, blendMode: 'multiply' });
  const joined = filters.join(';');
  assert.match(filters[0], /^\[cv_in\]split=2\[c0_cv0\]\[c0_cv1\]$/);
  assert.match(joined, /\[c0_cv0\]format=gbrp\[c0_bb\]/);
  assert.match(joined, /\[c0_la\]format=gbrp\[c0_lc\]/);
  assert.match(joined, /blend=all_mode=multiply/);
  assert.match(joined, /alphaextract/);
  assert.match(joined, /alphamerge/);
  assert.match(filters[filters.length - 1], /^\[c0_cv1\]\[c0_bla\]overlay=format=auto\[cv_out\]$/);
  assert.match(joined, /color=c=black@0:s=1920x1080:r=30:d=10/);
});

test('a blend mode with opacity keyframes uses three canvas copies and ends on the opacity blend', () => {
  const filters = buildCompositeFilters({ ...base, blendMode: 'screen', opacityExpr: 'op(T)' });
  assert.match(filters[0], /^\[cv_in\]split=3\[c0_cv0\]\[c0_cv1\]\[c0_cv2\]$/);
  assert.match(filters[filters.length - 1], /^\[c0_cv2\]\[c0_full\]blend=all_expr=.*\[cv_out\]$/);
  assert.match(filters.join(';'), /overlay=format=auto\[c0_full\]/);
  // every label is consumed exactly once
  const outputs = filters.flatMap((f) => [...f.matchAll(/\[([a-z0-9_]+)\]/gi)].map((m) => m[1]));
  const consumers = new Map();
  filters.forEach((f) => {
    const head = f.match(/^((?:\[[a-z0-9_]+\])+)/i);
    if (!head) return;
    [...head[1].matchAll(/\[([a-z0-9_]+)\]/gi)].forEach((m) => consumers.set(m[1], (consumers.get(m[1]) || 0) + 1));
  });
  for (const [label, count] of consumers) assert.equal(count, 1, `${label} feeds ${count} inputs`);
  assert.ok(outputs.length > 0);
});
