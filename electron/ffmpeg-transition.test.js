const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SPECS,
  isSupportedTransition,
  buildTransitionModifiers,
  buildOverlayStrength,
  expandTransitionEntries,
  buildBurnGradientSource,
} = require('./ffmpeg-transition');

// Evaluate an FFmpeg expression with plain JavaScript. The transition formulas only use these functions.
const evaluate = (expression, variables = {}) => {
  const names = Object.keys(variables);
  const body = `return (${expression.replace(/\bif\(/g, 'iff(')});`;
  // eslint-disable-next-line no-new-func
  const fn = new Function('min', 'max', 'iff', 'lt', 'gt', 'abs', 'sin', 'PI', ...names, body);
  return fn(
    Math.min, Math.max, (c, a, b) => (c ? a : b), (a, b) => (a < b ? 1 : 0), (a, b) => (a > b ? 1 : 0), Math.abs, Math.sin, Math.PI,
    ...names.map((name) => variables[name]),
  );
};
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-6, `${label}: expected ${expected}, got ${actual}`);

// A transition that runs from 4 s to 6 s on a 1000 px wide canvas, so progress p = (t - 4) / 2.
const args = { tStart: 4, duration: 2, width: 1000, timeVar: 't' };
const at = (p) => ({ t: 4 + p * 2 });
const mods = (role, type, p) => {
  const m = buildTransitionModifiers({ ...args, role, type });
  const read = (key) => (m[key] === undefined ? undefined : evaluate(m[key], at(p)));
  return { alpha: read('alpha'), dxPx: read('dxPx'), scaleAdd: read('scaleAdd'), scaleMul: read('scaleMul') };
};

test('every transition in the editor has a spec', () => {
  for (const type of ['Cross Fade', 'Fade to Black', 'Fade to White', 'Dip to White', 'Zoom In', 'Swipe Left', 'Glitch Cut', 'Whip Pan', 'Lightning Flash', 'Film Burn']) {
    assert.ok(isSupportedTransition(type), type);
  }
  assert.equal(isSupportedTransition('Star Wipe'), false);
  assert.equal(isSupportedTransition('toString'), false);
  assert.equal(Object.keys(SPECS).length, 10);
});

test('progress is clamped to 0 and 1 outside the transition', () => {
  near(mods('out', 'Cross Fade', -1).alpha, 1, 'before');
  near(mods('out', 'Cross Fade', 2).alpha, 0, 'after');
  near(mods('incoming', 'Cross Fade', -1).alpha, 0, 'incoming before');
});

test('cross fade, fade to black and fade to white fade the ending clip out', () => {
  for (const type of ['Cross Fade', 'Fade to Black', 'Fade to White']) {
    near(mods('out', type, 0.25).alpha, 0.75, `${type} out`);
  }
  near(mods('incoming', 'Cross Fade', 0.25).alpha, 0.25, 'cross fade in');
  assert.deepEqual(buildTransitionModifiers({ ...args, role: 'incoming', type: 'Fade to Black' }), {}, 'fade to black shows no incoming frame');
});

test('dip to white is out, then in, with a white peak in the middle', () => {
  near(mods('out', 'Dip to White', 0.25).alpha, 0.5, 'out first half');
  near(mods('out', 'Dip to White', 0.75).alpha, 0, 'out second half');
  near(mods('incoming', 'Dip to White', 0.25).alpha, 0, 'in first half');
  near(mods('incoming', 'Dip to White', 0.75).alpha, 0.5, 'in second half');
  const white = (p) => evaluate(buildOverlayStrength({ kind: 'white', type: 'Dip to White', tStart: 4, duration: 2, timeVar: 't' }), at(p));
  near(white(0), 0, 'white start');
  near(white(0.5), 0.8, 'white peak');
  near(white(1), 0, 'white end');
});

test('zoom in grows the ending clip and settles the incoming frame', () => {
  near(mods('out', 'Zoom In', 0.5).scaleAdd, 0.06, 'out scale');
  near(mods('incoming', 'Zoom In', 0).scaleMul, 1.08, 'in scale start');
  near(mods('incoming', 'Zoom In', 1).scaleMul, 1, 'in scale end');
  near(mods('incoming', 'Zoom In', 0.5).alpha, 0.5, 'in alpha');
});

test('swipe left and whip pan move by the canvas width', () => {
  near(mods('out', 'Swipe Left', 0.5).dxPx, -500, 'swipe out');
  near(mods('incoming', 'Swipe Left', 0.5).dxPx, 500, 'swipe in');
  assert.equal(mods('incoming', 'Swipe Left', 0.5).alpha, undefined, 'swipe does not fade');
  near(mods('out', 'Whip Pan', 0.4).dxPx, -0.4 * 1000 * 1.25, 'whip out');
  near(mods('incoming', 'Whip Pan', 0.4).dxPx, 0.6 * 1000 * 1.25, 'whip in');
});

