/**
 * Loudness measurement to ITU-R BS.1770-4 / EBU R128: K-weighting, 400 ms blocks with 75 % overlap and the
 * two-stage gate for the integrated figure. Works on decoded samples, so it can run on any clip in the browser.
 *
 * Channel weights are 1 for mono and stereo, which is all the editor handles.
 * The peak is the sample peak, not an oversampled true peak, so it can read a little lower than a broadcast meter.
 */

export type LoudnessResult = {
  /** Integrated loudness in LUFS, or null when the audio is shorter than one block or all silence. */
  integratedLufs: number | null;
  /** Loudest 3-second window in LUFS (null if shorter than 3 s). */
  shortTermMaxLufs: number | null;
  /** Loudest 400 ms block in LUFS. */
  momentaryMaxLufs: number | null;
  /** Highest sample in dBFS, null for silence. */
  peakDb: number | null;
  durationSeconds: number;
};

type Biquad = { b0: number; b1: number; b2: number; a1: number; a2: number };

/** K-weighting filters for any sample rate. At 48 kHz these reproduce the coefficients printed in BS.1770. */
export const kWeightingFilters = (sampleRate: number): [Biquad, Biquad] => {
  // Stage 1: high shelf modelling the head.
  const shelfGainDb = 3.99984385397;
  const shelfQ = 0.7071752369554193;
  const shelfHz = 1681.9744509555319;
  let K = Math.tan((Math.PI * shelfHz) / sampleRate);
  const Vh = Math.pow(10, shelfGainDb / 20);
  const Vb = Math.pow(Vh, 0.4996667741545416);
  let a0 = 1 + K / shelfQ + K * K;
  const shelf: Biquad = {
    b0: (Vh + (Vb * K) / shelfQ + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / shelfQ + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / shelfQ + K * K) / a0,
  };
  // Stage 2: revised low-frequency B-curve, a high pass near 38 Hz.
  const hpHz = 38.13547087613982;
  const hpQ = 0.5003270373253953;
  K = Math.tan((Math.PI * hpHz) / sampleRate);
  a0 = 1 + K / hpQ + K * K;
  const highPass: Biquad = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / hpQ + K * K) / a0,
  };
  return [shelf, highPass];
};

const toLufs = (meanSquare: number) => -0.691 + 10 * Math.log10(meanSquare);

/** Runs both K-weighting stages over one channel and adds each 100 ms slice's energy into `slices`. */
const addChannelEnergy = (samples: Float32Array, filters: [Biquad, Biquad], sliceLength: number, slices: Float64Array) => {
  const [s1, s2] = filters;
  let x1a = 0, x2a = 0, y1a = 0, y2a = 0;
  let x1b = 0, x2b = 0, y1b = 0, y2b = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const ya = s1.b0 * x + s1.b1 * x1a + s1.b2 * x2a - s1.a1 * y1a - s1.a2 * y2a;
    x2a = x1a; x1a = x; y2a = y1a; y1a = ya;
    const yb = s2.b0 * ya + s2.b1 * x1b + s2.b2 * x2b - s2.a1 * y1b - s2.a2 * y2b;
    x2b = x1b; x1b = ya; y2b = y1b; y1b = yb;
    const slice = Math.floor(i / sliceLength);
    if (slice < slices.length) slices[slice] += yb * yb;
  }
};

