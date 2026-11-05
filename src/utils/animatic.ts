import type { ShotPrompt } from '../types';

export type AnimaticOptions = {
  /** Seconds for a picture with nothing to time it by. */
  defaultSeconds: number;
  /** How fast the temp voiceover is read, to time a shot by its words when there is no recording yet. */
  wordsPerSecond: number;
  minSeconds: number;
  maxSeconds: number;
  /** Silence after the voiceover ends before the next shot. */
  padSeconds: number;
  /** Use a shot's generated video when it has one, instead of its still. */
  preferVideo: boolean;
  includeVoiceover: boolean;
};

export const DEFAULT_ANIMATIC_OPTIONS: AnimaticOptions = {
  defaultSeconds: 3,
  wordsPerSecond: 2.6,
  minSeconds: 1.5,
  maxSeconds: 12,
  padSeconds: 0.4,
  preferVideo: true,
  includeVoiceover: true,
};

export type AnimaticBeat = {
  shot: number;
  label: string;
  kind: 'image' | 'video';
  url: string;
  audioUrl?: string;
  seconds: number;
  /** Length of the voiceover recording, when it is known. */
  audioSeconds?: number;
  /** What the length came from, shown beside it so it can be judged. */
  basis: 'recording' | 'words' | 'video' | 'default';
  text: string;
};

export type AnimaticSkip = { shot: number; label: string; reason: string };

export type AnimaticPlan = {
  beats: AnimaticBeat[];
  skipped: AnimaticSkip[];
  totalSeconds: number;
};

export const countWords = (text: string | undefined | null): number => (text ?? '').trim().split(/\s+/).filter(Boolean).length;

const round1 = (value: number) => Math.round(value * 10) / 10;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export const shotLabel = (shot: Pick<ShotPrompt, 'shot' | 'sceneNumber' | 'sceneShotNumber' | 'shotLabel'>): string => {
  if (shot.shotLabel?.trim()) return shot.shotLabel.trim();
  if (shot.sceneNumber && shot.sceneShotNumber) return `Scene ${shot.sceneNumber} · Shot ${shot.sceneShotNumber}`;
  return `Shot ${shot.shot}`;
};

/**
 * Turns the storyboard into a timed list for the timeline. A picture is held for as long as its voiceover takes (the
 * recording if there is one, otherwise its words at a speaking pace), or the default length; a generated video keeps
 * its own length. `audioSeconds` and `videoSeconds` are lengths looked up by shot number once the files are loaded.
 */
export const planAnimatic = (
  shots: ShotPrompt[],
  options: Partial<AnimaticOptions> = {},
  lengths: { audioSeconds?: Record<number, number>; videoSeconds?: Record<number, number>; only?: number[] } = {},
): AnimaticPlan => {
  const o: AnimaticOptions = { ...DEFAULT_ANIMATIC_OPTIONS, ...options };
  const only = lengths.only ? new Set(lengths.only) : null;
  const beats: AnimaticBeat[] = [];
  const skipped: AnimaticSkip[] = [];
  const ordered = [...shots].sort((a, b) => a.shot - b.shot);
  for (const shot of ordered) {
    if (only && !only.has(shot.shot)) continue;
    const label = shotLabel(shot);
    const hasVideo = Boolean(shot.videoUrl);
    const hasImage = Boolean(shot.imageUrl);
    if (!hasVideo && !hasImage) {
      skipped.push({ shot: shot.shot, label, reason: 'No picture yet' });
      continue;
    }
    const useVideo = hasVideo && (o.preferVideo || !hasImage);
    const audioUrl = o.includeVoiceover && shot.voiceoverUrl ? shot.voiceoverUrl : undefined;
    const text = (shot.voiceoverText ?? '').trim();
    let seconds: number;
    let basis: AnimaticBeat['basis'];
    if (useVideo && finite(lengths.videoSeconds?.[shot.shot])) {
      seconds = lengths.videoSeconds![shot.shot];
      basis = 'video';
    } else if (audioUrl && finite(lengths.audioSeconds?.[shot.shot])) {
      seconds = Math.min(o.maxSeconds, Math.max(o.minSeconds, lengths.audioSeconds![shot.shot] + o.padSeconds));
      basis = 'recording';
    } else if (o.includeVoiceover && countWords(text) > 0) {
      seconds = Math.min(o.maxSeconds, Math.max(o.minSeconds, countWords(text) / o.wordsPerSecond + o.padSeconds));
      basis = 'words';
    } else {
      seconds = Math.min(o.maxSeconds, Math.max(o.minSeconds, o.defaultSeconds));
      basis = 'default';
    }
    beats.push({
      shot: shot.shot,
      label,
      kind: useVideo ? 'video' : 'image',
      url: (useVideo ? shot.videoUrl : shot.imageUrl) as string,
      audioUrl,
      audioSeconds: audioUrl && finite(lengths.audioSeconds?.[shot.shot]) ? lengths.audioSeconds![shot.shot] : undefined,
      seconds: round1(seconds),
      basis,
      text,
    });
  }
  return { beats, skipped, totalSeconds: round1(beats.reduce((sum, b) => sum + b.seconds, 0)) };
};

/** Start time of each beat when they play one after another from `from`. */
export const beatStarts = (beats: Array<Pick<AnimaticBeat, 'seconds'>>, from = 0): number[] => {
  let cursor = from;
  return beats.map((beat) => {
    const start = cursor;
    cursor += beat.seconds;
    return start;
  });
};
