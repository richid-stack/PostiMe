'use strict';

/**
 * FFmpeg side of the chroma key. The parameter mapping mirrors src/utils/chromaKey.ts
 * (a test keeps the two in step): `similarity` and `blend` use FFmpeg's own distance scale.
 */

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const DEFAULTS = { color: '#00ff00', tolerance: 0.35, softness: 0.25, despill: 0.5 };

const parseHex = (hex) => {
    const normalized = /^#?[0-9a-f]{6}$/i.test(String(hex || '').trim()) ? String(hex).trim().replace('#', '') : '00ff00';
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ];
};

const resolveChromaKeyParams = (config) => {
    const [r, g, b] = parseHex(config?.color);
    const tolerance = clamp(Number.isFinite(Number(config?.tolerance)) ? Number(config.tolerance) : DEFAULTS.tolerance, 0, 1);
    const softness = clamp(config?.softness ?? DEFAULTS.softness, 0, 1);
    const despill = clamp(config?.despill ?? DEFAULTS.despill, 0, 1);
    const spillChannel = g >= r && g >= b ? 1 : (b >= r && b >= g ? 2 : 0);
    return {
        colorHex: `0x${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`,
        similarity: tolerance * 0.5,
        blend: softness * 0.3,
        despill,
        spillChannel,
    };
};

/** Filter chain for one keyed clip. The output carries an alpha channel. */
const buildFfmpegChromaKeyFilter = (config) => {
    const params = resolveChromaKeyParams(config);
    const keyFilter = `chromakey=color=${params.colorHex}:similarity=${params.similarity.toFixed(4)}:blend=${params.blend.toFixed(4)}`;
    // despill only knows green and blue screens, so a red key skips it.
    if (params.spillChannel === 0 || params.despill <= 0) return keyFilter;
    const type = params.spillChannel === 2 ? 'blue' : 'green';
    return `${keyFilter},format=gbrap,despill=type=${type}:mix=${(0.35 + params.despill * 0.45).toFixed(3)}:expand=0`;
};

module.exports = { resolveChromaKeyParams, buildFfmpegChromaKeyFilter };
