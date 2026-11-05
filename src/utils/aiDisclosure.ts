import type { MediaItem, TimelineClip } from '../types';

export type AiOriginKind = 'ai' | 'not-ai' | 'unknown';

export type AiOrigin = {
  kind: AiOriginKind;
  /** Where the call came from: the app's own record, or the person's mark. */
  basis: 'generated-in-app' | 'marked-by-you' | 'stock' | 'imported';
};

/** Media the app made by processing sound, not by generating it. */
const PROCESSING_ONLY = /mastering|dsp|normali[sz]|denois|loudness/i;

export const classifyOrigin = (item: Pick<MediaItem, 'source' | 'generatedBy' | 'aiOrigin'>): AiOrigin => {
  if (item.aiOrigin === 'ai') return { kind: 'ai', basis: 'marked-by-you' };
  if (item.aiOrigin === 'not-ai') return { kind: 'not-ai', basis: 'marked-by-you' };
  if (item.source === 'generated') {
    if (item.generatedBy && PROCESSING_ONLY.test(item.generatedBy)) return { kind: 'not-ai', basis: 'generated-in-app' };
    return { kind: 'ai', basis: 'generated-in-app' };
  }
  if (item.source === 'unsplash') return { kind: 'not-ai', basis: 'stock' };
  return { kind: 'unknown', basis: 'imported' };
};

export type AssetUse = { clipId: string; start: number; end: number };

export type DisclosureAsset = {
  id: string;
  name: string;
  type: MediaItem['type'];
  origin: AiOrigin;
  model: string;
  prompt: string;
  uses: AssetUse[];
  /** Time on the timeline, with overlapping uses of the same file counted once. */
  seconds: number;
};

export type DisclosureReport = {
  timelineSeconds: number;
  /** Everything on the timeline that came from a media file, one entry per file. */
  assets: DisclosureAsset[];
  ai: DisclosureAsset[];
  /** Imported files the app cannot tell the origin of. */
  unchecked: DisclosureAsset[];
  /** Time during which at least one AI-made clip is on the timeline. */
  aiSeconds: number;
  aiShare: number;
  kinds: { video: boolean; image: boolean; audio: boolean };
};

const unionLength = (spans: Array<[number, number]>): number => {
  const sorted = spans.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = 0;
  let curEnd = -Infinity;
  for (const [a, b] of sorted) {
    if (a > curEnd) {
      if (curEnd > -Infinity) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd > -Infinity) total += curEnd - curStart;
  return total;
};

export const buildDisclosureReport = (mediaItems: MediaItem[], clips: TimelineClip[]): DisclosureReport => {
  const byId = new Map(mediaItems.map((item) => [item.id, item]));
  const uses = new Map<string, AssetUse[]>();
  let timelineSeconds = 0;
  for (const clip of clips) {
    const end = Number(clip.end);
    const start = Number(clip.start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    timelineSeconds = Math.max(timelineSeconds, end);
    // Titles and captions are text the person typed, not a media file.
    if (clip.textConfig || !byId.has(clip.mediaId)) continue;
    const list = uses.get(clip.mediaId) ?? [];
    list.push({ clipId: clip.id, start, end });
    uses.set(clip.mediaId, list);
  }
  const assets: DisclosureAsset[] = [];
  for (const [id, list] of uses) {
    const item = byId.get(id)!;
    list.sort((a, b) => a.start - b.start);
    assets.push({
      id,
      name: item.name,
      type: item.type,
      origin: classifyOrigin(item),
      model: item.generatedBy ?? '',
      prompt: item.prompt ?? '',
      uses: list,
      seconds: unionLength(list.map((u) => [u.start, u.end] as [number, number])),
    });
  }
  assets.sort((a, b) => (a.uses[0]?.start ?? 0) - (b.uses[0]?.start ?? 0));
  const ai = assets.filter((a) => a.origin.kind === 'ai');
  const unchecked = assets.filter((a) => a.origin.kind === 'unknown');
  const aiSeconds = unionLength(ai.flatMap((a) => a.uses.map((u) => [u.start, u.end] as [number, number])));
  return {
    timelineSeconds,
    assets,
    ai,
    unchecked,
    aiSeconds,
    aiShare: timelineSeconds > 0 ? Math.min(1, aiSeconds / timelineSeconds) : 0,
    kinds: { video: ai.some((a) => a.type === 'video'), image: ai.some((a) => a.type === 'image'), audio: ai.some((a) => a.type === 'audio') },
  };
};

const listWords = (words: string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** A sentence a person can paste into a caption or description. Empty when no AI-made media is in the video. */
export const disclosureStatement = (report: DisclosureReport, style: 'short' | 'detailed' = 'short'): string => {
  if (report.ai.length === 0) return '';
  const parts: string[] = [];
  if (report.kinds.video) parts.push('video');
  if (report.kinds.image) parts.push('images');
  if (report.kinds.audio) parts.push('audio');
  const short = `Made with AI: this video includes AI-generated ${listWords(parts)}.`;
  if (style === 'short') return short;
  const models = [...new Set(report.ai.map((a) => a.model.trim()).filter(Boolean))];
  return models.length ? `${short} Tools used: ${listWords(models)}.` : short;
};

export const formatTimecode = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds * 10) / 10);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
};

const csvCell = (value: string | number): string => {
  let text = String(value ?? '');
  // A cell that starts with these is run as a formula by spreadsheet apps.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const originLabel = (origin: AiOrigin): string => {
  if (origin.kind === 'ai') return origin.basis === 'marked-by-you' ? 'AI-made (marked by you)' : 'AI-generated in this app';
  if (origin.kind === 'not-ai') return origin.basis === 'stock' ? 'Stock' : origin.basis === 'marked-by-you' ? 'Not AI (marked by you)' : 'Processed, not generated';
  return 'Imported, origin not checked';
};

/** A record of every file on the timeline: what it is, where it came from, and when it plays. */
export const buildUseLedgerCsv = (report: DisclosureReport): string => {
  const header = ['File', 'Type', 'Origin', 'Tool or model', 'Prompt', 'Seconds on timeline', 'Plays at'];
  const rows = report.assets.map((a) => [
    a.name,
    a.type,
    originLabel(a.origin),
    a.model,
    a.prompt,
    (Math.round(a.seconds * 10) / 10).toString(),
    a.uses.map((u) => `${formatTimecode(u.start)}-${formatTimecode(u.end)}`).join('; '),
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
};
