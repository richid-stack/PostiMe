/**
 * SRT and WebVTT: reading and writing subtitle files.
 *
 * A cue is one subtitle: start and end in seconds, and its text (lines joined with "\n").
 * Parsing is forgiving, because real files come from many tools: byte order marks, Windows line endings, cue numbers
 * or names, WebVTT headers, notes and styles, timestamps with a comma or a dot, hours left out, positioning settings,
 * and formatting tags (<i>, <c.yellow>, {\an8}) that are removed.
 */

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const TIMESTAMP = /(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const TIMING_LINE = new RegExp(`^\\s*(${TIMESTAMP.source})\\s*-->\\s*(${TIMESTAMP.source})`);

const toSeconds = (hours: string | undefined, minutes: string, seconds: string, fraction: string): number => (
  Number(hours || 0) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(fraction.padEnd(3, '0')) / 1000
);

const cleanCueText = (lines: string[]): string => lines
  .map((line) => line
    .replace(/\{\\[^}]*\}/g, '') // {\an8} style overrides
    .replace(/<\/?[^>]+>/g, '') // <i>, <b>, <c.yellow>, <00:00:01.000>
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim())
  .filter(Boolean)
  .join('\n');

/** Cues from SRT or WebVTT text. Cues with no text or an empty time range are dropped. */
export const parseSubtitles = (input: string): SubtitleCue[] => {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const blocks = text.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => TIMING_LINE.test(line));
    if (timingIndex === -1) continue; // header, NOTE, STYLE, REGION blocks have no timing line
    const match = TIMING_LINE.exec(lines[timingIndex]);
    if (!match) continue;
    // groups: 1 whole start, 2-5 start parts, 6 whole end, 7-10 end parts
    const start = toSeconds(match[2], match[3], match[4], match[5]);
    const end = toSeconds(match[7], match[8], match[9], match[10]);
    const cueText = cleanCueText(lines.slice(timingIndex + 1));
    if (!cueText || !(end > start)) continue;
    cues.push({ start, end, text: cueText });
  }
  return cues.sort((a, b) => a.start - b.start);
};

const pad = (value: number, length: number) => String(value).padStart(length, '0');

const formatTimestamp = (seconds: number, separator: ',' | '.'): string => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const ms = totalMs % 1000;
  const totalSeconds = (totalMs - ms) / 1000;
  const s = totalSeconds % 60;
  const m = Math.floor(totalSeconds / 60) % 60;
  const h = Math.floor(totalSeconds / 3600);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}${separator}${pad(ms, 3)}`;
};

const usableCues = (cues: SubtitleCue[]) => cues
  .filter((cue) => cue.text.trim() && cue.end > cue.start)
  .sort((a, b) => a.start - b.start);

export const formatSrt = (cues: SubtitleCue[]): string => {
  const body = usableCues(cues)
    .map((cue, index) => `${index + 1}\n${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}\n${cue.text.trim()}`)
    .join('\n\n');
  return body ? `${body}\n` : '';
};

export const formatVtt = (cues: SubtitleCue[]): string => {
  const body = usableCues(cues)
    .map((cue) => `${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}\n${cue.text.trim().replace(/-->/g, '->')}`)
    .join('\n\n');
  return body ? `WEBVTT\n\n${body}\n` : 'WEBVTT\n';
};

interface SubtitleLikeClip {
  start: number;
  end: number;
  textConfig?: { content: string };
  subtitleSegment?: unknown;
}

/**
 * The timeline's subtitle clips as cues, at their timeline positions.
 * With `onlySubtitles` false every title clip is included (useful for burning-in checks); the default is subtitles only.
 */
export const cuesFromClips = (clips: SubtitleLikeClip[], onlySubtitles = true): SubtitleCue[] => clips
  .filter((clip) => clip.textConfig && (!onlySubtitles || clip.subtitleSegment))
  .map((clip) => ({
    start: clip.start,
    end: clip.end,
    text: (clip.textConfig?.content || '').split('\n').map((line) => line.trim()).filter(Boolean).join('\n'),
  }))
  .filter((cue) => cue.text && cue.end > cue.start)
  .sort((a, b) => a.start - b.start);

/** Spread a cue's words evenly over its time range. Word timing is what later word-by-word caption styles use. */
export const spreadWords = (cue: SubtitleCue): { text: string; start: number; end: number }[] => {
  const words = cue.text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const step = (cue.end - cue.start) / words.length;
  return words.map((word, index) => ({
    text: word,
    start: Number((index * step).toFixed(3)),
    end: Number(((index + 1) * step).toFixed(3)),
  }));
};
