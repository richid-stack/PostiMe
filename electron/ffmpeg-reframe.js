'use strict';

/**
 * Reframing for the HQ FFmpeg export: how a picture is brought to the export size.
 *
 * "fit" keeps the whole picture and leaves bars where the shapes differ (what the editor shows).
 * "fill" scales the picture until it covers the frame and crops the rest, around a focus point, so a 16:9 master
 * becomes a full-frame 9:16 without bars. Only full-frame pictures are filled: a clip scaled down to be a logo,
 * a picture-in-picture or a sticker keeps its shape, otherwise it would be cropped to pieces.
 */

const clamp01 = (value, fallback) => (Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback);

/** @returns {{ mode: 'fit' | 'fill', focusX: number, focusY: number }} */
const normalizeReframe = (value) => ({
    mode: value && value.mode === 'fill' ? 'fill' : 'fit',
    focusX: clamp01(value && value.focusX, 0.5),
    focusY: clamp01(value && value.focusY, 0.5),
});

/** A clip is filled only when it is meant to cover the frame (its scale is at or near 1 or more). */
const isFillEligible = (clip) => {
    if (!clip || clip.textConfig) return false;
    const scale = Number(clip.transform && clip.transform.scale);
    return !Number.isFinite(scale) || scale >= 0.95;
};

const formatNumber = (value) => Number(value).toFixed(4).replace(/\.?0+$/, '') || '0';

/** The FFmpeg filter text that brings one picture to width x height. */
const buildFitFilter = ({ width, height, reframe, clip }) => {
    const settings = normalizeReframe(reframe);
    if (settings.mode !== 'fill' || !isFillEligible(clip)) {
        return `scale=${width}:${height}:force_original_aspect_ratio=decrease,setsar=1`;
    }
    return `scale=${width}:${height}:force_original_aspect_ratio=increase,`
        + `crop=${width}:${height}:x='(iw-${width})*${formatNumber(settings.focusX)}':y='(ih-${height})*${formatNumber(settings.focusY)}',setsar=1`;
};

module.exports = { normalizeReframe, isFillEligible, buildFitFilter };
