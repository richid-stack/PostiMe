/**
 * Word timing for animated captions (the spoken word lights up as it is said).
 *
 * A subtitle clip keeps the time of each word relative to its group (see subtitleSegment). The caption text can be
 * edited afterwards, so words are matched by position: when the edited text has the same number of words as the
 * recorded timings they are used as they are, otherwise the words share the clip's time equally.
 */

export interface CaptionWordTiming {
  start: number;
  end: number;
}

interface CaptionClipLike {
  start: number;
  end: number;
  textConfig?: { content: string };
  subtitleSegment?: { startOffset: number; words: { start: number; end: number }[] };
}

export const contentWords = (content: string): string[] => content.split(/\s+/).filter(Boolean);

/** Start and end, in timeline seconds, of each word of the clip's text. */
export const captionWordTimings = (clip: CaptionClipLike): CaptionWordTiming[] => {
  const count = contentWords(clip.textConfig?.content || '').length;
  if (count === 0) return [];
  const recorded = clip.subtitleSegment?.words;
  if (recorded && recorded.length === count) {
    const groupStart = clip.start - clip.subtitleSegment!.startOffset;
    return recorded.map((word) => ({ start: groupStart + word.start, end: groupStart + word.end }));
  }
  const step = (clip.end - clip.start) / count;
  return Array.from({ length: count }, (_, index) => ({ start: clip.start + index * step, end: clip.start + (index + 1) * step }));
};

/** Index of the word being spoken at `time`: the last word that has started. -1 before the first word. */
export const activeCaptionWord = (timings: CaptionWordTiming[], time: number): number => {
  let active = -1;
  for (let i = 0; i < timings.length; i += 1) {
    if (timings[i].start <= time + 1e-6) active = i;
    else break;
  }
  return active;
};

export interface CaptionState {
  /** Which word is lit, or -1 for none. */
  activeWord: number;
  start: number;
  end: number;
}

/** The stretches of the clip during which one word is lit. Used by the HQ export, which draws each stretch once. */
export const captionStates = (clip: CaptionClipLike): CaptionState[] => {
  const timings = captionWordTimings(clip);
  if (timings.length === 0) return [{ activeWord: -1, start: clip.start, end: clip.end }];
  const boundaries: { activeWord: number; start: number }[] = [];
  if (timings[0].start > clip.start + 0.001) boundaries.push({ activeWord: -1, start: clip.start });
  timings.forEach((timing, index) => boundaries.push({ activeWord: index, start: Math.max(clip.start, timing.start) }));
  const states: CaptionState[] = [];
  boundaries.forEach((entry, index) => {
    const end = index + 1 < boundaries.length ? boundaries[index + 1].start : clip.end;
    const clampedEnd = Math.min(clip.end, end);
    if (clampedEnd - entry.start > 0.001) states.push({ activeWord: entry.activeWord, start: entry.start, end: clampedEnd });
  });
  return states.length > 0 ? states : [{ activeWord: -1, start: clip.start, end: clip.end }];
};
