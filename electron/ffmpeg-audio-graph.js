'use strict';

/**
 * Audio side of the HQ FFmpeg export.
 *
 * Pure functions only (no FFmpeg process, no file system), so the graph can be unit tested.
 * Every clip is trimmed, retimed, levelled, normalised to 48 kHz stereo and delayed to its timeline
 * position, then all clips are summed, limited and padded to the length of the picture.
 */

const SAMPLE_RATE = 48000;

const formatNumber = (value, precision = 6) => Number(value || 0).toFixed(precision).replace(/\.?0+$/, '');
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** atempo accepts 0.5 to 2 per instance on every FFmpeg we ship with, so chain instances for anything outside. */
const buildAtempoChain = (speed) => {
    let remaining = Math.max(0.05, Number(speed) || 1);
    const stages = [];
    while (remaining < 0.5 - 1e-9) {
        stages.push(0.5);
        remaining /= 0.5;
    }
    while (remaining > 2 + 1e-9) {
        stages.push(2);
        remaining /= 2;
    }
    if (Math.abs(remaining - 1) > 1e-4) stages.push(remaining);
    return stages.map((stage) => `atempo=${formatNumber(stage, 5)}`);
};

/**
 * Filter chain for one clip.
 * @param {object} entry { start, visibleDuration, sourceIn, sourceOut, speed, playbackDuration, volume, volumeKeyframes }
 * @param {(args: object) => string} buildAnimatedValueExpression the handler's keyframe expression builder
 */
const buildClipAudioChain = (entry, buildAnimatedValueExpression) => {
    const speed = Math.max(0.05, Number(entry.speed) || 1);
    const steps = [
        `atrim=start=${formatNumber(entry.sourceIn, 5)}:end=${formatNumber(entry.sourceOut, 5)}`,
        'asetpts=PTS-STARTPTS',
        `aformat=sample_fmts=fltp:sample_rates=${SAMPLE_RATE}:channel_layouts=stereo`,
        ...buildAtempoChain(speed),
    ];

    if (entry.playbackDuration > entry.visibleDuration + 0.001) {
        steps.push(`atrim=duration=${formatNumber(entry.visibleDuration, 5)}`);
        steps.push('asetpts=PTS-STARTPTS');
    }

    const keyframes = Array.isArray(entry.volumeKeyframes) ? entry.volumeKeyframes : [];
    const baseVolume = clamp(Number.isFinite(Number(entry.volume)) ? Number(entry.volume) : 1, 0, 4);
    if (keyframes.length > 0) {
        const expression = buildAnimatedValueExpression({
            baseValue: baseVolume,
            keyframes,
            speed,
            timeVar: 't',
            minValue: 0,
            maxValue: 4,
        });
        steps.push(`volume='${expression}':eval=frame`);
    } else if (Math.abs(baseVolume - 1) > 0.0001) {
        steps.push(`volume=${formatNumber(baseVolume, 4)}`);
    }

    const delayMs = Math.max(0, Math.round(Number(entry.start) * 1000));
    if (delayMs > 0) steps.push(`adelay=${delayMs}|${delayMs}`);

    return steps.join(',');
};

/**
 * Whole audio graph.
 * @param {Array<{ inputIndex: number, entry: object }>} sources each clip and the FFmpeg input its audio comes from
 * @returns {{ filters: string[], outLabel: string } | null} null when there is nothing to mix
 */
const buildAudioFilterGraph = ({ sources, totalDuration, buildAnimatedValueExpression }) => {
    if (!Array.isArray(sources) || sources.length === 0) return null;

    const filters = [];
    const labels = [];
    sources.forEach(({ inputIndex, entry }, index) => {
        const label = `a${index}`;
        filters.push(`[${inputIndex}:a]${buildClipAudioChain(entry, buildAnimatedValueExpression)}[${label}]`);
        labels.push(`[${label}]`);
    });

    const duration = formatNumber(Math.max(0.05, totalDuration), 5);
    const tail = `alimiter=limit=0.97,apad=whole_dur=${duration},atrim=duration=${duration}`;
    if (labels.length === 1) {
        filters.push(`${labels[0]}${tail}[aout]`);
    } else {
        filters.push(`${labels.join('')}amix=inputs=${labels.length}:duration=longest:dropout_transition=0:normalize=0,${tail}[aout]`);
    }
    return { filters, outLabel: 'aout' };
};

/** Audio codec options for the container and video codec being written. */
const buildAudioEncodingOptions = ({ codec }) => {
    if (codec === 'prores') {
        return ['-c:a pcm_s24le', `-ar ${SAMPLE_RATE}`];
    }
    return ['-c:a aac', '-b:a 256k', `-ar ${SAMPLE_RATE}`];
};

module.exports = {
    SAMPLE_RATE,
    buildAtempoChain,
    buildClipAudioChain,
    buildAudioFilterGraph,
    buildAudioEncodingOptions,
};
