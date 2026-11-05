import type { TimelineClip, TimelineTrack } from '../types';

export type RestorePointKind = 'auto' | 'manual' | 'before-restore';

export type RestorePoint = {
  id: string;
  createdAt: string;
  kind: RestorePointKind;
  label: string;
  fingerprint: string;
  summary: { clips: number; tracks: number; seconds: number };
  clips: TimelineClip[];
  tracks: TimelineTrack[];
};

/** What gets stored. Drawn title images are rebuilt at export, so they are left out to keep points small. */
const storable = (clip: TimelineClip): TimelineClip => {
  const { textRaster: _textRaster, ...rest } = clip as TimelineClip & { textRaster?: unknown };
  return rest as TimelineClip;
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
};

/** Same timeline gives the same string, whatever the key order. FNV-1a, enough to tell edits apart. */
export const fingerprintTimeline = (clips: TimelineClip[], tracks: TimelineTrack[]): string => {
  const text = stable({ clips: clips.map(storable), tracks });
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, '0')}-${text.length}`;
};

export const buildRestorePoint = (opts: {
  clips: TimelineClip[];
  tracks: TimelineTrack[];
  kind: RestorePointKind;
  label?: string;
  now?: Date;
  id?: string;
}): RestorePoint => {
  const now = opts.now ?? new Date();
  const seconds = opts.clips.reduce((max, clip) => (Number.isFinite(clip.end) ? Math.max(max, clip.end) : max), 0);
  return {
    id: opts.id ?? `rp-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now.toISOString(),
    kind: opts.kind,
    label: (opts.label ?? '').trim().slice(0, 80),
    fingerprint: fingerprintTimeline(opts.clips, opts.tracks),
    summary: { clips: opts.clips.length, tracks: opts.tracks.length, seconds },
    clips: opts.clips.map(storable),
    tracks: JSON.parse(JSON.stringify(opts.tracks)) as TimelineTrack[],
  };
};

export const AUTO_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** An automatic point is taken when there is something to keep, it differs from the last one, and enough time has passed. */
export const shouldAutoCapture = (opts: { points: RestorePoint[]; clips: TimelineClip[]; tracks: TimelineTrack[]; now: number; minIntervalMs?: number }): boolean => {
  if (opts.clips.length === 0) return false;
  const latest = opts.points[0];
  if (!latest) return true;
  if (latest.fingerprint === fingerprintTimeline(opts.clips, opts.tracks)) return false;
  return opts.now - new Date(latest.createdAt).getTime() >= (opts.minIntervalMs ?? AUTO_MIN_INTERVAL_MS);
};

/** Newest first. Points you made yourself, and the ones saved before a restore, are never dropped. Only automatic ones are. */
export const pruneRestorePoints = (points: RestorePoint[], maxAuto = 20): RestorePoint[] => {
  let autos = 0;
  return points.filter((point) => {
    if (point.kind !== 'auto') return true;
    autos += 1;
    return autos <= maxAuto;
  });
};

export type TimelineChange = { brought: number; removed: number; changed: number; same: boolean };

/** What restoring `point` would do to the timeline as it is now, counted by clip. */
export const describeRestore = (current: TimelineClip[], point: Pick<RestorePoint, 'clips'>): TimelineChange => {
  const now = new Map(current.map((clip) => [clip.id, stable(storable(clip))]));
  const then = new Map(point.clips.map((clip) => [clip.id, stable(storable(clip))]));
  let brought = 0;
  let removed = 0;
  let changed = 0;
  for (const [id, text] of then) {
    if (!now.has(id)) brought += 1;
    else if (now.get(id) !== text) changed += 1;
  }
  for (const id of now.keys()) if (!then.has(id)) removed += 1;
  return { brought, removed, changed, same: brought + removed + changed === 0 };
};

export const describeChange = (change: TimelineChange): string => {
  if (change.same) return 'Same clips as now';
  const parts: string[] = [];
  if (change.brought) parts.push(`brings back ${change.brought} clip${change.brought === 1 ? '' : 's'}`);
  if (change.removed) parts.push(`removes ${change.removed}`);
  if (change.changed) parts.push(`changes ${change.changed}`);
  return `Restoring ${parts.join(', ')}`;
};

/** Clips in the point whose media is no longer in the project; they come back but show nothing. */
export const countMissingMedia = (point: Pick<RestorePoint, 'clips'>, mediaIds: Iterable<string>): number => {
  const ids = new Set(mediaIds);
  return point.clips.filter((clip) => !clip.textConfig && clip.mediaId && !ids.has(clip.mediaId)).length;
};

export const formatAge = (iso: string, now: number): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};

/** Reads a stored list defensively: anything that is not a well-formed point is dropped. */
export const parseRestorePoints = (raw: unknown): RestorePoint[] => {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return []; }
  }
  const list = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as { points?: unknown }).points) ? (data as { points: unknown[] }).points : [];
  return list
    .filter((p): p is RestorePoint => Boolean(p) && typeof p === 'object' && typeof (p as RestorePoint).id === 'string' && Array.isArray((p as RestorePoint).clips) && Array.isArray((p as RestorePoint).tracks) && typeof (p as RestorePoint).createdAt === 'string')
    .map((p): RestorePoint => ({ ...p, kind: p.kind === 'manual' || p.kind === 'before-restore' ? p.kind : 'auto', label: typeof p.label === 'string' ? p.label : '' }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
};