export const measureLoudness = (channels: Float32Array[], sampleRate: number): LoudnessResult => {
  const usable = channels.filter((channel) => channel && channel.length > 0);
  const length = usable.reduce((max, channel) => Math.max(max, channel.length), 0);
  const durationSeconds = sampleRate > 0 ? length / sampleRate : 0;
  const empty: LoudnessResult = { integratedLufs: null, shortTermMaxLufs: null, momentaryMaxLufs: null, peakDb: null, durationSeconds };
  if (usable.length === 0 || !(sampleRate > 0)) return empty;

  let peak = 0;
  for (const channel of usable) {
    for (let i = 0; i < channel.length; i++) {
      const v = Math.abs(channel[i]);
      if (v > peak) peak = v;
    }
  }
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : null;

  // 100 ms slices; a 400 ms block is four slices, so blocks overlap by 75 %.
  const sliceLength = Math.round(sampleRate * 0.1);
  const sliceCount = Math.floor(length / sliceLength);
  if (sliceCount < 4) return { ...empty, peakDb };

  const filters = kWeightingFilters(sampleRate);
  const slices = new Float64Array(sliceCount);
  for (const channel of usable) addChannelEnergy(channel, filters, sliceLength, slices);

  const blockEnergies: number[] = [];
  for (let i = 0; i + 4 <= sliceCount; i++) {
    blockEnergies.push((slices[i] + slices[i + 1] + slices[i + 2] + slices[i + 3]) / (4 * sliceLength));
  }

  let momentaryMax: number | null = null;
  for (const energy of blockEnergies) {
    if (energy > 0) {
      const l = toLufs(energy);
      if (momentaryMax === null || l > momentaryMax) momentaryMax = l;
    }
  }

  let shortTermMax: number | null = null;
  if (sliceCount >= 30) {
    let window = 0;
    for (let i = 0; i < sliceCount; i++) {
      window += slices[i];
      if (i >= 30) window -= slices[i - 30];
      if (i >= 29 && window > 0) {
        const l = toLufs(window / (30 * sliceLength));
        if (shortTermMax === null || l > shortTermMax) shortTermMax = l;
      }
    }
  }

  // Gate 1: drop blocks below -70 LUFS. Gate 2: drop blocks 10 LU under the mean of what is left.
  const aboveAbsolute = blockEnergies.filter((energy) => energy > 0 && toLufs(energy) > -70);
  let integratedLufs: number | null = null;
  if (aboveAbsolute.length > 0) {
    const meanAbsolute = aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length;
    const relativeThreshold = toLufs(meanAbsolute) - 10;
    const kept = aboveAbsolute.filter((energy) => toLufs(energy) > relativeThreshold);
    if (kept.length > 0) integratedLufs = toLufs(kept.reduce((a, b) => a + b, 0) / kept.length);
  }

  return { integratedLufs, shortTermMaxLufs: shortTermMax, momentaryMaxLufs: momentaryMax, peakDb, durationSeconds };
};

export type GainPlan = {
  gainDb: number;
  /** The clip volume to set (1 is unchanged). */
  volume: number;
  /** True when the louder clip would pass full scale, so it relies on the export limiter. */
  clipsAtFullScale: boolean;
  /** True when the volume had to stop at the editor's maximum. */
  atMaxVolume: boolean;
};

export const MAX_CLIP_VOLUME = 4;

/** Works out the volume that brings a clip, measured at its original level, to a target loudness. */
export const planGainToTarget = (
  measuredLufs: number,
  targetLufs: number,
  peakDb: number | null = null,
): GainPlan => {
  const wantedDb = targetLufs - measuredLufs;
  const wantedVolume = Math.pow(10, wantedDb / 20);
  const volume = Math.min(MAX_CLIP_VOLUME, Math.max(0, wantedVolume));
  const appliedDb = 20 * Math.log10(volume);
  return {
    gainDb: appliedDb,
    volume,
    clipsAtFullScale: peakDb !== null && peakDb + appliedDb > -0.1,
    atMaxVolume: wantedVolume > MAX_CLIP_VOLUME,
  };
};

export const LOUDNESS_TARGETS = [
  { id: 'streaming', label: '−14 LUFS', note: 'YouTube, Spotify, most streaming', lufs: -14 },
  { id: 'social', label: '−16 LUFS', note: 'Social video, podcasts', lufs: -16 },
  { id: 'broadcast', label: '−23 LUFS', note: 'EBU R128 broadcast', lufs: -23 },
] as const;

export const formatLufs = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)} LUFS`);
export const formatDb = (value: number | null) => (value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)} dB`);
