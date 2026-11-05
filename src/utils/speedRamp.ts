export type RampPresetId = 'slow-hit' | 'ease-slow' | 'ease-fast' | 'punch-in' | 'whoosh';

export type RampPreset = {
  id: RampPresetId;
  label: string;
  note: string;
  /** Speed at a position u from 0 (start of the clip) to 1 (end), as a multiple of normal speed. */
  speedAt: (u: number) => number;
};

const smooth = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
};
/** Moves between two speeds evenly in feel (a halving is as big a step as a doubling). */
const between = (a: number, b: number, s: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * s);
/** 0 at both ends, 1 in the middle. */
const bump = (u: number) => smooth(1 - Math.abs(u * 2 - 1));

export const RAMP_PRESETS: RampPreset[] = [
  { id: 'slow-hit', label: 'Slow-mo hit', note: 'Normal, drops to a quarter speed in the middle, then back', speedAt: (u) => between(1, 0.25, bump(u)) },
  { id: 'ease-slow', label: 'Ease into slow', note: 'Normal at the start, slowing to a third by the end', speedAt: (u) => between(1, 0.33, smooth(u)) },
  { id: 'ease-fast', label: 'Speed up', note: 'Normal at the start, rising to 3×', speedAt: (u) => between(1, 3, smooth(u)) },
  { id: 'punch-in', label: 'Slow then snap', note: 'Starts at a third speed and eases up to normal', speedAt: (u) => between(0.33, 1, smooth(u)) },
  { id: 'whoosh', label: 'Whoosh', note: 'Normal, up to 3× in the middle, then back', speedAt: (u) => between(1, 3, bump(u)) },
];

export type RampSegment = {
  sourceIn: number;
  sourceOut: number;
  speed: number;
  /** Seconds this piece takes on the timeline. */
  length: number;
};

export const MIN_SEGMENT_SECONDS = 0.1;
export const RAMP_SPEED_MIN = 0.25;
export const RAMP_SPEED_MAX = 4;

/**
 * Cuts a stretch of source into consecutive pieces, each at its own constant speed, so that together they follow the
 * preset's curve. The editor and the export both already play any clip at a constant speed, so a ramp built this way
 * looks and renders the same in both with nothing extra to keep in step.
 */
export const buildRampSegments = (opts: { sourceIn: number; sourceOut: number; preset: RampPresetId; steps?: number }): RampSegment[] => {
  const preset = RAMP_PRESETS.find((p) => p.id === opts.preset);
  const total = opts.sourceOut - opts.sourceIn;
  if (!preset || !Number.isFinite(total) || total <= 0) return [];
  // Short clips get fewer pieces so none is shorter than a tenth of a second at its speed.
  const wanted = Math.max(2, Math.round(opts.steps ?? 12));
  const steps = Math.max(2, Math.min(wanted, Math.floor(total / (MIN_SEGMENT_SECONDS * RAMP_SPEED_MAX)) || 2));
  const width = total / steps;
  const out: RampSegment[] = [];
  for (let i = 0; i < steps; i++) {
    const speed = Math.round(Math.min(RAMP_SPEED_MAX, Math.max(RAMP_SPEED_MIN, preset.speedAt((i + 0.5) / steps))) * 1000) / 1000;
    const sourceIn = i === 0 ? opts.sourceIn : out[i - 1].sourceOut;
    const sourceOut = i === steps - 1 ? opts.sourceOut : opts.sourceIn + width * (i + 1);
    out.push({ sourceIn, sourceOut, speed, length: (sourceOut - sourceIn) / speed });
  }
  return out;
};

export const totalRampLength = (segments: RampSegment[]): number => segments.reduce((sum, s) => sum + s.length, 0);