test('glitch cut shakes with the timeline clock, like the preview', () => {
  const p = 0.3;
  const t = 4 + p * 2;
  near(mods('out', 'Glitch Cut', p).dxPx, Math.sin(t * 120) * 34 * (1 - p), 'out shake');
  near(mods('incoming', 'Glitch Cut', p).dxPx, Math.sin(t * 130 + 1.7) * 26 * p, 'in shake');
  near(mods('out', 'Glitch Cut', p).alpha, 1 - p, 'out alpha');
  const white = (q) => evaluate(buildOverlayStrength({ kind: 'white', type: 'Glitch Cut', tStart: 4, duration: 2, timeVar: 't' }), at(q));
  near(white(0.5), 0.28, 'flash peak');
  near(white(1), 0, 'flash clamps at 0');
});

test('lightning flash and film burn follow the preview curves', () => {
  near(mods('out', 'Lightning Flash', 0.5).alpha, 1 - 0.5 * 1.3, 'lightning out');
  near(mods('out', 'Lightning Flash', 0.6).alpha, 0, 'lightning out after cut');
  near(mods('incoming', 'Lightning Flash', 0.2).alpha, 0, 'lightning in early');
  near(mods('incoming', 'Lightning Flash', 0.67).alpha, (0.67 - 0.34) / 0.66, 'lightning in');
  const flash = evaluate(buildOverlayStrength({ kind: 'white', type: 'Lightning Flash', tStart: 4, duration: 2, timeVar: 't' }), at(0.5));
  near(flash, 0.95, 'lightning peak');
  near(mods('out', 'Film Burn', 0.5).alpha, 1 - 0.5 * 0.92, 'burn out');
  near(mods('incoming', 'Film Burn', 0.59).alpha, (0.59 - 0.18) / 0.82, 'burn in');
  const burn = evaluate(buildOverlayStrength({ kind: 'burn', type: 'Film Burn', tStart: 4, duration: 2, timeVar: 't' }), at(0.5));
  near(burn, 0.85, 'burn peak');
  assert.equal(buildOverlayStrength({ kind: 'burn', type: 'Cross Fade', tStart: 4, duration: 2, timeVar: 't' }), null);
});

test('the time variable is whatever the filter provides', () => {
  const m = buildTransitionModifiers({ ...args, role: 'out', type: 'Glitch Cut', timeVar: 't+2.5' });
  assert.match(m.dxPx, /\(t\+2\.5\)/);
});

const entry = (id, trackId, start, end, extra = {}) => ({
  clip: { id, trackId, ...(extra.clip || {}) }, start, end, sourceIn: 0, sourceOut: end - start, sourceRange: end - start,
  speed: 1, playbackDuration: end - start, visibleDuration: end - start, hasAudio: true, volume: 1, volumeKeyframes: [], mediaItem: { type: 'video' }, ...extra.entry,
});
const withTransition = (type, duration) => ({ clip: { transitionOut: { type, duration } } });

test('a transition adds the next clip as a held frame right after the ending clip', () => {
  const a = entry('a', 'v1', 0, 4, withTransition('Cross Fade', 1));
  const b = entry('b', 'v1', 4, 8);
  const expanded = expandTransitionEntries([a, b]);
  assert.deepEqual(expanded.map((e) => e.clip.id), ['a', 'b__transition-in', 'b']);
  assert.deepEqual(a.transition, { role: 'out', type: 'Cross Fade', tStart: 3, duration: 1 });
  const ghost = expanded[1];
  assert.equal(ghost.isGhost, true);
  assert.equal(ghost.start, 3);
  assert.equal(ghost.end, 4);
  assert.equal(ghost.visibleDuration, 1);
  assert.equal(ghost.hasAudio, false);
  assert.equal(ghost.sourceOut, ghost.sourceIn + 1);
  assert.deepEqual(ghost.transition, { role: 'incoming', type: 'Cross Fade', tStart: 3, duration: 1 });
  // the real next clip is untouched
  assert.equal(expanded[2].isGhost, undefined);
  assert.equal(expanded[2].hasAudio, true);
});

