'use strict';

/**
 * Compositing helpers for the HQ FFmpeg export: how a clip is laid over the canvas.
 * Pure string builders (no FFmpeg process, no file system access beyond what the caller does),
 * so they are unit tested and the handler stays readable.
 */

const formatNumber = (value, precision = 6) => Number(value || 0).toFixed(precision).replace(/\.?0+$/, '');

/** Editor blend mode name to FFmpeg `blend` mode name. Modes not listed here are not supported. */
const BLEND_MODE_MAP = {
    screen: 'screen',
    overlay: 'overlay',
    multiply: 'multiply',
    darken: 'darken',
    lighten: 'lighten',
    'color-dodge': 'dodge',
    'soft-light': 'softlight',
    difference: 'difference',
};

const resolveBlendMode = (mode) => {
    if (!mode || mode === 'normal') return null;
    return BLEND_MODE_MAP[mode] || null;
};

/**
 * A file path as a filter option value, quoted the way FFmpeg's two parsing levels expect.
 * Windows drive colons and backslashes are the usual way this goes wrong.
 */
const escapeFilterPath = (filePath) => {
    const slashed = String(filePath).replace(/\\/g, '/').replace(/:/g, '\\:');
    // inside single quotes the only special character left is the quote itself
    return `'${slashed.replace(/'/g, "'\\''")}'`;
};

const toNumberArray = (data) => {
    if (!data) return [];
    if (Array.isArray(data) || ArrayBuffer.isView(data)) return Array.from(data);
    // a typed array that went through JSON arrives as { "0": x, "1": y, ... }
    return Object.keys(data).sort((a, b) => Number(a) - Number(b)).map((key) => Number(data[key]));
};

/** The editor's parsed LUT back to .cube text, which FFmpeg's lut3d and lut1d read. */
const serializeCubeLut = (lut) => {
    const values = toNumberArray(lut.data);
    const lines = [];
    if (lut.title) lines.push(`TITLE "${String(lut.title).replace(/"/g, "'")}"`);
    lines.push(`${lut.is3d ? 'LUT_3D_SIZE' : 'LUT_1D_SIZE'} ${lut.size}`);
    const min = Array.isArray(lut.domainMin) ? lut.domainMin : [0, 0, 0];
    const max = Array.isArray(lut.domainMax) ? lut.domainMax : [1, 1, 1];
    lines.push(`DOMAIN_MIN ${min.join(' ')}`);
    lines.push(`DOMAIN_MAX ${max.join(' ')}`);
    for (let i = 0; i + 2 < values.length; i += 3) {
        lines.push(`${values[i].toFixed(6)} ${values[i + 1].toFixed(6)} ${values[i + 2].toFixed(6)}`);
    }
    return `${lines.join('\n')}\n`;
};

const buildLutFilter = (filePath, is3d) => (is3d
    ? `lut3d=file=${escapeFilterPath(filePath)}:interp=tetrahedral`
    : `lut1d=file=${escapeFilterPath(filePath)}`);

/**
 * Lay one prepared clip over the canvas.
 *
 * - normal mode, constant opacity: a plain overlay.
 * - opacity keyframes: overlay the clip at full strength, then blend that result with the untouched canvas.
 * - blend mode: blend the clip's colours with the canvas, mask the result with the clip's alpha, overlay it.
 *   (FFmpeg's overlay has no blend modes, and its blend filter ignores alpha, so the mask is done by hand.)
 *
 * Returns the filter strings to append to the graph.
 */
const buildCompositeFilters = ({
    tag,
    canvasLabel,
    clipLabel,
    nextLabel,
    xExpr,
    yExpr,
    start,
    end,
    width,
    height,
    fps,
    totalDuration,
    blendMode,
    opacityExpr,
}) => {
    const filters = [];
    const range = `between(t,${formatNumber(start, 5)},${formatNumber(end, 5)})`;
    const overlayOptions = (extra = '') => `overlay=x='${xExpr}':y='${yExpr}':enable='${range}':eof_action=pass${extra}`;
    const ffmpegMode = resolveBlendMode(blendMode);

    // Each label can feed only one filter input, so split the canvas for every use.
    const uses = (ffmpegMode ? 2 : 1) + (opacityExpr ? 1 : 0);
    let source = canvasLabel;
    const canvasCopies = [];
    if (uses > 1) {
        for (let i = 0; i < uses; i += 1) canvasCopies.push(`${tag}_cv${i}`);
        filters.push(`[${canvasLabel}]split=${uses}${canvasCopies.map((label) => `[${label}]`).join('')}`);
        source = canvasCopies.shift();
    }
    const resultLabel = opacityExpr ? `${tag}_full` : nextLabel;

    if (!ffmpegMode) {
        filters.push(`[${source}][${clipLabel}]${overlayOptions()}[${resultLabel}]`);
    } else {
        const blendBase = source;
        const overlayBase = canvasCopies.shift();
        filters.push(`color=c=black@0:s=${width}x${height}:r=${fps}:d=${formatNumber(totalDuration, 5)},format=rgba[${tag}_tl]`);
        filters.push(`[${tag}_tl][${clipLabel}]${overlayOptions(':format=auto')}[${tag}_layer]`);
        filters.push(`[${tag}_layer]split=2[${tag}_la][${tag}_lb]`);
        filters.push(`[${tag}_lb]alphaextract[${tag}_mask]`);
        // blend works plane by plane, so on YUV it would multiply chroma planes too. Do it in RGB.
        filters.push(`[${blendBase}]format=gbrp[${tag}_bb]`);
        filters.push(`[${tag}_la]format=gbrp[${tag}_lc]`);
        filters.push(`[${tag}_bb][${tag}_lc]blend=all_mode=${ffmpegMode}[${tag}_bl]`);
        filters.push(`[${tag}_bl][${tag}_mask]alphamerge[${tag}_bla]`);
        filters.push(`[${overlayBase}][${tag}_bla]overlay=format=auto[${resultLabel}]`);
    }

    if (opacityExpr) {
        const original = canvasCopies.shift();
        filters.push(
            `[${original}][${resultLabel}]blend=all_expr='A*(1-(${opacityExpr}))+B*(${opacityExpr})':enable='${range}'[${nextLabel}]`,
        );
    }
    return filters;
};

module.exports = {
    BLEND_MODE_MAP,
    resolveBlendMode,
    escapeFilterPath,
    serializeCubeLut,
    buildLutFilter,
    buildCompositeFilters,
};
