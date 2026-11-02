const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAtempoChain,
  buildAudioEncodingOptions,
  buildAudioFilterGraph,
  buildClipAudioChain,
} = require('./ffmpeg-audio-graph');

const expression = ({ baseValue, keyframes }) => `kf(${baseValue},${keyframes.length})`;
const entry = (overrides = {}) => ({
  start: 0,
  visibleDuration: 4,
  sourceIn: 0,
  sourceOut: 4,
  speed: 1,
  playbackDuration: 4,
  volume: 1,
  volumeKeyframes: [],
  ...overrides,
});

test('buildAtempoChain stays inside 0.5 to 2 per stage', () => {
  assert.deepEqual(buildAtempoChain(1), []);
  assert.deepEqual(buildAtempoChain(1.5), ['atempo=1.5']);
  assert.deepEqual(buildAtempoChain(4), ['atempo=2', 'atempo=2']);
  assert.deepEqual(buildAtempoChain(0.25), ['atempo=0.5', 'atempo=0.5']);
  const product = buildAtempoChain(0.1).map((stage) => Number(stage.split('=')[1])).reduce((a, b) => a * b, 1);
  assert.ok(Math.abs(product - 0.1) < 1e-3);
});

test('a clip is trimmed, normalised to stereo, levelled and delayed to its position', () => {
  const chain = buildClipAudioChain(entry({ start: 1.5, sourceIn: 2, sourceOut: 5, volume: 0.5 }), expression);
  assert.equal(
    chain,
    'atrim=start=2:end=5,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=0.5,adelay=1500|1500',
  );
});

test('volume 1 and start 0 add no filters', () => {
  const chain = buildClipAudioChain(entry(), expression);
  assert.doesNotMatch(chain, /volume|adelay|atempo/);
});

test('volume keyframes become an expression evaluated per frame', () => {
  const chain = buildClipAudioChain(entry({ volumeKeyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }), expression);
  assert.match(chain, /volume='kf\(1,2\)':eval=frame/);
});

test('speed adds tempo stages and trims when the retimed audio overruns the clip', () => {
  const chain = buildClipAudioChain(entry({ speed: 0.5, sourceOut: 4, playbackDuration: 8, visibleDuration: 3 }), expression);
  assert.match(chain, /atempo=0\.5/);
  assert.match(chain, /atrim=duration=3/);
});

test('buildAudioFilterGraph returns null with nothing to mix', () => {
  assert.equal(buildAudioFilterGraph({ sources: [], totalDuration: 4, buildAnimatedValueExpression: expression }), null);
});

test('one source skips amix; several are summed without normalising', () => {
  const one = buildAudioFilterGraph({ sources: [{ inputIndex: 2, entry: entry() }], totalDuration: 4, buildAnimatedValueExpression: expression });
  assert.equal(one.outLabel, 'aout');
  assert.ok(one.filters[0].startsWith('[2:a]'));
  assert.doesNotMatch(one.filters.join(';'), /amix/);

  const two = buildAudioFilterGraph({
    sources: [{ inputIndex: 1, entry: entry() }, { inputIndex: 2, entry: entry({ start: 1 }) }],
    totalDuration: 4,
    buildAnimatedValueExpression: expression,
  });
  const last = two.filters[two.filters.length - 1];
  assert.match(last, /\[a0\]\[a1\]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0\.97,apad=whole_dur=4,atrim=duration=4\[aout\]/);
});

test('audio is padded and cut to the picture length', () => {
  const graph = buildAudioFilterGraph({ sources: [{ inputIndex: 1, entry: entry() }], totalDuration: 7.25, buildAnimatedValueExpression: expression });
  assert.match(graph.filters[graph.filters.length - 1], /apad=whole_dur=7\.25,atrim=duration=7\.25/);
});

test('ProRes gets uncompressed audio, everything else AAC', () => {
  assert.deepEqual(buildAudioEncodingOptions({ codec: 'prores', container: 'mov' }), ['-c:a pcm_s24le', '-ar 48000']);
  assert.deepEqual(buildAudioEncodingOptions({ codec: 'h264', container: 'mp4' }), ['-c:a aac', '-b:a 256k', '-ar 48000']);
});
