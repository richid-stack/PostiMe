/**
 * Teleprompter maths. Kept free of the DOM so it can be tested.
 *
 * The text scrolls at a reading pace in words per minute. `position` is how far the text has moved up, in pixels:
 * 0 puts the first line on the reading line, and `maxPosition` puts the last line there.
 */

export const MIN_WPM = 60;
export const MAX_WPM = 260;
export const DEFAULT_WPM = 140;

export const clampWpm = (wpm: number): number => {
  if (!Number.isFinite(wpm)) return DEFAULT_WPM;
  return Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm)));
};

export const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;

/** Seconds to read the text at the given pace. */
export const readingSeconds = (text: string, wpm: number): number => (countWords(text) / clampWpm(wpm)) * 60;

/** Pixels per second so that the whole text passes the reading line in `readingSeconds`. */
export const scrollSpeed = (travel: number, text: string, wpm: number): number => {
  const seconds = readingSeconds(text, wpm);
  if (!(seconds > 0) || !(travel > 0)) return 0;
  return travel / seconds;
};

/** Move on by `dt` seconds, never past the end (and never before the start). */
export const advanceScroll = (position: number, dt: number, speed: number, maxPosition: number): number => {
  const next = position + Math.max(0, dt) * Math.max(0, speed);
  return Math.max(0, Math.min(Math.max(0, maxPosition), next));
};

/** How far the text can travel: the full text height, less the last line which stays on the reading line. */
export const maxScrollPosition = (contentHeight: number, lineHeight: number): number =>
  Math.max(0, contentHeight - Math.max(0, lineHeight));
