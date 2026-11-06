/**
 * Per-clip audio effects: a low cut, a three-band tone control and a compressor.
 *
 * The same settings drive the preview (Web Audio) and the HQ export (FFmpeg). The ranges and the centre
 * frequencies here must match `electron/audio-fx-filters.js`, which builds the export filters.
 */

export type AudioFx = {
  /** High-pass filter in Hz. 0 is off. */
  lowCutHz: number;
  /** Low shelf gain (below about 120 Hz), in dB. */
  lowDb: number;
  /** Mid bell gain (around 1.2 kHz), in dB. */
  midDb: number;
  /** High shelf gain (above about 6 kHz), in dB. */
  highDb: number;
  compressor: {
    enabled: boolean;
    /** Level above which the compressor works, in dB below full scale (negative). */
    thresholdDb: number;
    /** Compression ratio, N to 1. */
    ratio: number;
    attackMs: number;
    releaseMs: number;
    /** Gain added after compressing, in dB. */
    makeupDb: number;
  };
};

export const AUDIO_FX_LIMITS = {
  lowCutHz: { min: 0, max: 400 },
  gainDb: { min: -12, max: 12 },
  thresholdDb: { min: -50, max: 0 },
  ratio: { min: 1, max: 20 },
  attackMs: { min: 1, max: 200 },
  releaseMs: { min: 10, max: 1000 },
  makeupDb: { min: 0, max: 24 },
} as const;

/** Where the three bands sit. Shared by the preview and the export. */
export const AUDIO_FX_BANDS = {
  lowShelfHz: 120,
  midHz: 1200,
  midQ: 0.9,
  highShelfHz: 6000,
} as const;

export const DEFAULT_AUDIO_FX: AudioFx = {
  lowCutHz: 0,
  lowDb: 0,
  midDb: 0,
  highDb: 0,
  compressor: { enabled: false, thresholdDb: -24, ratio: 3, attackMs: 20, releaseMs: 250, makeupDb: 0 },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/** Fills missing fields and pulls every value into its range, so saved or hand-edited projects cannot break a render. */
export const normalizeAudioFx = (input: Partial<AudioFx> | null | undefined): AudioFx => {
  const source = input || {};
  const comp: Partial<AudioFx['compressor']> = source.compressor || {};
  const d = DEFAULT_AUDIO_FX;
  const L = AUDIO_FX_LIMITS;
  const lowCut = clamp(num(source.lowCutHz, d.lowCutHz), L.lowCutHz.min, L.lowCutHz.max);
  return {
    // Below 20 Hz a high-pass does nothing audible, so treat it as off.
    lowCutHz: lowCut < 20 ? 0 : Math.round(lowCut),
    lowDb: clamp(num(source.lowDb, 0), L.gainDb.min, L.gainDb.max),
    midDb: clamp(num(source.midDb, 0), L.gainDb.min, L.gainDb.max),
    highDb: clamp(num(source.highDb, 0), L.gainDb.min, L.gainDb.max),
    compressor: {
      enabled: comp.enabled === true,
      thresholdDb: clamp(num(comp.thresholdDb, d.compressor.thresholdDb), L.thresholdDb.min, L.thresholdDb.max),
      ratio: clamp(num(comp.ratio, d.compressor.ratio), L.ratio.min, L.ratio.max),
      attackMs: clamp(num(comp.attackMs, d.compressor.attackMs), L.attackMs.min, L.attackMs.max),
      releaseMs: clamp(num(comp.releaseMs, d.compressor.releaseMs), L.releaseMs.min, L.releaseMs.max),
      makeupDb: clamp(num(comp.makeupDb, 0), L.makeupDb.min, L.makeupDb.max),
    },
  };
};

const NEAR_ZERO = 0.05;

/** True when the settings would change the sound at all. */
export const isAudioFxActive = (input: Partial<AudioFx> | null | undefined): boolean => {
  if (!input) return false;
  const fx = normalizeAudioFx(input);
  return (
    fx.lowCutHz > 0 ||
    Math.abs(fx.lowDb) > NEAR_ZERO ||
    Math.abs(fx.midDb) > NEAR_ZERO ||
    Math.abs(fx.highDb) > NEAR_ZERO ||
    (fx.compressor.enabled && (fx.compressor.ratio > 1.05 || fx.compressor.makeupDb > NEAR_ZERO))
  );
};

export type AudioFxPreset = { id: string; label: string; note: string; fx: AudioFx };

const preset = (id: string, label: string, note: string, patch: Partial<AudioFx>): AudioFxPreset => ({
  id,
  label,
  note,
  fx: normalizeAudioFx({ ...DEFAULT_AUDIO_FX, ...patch }),
});

export const AUDIO_FX_PRESETS: AudioFxPreset[] = [
  preset('voice-clean', 'Voice clean-up', 'Cuts rumble, adds a little presence, evens out the level', {
    lowCutHz: 90, lowDb: -2, midDb: 2, highDb: 1.5,
    compressor: { enabled: true, thresholdDb: -24, ratio: 3, attackMs: 15, releaseMs: 200, makeupDb: 4 },
  }),
  preset('warm', 'Warm voice', 'Fuller low end and a softer top', {
    lowCutHz: 70, lowDb: 3, midDb: 0, highDb: -2,
    compressor: { enabled: true, thresholdDb: -22, ratio: 2.5, attackMs: 25, releaseMs: 250, makeupDb: 3 },
  }),
  preset('bright', 'Bright and punchy', 'More bite for voice-over on busy music', {
    lowCutHz: 100, lowDb: -2, midDb: 3, highDb: 4,
    compressor: { enabled: true, thresholdDb: -26, ratio: 4, attackMs: 10, releaseMs: 150, makeupDb: 5 },
  }),
  preset('phone', 'Telephone', 'Thin, mid-heavy sound of a phone line', { lowCutHz: 300, lowDb: -12, midDb: 6, highDb: -12 }),
  preset('music-bed', 'Music under voice', 'Scoops the mids so speech sits on top', {
    lowCutHz: 0, lowDb: 0, midDb: -4, highDb: 0,
  }),
  preset('tame', 'Tame the peaks', 'Compression only, for uneven recordings', {
    compressor: { enabled: true, thresholdDb: -20, ratio: 4, attackMs: 10, releaseMs: 200, makeupDb: 3 },
  }),
];

/** One line for a tooltip or the inspector summary. */
export const describeAudioFx = (input: Partial<AudioFx> | null | undefined): string => {
  if (!isAudioFxActive(input)) return 'No audio effects';
  const fx = normalizeAudioFx(input);
  const parts: string[] = [];
  if (fx.lowCutHz > 0) parts.push(`low cut ${fx.lowCutHz} Hz`);
  const sign = (v: number) => `${v > 0 ? '+' : ''}${Number(v.toFixed(1))}`;
  const tone: string[] = [];
  if (Math.abs(fx.lowDb) > NEAR_ZERO) tone.push(`low ${sign(fx.lowDb)}`);
  if (Math.abs(fx.midDb) > NEAR_ZERO) tone.push(`mid ${sign(fx.midDb)}`);
  if (Math.abs(fx.highDb) > NEAR_ZERO) tone.push(`high ${sign(fx.highDb)}`);
  if (tone.length) parts.push(`EQ ${tone.join(', ')} dB`);
  if (fx.compressor.enabled) parts.push(`compressor ${Number(fx.compressor.ratio.toFixed(1))}:1 above ${Math.round(fx.compressor.thresholdDb)} dB`);
  return parts.join(' · ');
};
