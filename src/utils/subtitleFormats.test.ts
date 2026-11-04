import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./subtitleFormats.ts');

const SRT = `﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>there</i>\r\nsecond line\r\n\r\n2\r\n00:01:02,5 --> 00:01:04,000\r\n{\\an8}Top line\r\n`;

test('parses SRT with BOM, Windows line endings, tags and short milliseconds', async () => {
  const { parseSubtitles } = await load();
  assert.deepEqual(parseSubtitles(SRT), [
    { start: 1, end: 3.5, text: 'Hello there\nsecond line' },
    { start: 62.5, end: 64, text: 'Top line' },
  ]);
});

test('parses WebVTT with header, notes, styles, cue names, settings and no hours', async () => {
  const { parseSubtitles } = await load();
  const vtt = `WEBVTT - demo

STYLE
::cue { color: yellow }

NOTE this is a comment

intro
00:01.000 --> 00:03.000 align:start position:10%
<v Ann>Hi &amp; welcome</v>

01:00:00.000 --> 01:00:01.250
An hour in
`;
  assert.deepEqual(parseSubtitles(vtt), [
    { start: 1, end: 3, text: 'Hi & welcome' },
    { start: 3600, end: 3601.25, text: 'An hour in' },
  ]);
});

test('drops empty cues and empty ranges and sorts by start', async () => {
  const { parseSubtitles } = await load();
  const out = parseSubtitles('1\n00:00:05,000 --> 00:00:06,000\nlate\n\n2\n00:00:01,000 --> 00:00:01,000\nzero\n\n3\n00:00:02,000 --> 00:00:03,000\n<i></i>\n\n4\n00:00:00,500 --> 00:00:01,500\nfirst');
  assert.deepEqual(out.map((c) => c.text), ['first', 'late']);
  assert.deepEqual(parseSubtitles('not a subtitle file'), []);
});

test('writes SRT and WebVTT', async () => {
  const { formatSrt, formatVtt } = await load();
  const cues = [{ start: 3661.007, end: 3662, text: 'Later' }, { start: 0.5, end: 2, text: 'First\nline' }];
  assert.equal(formatSrt(cues), '1\n00:00:00,500 --> 00:00:02,000\nFirst\nline\n\n2\n01:01:01,007 --> 01:01:02,000\nLater\n');
  assert.equal(formatVtt(cues), 'WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nFirst\nline\n\n01:01:01.007 --> 01:01:02.000\nLater\n');
  assert.equal(formatSrt([]), '');
  assert.equal(formatVtt([]), 'WEBVTT\n');
});

test('a round trip keeps timing to the millisecond', async () => {
  const { formatSrt, formatVtt, parseSubtitles } = await load();
  const cues = [{ start: 1.234, end: 5.678, text: 'One' }, { start: 7, end: 9.999, text: 'Two\nlines' }];
  assert.deepEqual(parseSubtitles(formatSrt(cues)), cues);
  assert.deepEqual(parseSubtitles(formatVtt(cues)), cues);
});

test('a cue text cannot break the VTT timing syntax', async () => {
  const { formatVtt, parseSubtitles } = await load();
  const out = parseSubtitles(formatVtt([{ start: 0, end: 1, text: 'a --> b' }]));
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'a -> b');
});

test('cuesFromClips takes subtitle clips only, by default, at timeline positions', async () => {
  const { cuesFromClips } = await load();
  const clips = [
    { start: 4, end: 6, textConfig: { content: ' Hi \n there ' }, subtitleSegment: {} },
    { start: 0, end: 2, textConfig: { content: 'Lower third' } },
    { start: 1, end: 1, textConfig: { content: 'empty range' }, subtitleSegment: {} },
    { start: 8, end: 9 },
  ];
  assert.deepEqual(cuesFromClips(clips), [{ start: 4, end: 6, text: 'Hi\nthere' }]);
  assert.equal(cuesFromClips(clips, false).length, 2);
});

test('spreadWords gives every word an equal share of the cue', async () => {
  const { spreadWords } = await load();
  assert.deepEqual(spreadWords({ start: 10, end: 12, text: 'one two\nthree four' }), [
    { text: 'one', start: 0, end: 0.5 }, { text: 'two', start: 0.5, end: 1 },
    { text: 'three', start: 1, end: 1.5 }, { text: 'four', start: 1.5, end: 2 },
  ]);
  assert.deepEqual(spreadWords({ start: 0, end: 1, text: '  ' }), []);
});
