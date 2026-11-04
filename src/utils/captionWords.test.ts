import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./captionWords.ts');

const clip = (extra = {}) => ({
  start: 12, end: 15,
  textConfig: { content: 'one two three' },
  // group starts at 10, so the first word is at 2 seconds
  subtitleSegment: { startOffset: 2, words: [{ start: 2, end: 2.8 }, { start: 3, end: 3.5 }, { start: 4, end: 5 }] },
  ...extra,
});

test('recorded word times are placed on the timeline through the group start', async () => {
  const { captionWordTimings } = await load();
  assert.deepEqual(captionWordTimings(clip()), [{ start: 12, end: 12.8 }, { start: 13, end: 13.5 }, { start: 14, end: 15 }]);
});

test('edited text with a different word count shares the clip time equally', async () => {
  const { captionWordTimings } = await load();
  const timings = captionWordTimings(clip({ textConfig: { content: 'only two' } }));
  assert.deepEqual(timings, [{ start: 12, end: 13.5 }, { start: 13.5, end: 15 }]);
  assert.deepEqual(captionWordTimings(clip({ textConfig: { content: '  ' } })), []);
});

test('the lit word is the last one that has started', async () => {
  const { captionWordTimings, activeCaptionWord } = await load();
  const timings = captionWordTimings(clip());
  assert.equal(activeCaptionWord(timings, 11), -1);
  assert.equal(activeCaptionWord(timings, 12), 0);
  assert.equal(activeCaptionWord(timings, 12.9), 0, 'a pause between words keeps the last word lit');
  assert.equal(activeCaptionWord(timings, 13), 1);
  assert.equal(activeCaptionWord(timings, 14.9), 2);
});

test('captionStates cover the clip once, in order, with no gaps', async () => {
  const { captionStates } = await load();
  const states = captionStates(clip());
  assert.deepEqual(states, [
    { activeWord: 0, start: 12, end: 13 },
    { activeWord: 1, start: 13, end: 14 },
    { activeWord: 2, start: 14, end: 15 },
  ]);
});

test('a late first word gets an unlit state before it', async () => {
  const { captionStates } = await load();
  const states = captionStates(clip({ subtitleSegment: { startOffset: 2, words: [{ start: 2.5, end: 3 }, { start: 3, end: 3.5 }, { start: 4, end: 5 }] } }));
  assert.deepEqual(states.map((s) => s.activeWord), [-1, 0, 1, 2]);
  assert.equal(states[0].start, 12);
  assert.equal(states[states.length - 1].end, 15);
  for (let i = 1; i < states.length; i += 1) assert.equal(states[i].start, states[i - 1].end);
});

test('words timed outside the clip are clamped to it', async () => {
  const { captionStates } = await load();
  const states = captionStates(clip({ subtitleSegment: { startOffset: 0, words: [{ start: -1, end: 0 }, { start: 1, end: 2 }, { start: 9, end: 10 }] } }));
  assert.ok(states.every((s) => s.start >= 12 && s.end <= 15));
  assert.equal(states[states.length - 1].end, 15);
});
