import test from 'node:test';
import assert from 'node:assert/strict';

test('teleprompter maths', async () => {
  const t = await import('./teleprompter.ts');

  assert.equal(t.countWords(''), 0);
  assert.equal(t.countWords('  Hello   brave\nnew world  '), 4);

  assert.equal(t.clampWpm(10), t.MIN_WPM);
  assert.equal(t.clampWpm(999), t.MAX_WPM);
  assert.equal(t.clampWpm(141.6), 142);
  assert.equal(t.clampWpm(NaN), t.DEFAULT_WPM);

  const text = Array.from({ length: 140 }, () => 'word').join(' ');
  assert.equal(t.readingSeconds(text, 140), 60, '140 words at 140 wpm take a minute');
  assert.equal(t.readingSeconds(text, 70), 120);

  assert.equal(t.scrollSpeed(600, text, 140), 10, '600px in 60s');
  assert.equal(t.scrollSpeed(0, text, 140), 0);
  assert.equal(t.scrollSpeed(600, '', 140), 0);

  assert.equal(t.advanceScroll(0, 2, 10, 600), 20);
  assert.equal(t.advanceScroll(595, 2, 10, 600), 600, 'stops at the end');
  assert.equal(t.advanceScroll(10, -5, 10, 600), 10, 'time never runs backwards');
  assert.equal(t.advanceScroll(10, 1, 10, -4), 0, 'no travel when the text is shorter than the line');

  assert.equal(t.maxScrollPosition(500, 50), 450);
  assert.equal(t.maxScrollPosition(30, 50), 0);

  // the whole run: reaching the end takes exactly the reading time
  const speed = t.scrollSpeed(450, text, 140);
  let pos = 0;
  for (let i = 0; i < 600; i += 1) pos = t.advanceScroll(pos, 0.1, speed, 450);
  assert.equal(Math.round(pos), 450);
});
