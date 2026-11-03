'use strict';

/**
 * Title clips in the HQ FFmpeg export.
 *
 * The app draws each title to a transparent PNG (src/utils/titleRaster.ts) and sends it as `clip.textRaster`.
 * Here that image becomes an ordinary image clip: this file turns the PNG data URL into bytes and moves the clip's
 * position so the image's centre lands where the preview puts the middle of the text block.
 */

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;
const MAX_PNG_BYTES = 64 * 1024 * 1024;

/** PNG bytes from a data URL, or null when it is not one. */
const decodePngDataUrl = (dataUrl) => {
    if (typeof dataUrl !== 'string') return null;
    const match = PNG_DATA_URL.exec(dataUrl);
    if (!match) return null;
    const bytes = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
    if (bytes.length < 8 || bytes.length > MAX_PNG_BYTES) return null;
    // PNG signature
    if (bytes.readUInt32BE(0) !== 0x89504e47) return null;
    return bytes;
};

const finiteOr = (value, fallback) => (value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback);

const shiftKeyframes = (keyframes, property, delta) => (Array.isArray(keyframes)
    ? keyframes.map((frame) => (frame?.property === property && Number.isFinite(Number(frame.value))
        ? { ...frame, value: Number(frame.value) + delta }
        : frame))
    : keyframes);

/**
 * The clip with its position moved from "centre of the canvas" to "centre of the title block".
 * In the preview a title's x and y (and their keyframes) are offsets from 50 percent added to the block position, while
 * an image clip's x and y are absolute, so shift every x and y value by the block's distance from the canvas centre.
 */
const placeTitleClip = (clip) => {
    const raster = clip.textRaster || {};
    const dx = finiteOr(raster.centerX, 50) - 50;
    const dy = finiteOr(raster.centerY, 50) - 50;
    const transform = clip.transform || { scale: 1, opacity: 1, position: { x: 50, y: 50 } };
    const position = transform.position || { x: 50, y: 50 };
    let keyframes = shiftKeyframes(clip.keyframes, 'x', dx);
    keyframes = shiftKeyframes(keyframes, 'y', dy);
    return {
        ...clip,
        transform: {
            ...transform,
            position: { x: finiteOr(position.x, 50) + dx, y: finiteOr(position.y, 50) + dy },
        },
        keyframes,
    };
};

module.exports = { decodePngDataUrl, placeTitleClip };