test('the incoming frame shows the next clip with its still transform and colour only', () => {
  const a = entry('a', 'v1', 0, 4, withTransition('Cross Fade', 1));
  const b = entry('b', 'v1', 4, 8, { clip: {
    keyframes: [{ property: 'x', time: 0, value: 10 }],
    chromaKey: { color: '#00ff00', tolerance: 0.3 },
    blendMode: 'multiply',
    transform: { scale: 1.2, opacity: 0.9, position: { x: 40, y: 60 } },
    filters: { brightness: 120, lut: 'custom', customLut: { size: 2 } },
    transitionOut: { type: 'Zoom In', duration: 1 },
  } });
  const ghost = expandTransitionEntries([a, b])[1].clip;
  assert.deepEqual(ghost.keyframes, []);
  assert.equal(ghost.chromaKey, undefined);
  assert.equal(ghost.blendMode, undefined);
  assert.equal(ghost.transitionOut, undefined);
  assert.equal(ghost.filters.customLut, undefined);
  assert.equal(ghost.filters.brightness, 120);
  assert.deepEqual(ghost.transform, { scale: 1.2, opacity: 0.9, position: { x: 40, y: 60 } });
});

test('only the next clip on the same track is used, and a title is skipped', () => {
  const a = entry('a', 'v1', 0, 4, withTransition('Cross Fade', 1));
  const other = entry('o', 'v2', 4, 8);
  assert.deepEqual(expandTransitionEntries([a, other]).map((e) => e.clip.id), ['a', 'o'], 'other track');

  const early = entry('e', 'v1', 2, 3);
  const later = entry('l', 'v1', 6, 9);
  assert.deepEqual(expandTransitionEntries([a, early, later]).map((e) => e.clip.id), ['a', 'l__transition-in', 'e', 'l'], 'a gap before the next clip is fine, an overlapping clip is not "next", and the held frame sits right after the ending clip');

  const title = entry('t', 'v1', 4, 8, { entry: { titleBytes: Buffer.from('x') } });
  assert.deepEqual(expandTransitionEntries([entry('a', 'v1', 0, 4, withTransition('Cross Fade', 1)), title]).map((e) => e.clip.id), ['a', 't']);
});

test('fade to black has no incoming frame, and the last clip has none either', () => {
  const a = entry('a', 'v1', 0, 4, withTransition('Fade to Black', 1));
  const b = entry('b', 'v1', 4, 8);
  assert.deepEqual(expandTransitionEntries([a, b]).map((e) => e.clip.id), ['a', 'b']);
  assert.ok(a.transition);
  const last = entry('z', 'v1', 0, 4, withTransition('Cross Fade', 1));
  assert.deepEqual(expandTransitionEntries([last]).map((e) => e.clip.id), ['z']);
});

test('white and burn layers follow the clips they belong to', () => {
  const a = entry('a', 'v1', 0, 4, withTransition('Dip to White', 1));
  const b = entry('b', 'v1', 4, 8);
  const expanded = expandTransitionEntries([a, b]);
  assert.deepEqual(expanded.map((e) => e.kind || e.clip.id), ['a', 'b__transition-in', 'white', 'b']);
  assert.equal(expanded[2].start, 3);
  assert.equal(expanded[2].end, 4);

  const burn = expandTransitionEntries([entry('a', 'v1', 0, 4, withTransition('Film Burn', 1))]);
  assert.deepEqual(burn.map((e) => e.kind || e.clip.id), ['a', 'burn']);
});

test('a transition longer than its clip starts when the clip does', () => {
  const a = entry('a', 'v1', 1, 2, withTransition('Dip to White', 5));
  const expanded = expandTransitionEntries([a, entry('b', 'v1', 2, 5)]);
  const white = expanded.find((e) => e.kind === 'white');
  assert.equal(white.start, 1);
  assert.equal(white.end, 2);
  assert.equal(a.transition.tStart, -3, 'progress still counts from the full duration');
});

test('entries without a transition pass through unchanged', () => {
  const a = entry('a', 'v1', 0, 4);
  const b = entry('b', 'v1', 4, 8);
  assert.deepEqual(expandTransitionEntries([a, b]), [a, b]);
  assert.equal(a.transition, undefined);
  assert.equal(expandTransitionEntries([entry('a', 'v1', 0, 4, withTransition('Cross Fade', 0)), b]).length, 2, 'zero duration');
});

test('the burn source is one worked-out frame, repeated for the whole timeline', () => {
  const source = buildBurnGradientSource({ width: 1920, height: 1080, fps: 30, totalDuration: 12 });
  assert.match(source, /^color=c=black@0:s=1920x1080:r=30:d=0\.016667,format=gbrap,geq=/);
  assert.match(source, /loop=loop=-1:size=1:start=0,setpts=N\/\(30\*TB\),trim=duration=12,format=rgba$/);
  assert.doesNotMatch(source, /gradients=/);
});
