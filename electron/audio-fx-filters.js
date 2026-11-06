'use strict';

/**
 * FFmpeg filters for the per-clip audio effects (low cut, three-band tone, compressor).
 * Ranges and band centres match src/utils/audioFx.ts, which drives the same settings in the preview.
 * Pure functions, so they can be unit tested without running FFmpeg.
 */

const LIMITS = {
    lowCutHz: [0, 400],
    gainDb: [-12, 12],
    thresholdDb: [-50, 0],
    ratio: [1, 20],
    attackMs: [1, 200],
    releaseMs: [10, 1000],
    makeupDb: [0, 24],
};
const BANDS = { lowShelfHz: 120, midHz: 1200, midQ: 0.9, highShelfHz: 6000, shelfQ: 0.707 };

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value));
const num = (value, fallback) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const fmt = (value, precision = 5) => Number(value).toFixed(precision).replace(/\.?0+$/, '') || '0';
const dbToLinear = (db) => Math.pow(10, db / 20);
const hasGain = (db) => Math.abs(db) > 0.05;

/** Same clamping rules as normalizeAudioFx in the app, so a hand-edited project cannot produce a bad filter. */
const normalizeAudioFx = (input) => {
    const source = input && typeof input === 'object' ? input : {};
    const comp = source.compressor && typeof source.compressor === 'object' ? source.compressor : {};
    const lowCut = clamp(num(source.lowCutHz, 0), LIMITS.lowCutHz);
    return {
        lowCutHz: lowCut < 20 ? 0 : Math.round(lowCut),
        lowDb: clamp(num(source.lowDb, 0), LIMITS.gainDb),
        midDb: clamp(num(source.midDb, 0), LIMITS.gainDb),
        highDb: clamp(num(source.highDb, 0), LIMITS.gainDb),
        compressor: {
            enabled: comp.enabled === true,
            thresholdDb: clamp(num(comp.thresholdDb, -24), LIMITS.thresholdDb),
            ratio: clamp(num(comp.ratio, 3), LIMITS.ratio),
            attackMs: clamp(num(comp.attackMs, 20), LIMITS.attackMs),
            releaseMs: clamp(num(comp.releaseMs, 250), LIMITS.releaseMs),
            makeupDb: clamp(num(comp.makeupDb, 0), LIMITS.makeupDb),
        },
    };
};

/** @returns {string[]} filters to add to the clip chain, in signal order. Empty when nothing would change. */
const buildAudioFxFilters = (input) => {
    if (!input) return [];
    const fx = normalizeAudioFx(input);
    const filters = [];
    if (fx.lowCutHz > 0) filters.push(`highpass=f=${fx.lowCutHz}`);
    if (hasGain(fx.lowDb)) filters.push(`bass=g=${fmt(fx.lowDb, 2)}:f=${BANDS.lowShelfHz}:t=q:w=${BANDS.shelfQ}`);
    if (hasGain(fx.midDb)) filters.push(`equalizer=f=${BANDS.midHz}:t=q:w=${BANDS.midQ}:g=${fmt(fx.midDb, 2)}`);
    if (hasGain(fx.highDb)) filters.push(`treble=g=${fmt(fx.highDb, 2)}:f=${BANDS.highShelfHz}:t=q:w=${BANDS.shelfQ}`);
    const c = fx.compressor;
    if (c.enabled && (c.ratio > 1.05 || c.makeupDb > 0.05)) {
        const makeup = Math.max(1, dbToLinear(c.makeupDb));
        filters.push(
            `acompressor=threshold=${fmt(dbToLinear(c.thresholdDb), 6)}:ratio=${fmt(c.ratio, 3)}:attack=${fmt(c.attackMs, 2)}:release=${fmt(c.releaseMs, 2)}:makeup=${fmt(makeup, 4)}`,
        );
    }
    return filters;
};

module.exports = { normalizeAudioFx, buildAudioFxFilters };
