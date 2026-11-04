'use strict';

/**
 * Transitions in the HQ FFmpeg export.
 *
 * In the editor a transition belongs to the clip that is ending (`transitionOut`) and plays over that clip's last
 * `duration` seconds. During those seconds the preview
 *   - fades, slides or zooms the ending clip,
 *   - draws the first frame of the next clip on the same track on top of it (frozen: the next clip has not started),
 *   - and sometimes washes the picture with white or a burn gradient.
 * Every one of those is a closed-form function of progress `p` (0 to 1) and the timeline time, so the export can write
 * the same functions as FFmpeg expressions and get the same picture. The formulas below are copied from
 * src/components/PreviewPlayer.tsx.
 *
 * This file only builds strings and plans extra render entries. The handler turns them into filters.
 */

const formatNumber = (value, precision = 6) => Number(value || 0).toFixed(precision).replace(/\.?0+$/, '') || '0';

/**
 * Per transition, what changes on the ending clip (`out`), on the frozen frame of the next clip (`incoming`)
 * and on the whole picture (`white`, `burn`). Each formula gets progress `p`, the timeline time `t`
 * and the canvas width in pixels `W`, all as expression text. Results:
 *   alpha     0 to 1, multiplied into the clip's opacity
 *   dxPx      sideways shift in pixels
 *   scaleAdd  added to the clip's scale
 *   scaleMul  multiplied into the clip's scale
 *   white     strength (0 to 1) of a white wash over the picture
 *   burn      strength (0 to 1) of the film-burn gradient over the picture
 */
const SPECS = {
    'Cross Fade': {
        out: ({ p }) => ({ alpha: `1-${p}` }),
        incoming: ({ p }) => ({ alpha: p }),
    },
    'Fade to Black': {
        out: ({ p }) => ({ alpha: `1-${p}` }),
        incoming: null,
    },
    'Fade to White': {
        out: ({ p }) => ({ alpha: `1-${p}` }),
        incoming: ({ p }) => ({ alpha: p }),
        white: ({ p }) => `${p}*0.7`,
    },
    'Dip to White': {
        out: ({ p }) => ({ alpha: `if(lt(${p},0.5),1-${p}*2,0)` }),
        incoming: ({ p }) => ({ alpha: `if(gt(${p},0.5),(${p}-0.5)*2,0)` }),
        white: ({ p }) => `max(0,1-abs(${p}*2-1))*0.8`,
    },
    'Zoom In': {
        out: ({ p }) => ({ scaleAdd: `${p}*0.12` }),
        incoming: ({ p }) => ({ alpha: p, scaleMul: `(1.08-${p}*0.08)` }),
    },
    'Swipe Left': {
        out: ({ p, W }) => ({ dxPx: `-${p}*${W}` }),
        incoming: ({ p, W }) => ({ dxPx: `(1-${p})*${W}` }),
    },
    'Glitch Cut': {
        out: ({ p, t }) => ({ alpha: `1-${p}`, dxPx: `sin(${t}*120)*34*(1-${p})` }),
        incoming: ({ p, t }) => ({ alpha: p, dxPx: `sin(${t}*130+1.7)*26*${p}` }),
        white: ({ p }) => `max(0,0.28-abs(${p}-0.5)*0.7)`,
    },
    'Whip Pan': {
        out: ({ p, W }) => ({ dxPx: `-${p}*${W}*1.25` }),
        incoming: ({ p, W }) => ({ dxPx: `(1-${p})*${W}*1.25` }),
    },
    'Lightning Flash': {
        out: ({ p }) => ({ alpha: `if(lt(${p},0.58),1-${p}*1.3,0)` }),
        incoming: ({ p, t }) => ({ alpha: `if(gt(${p},0.34),(${p}-0.34)/0.66,0)`, dxPx: `sin(${t}*80)*8*(1-${p})` }),
        white: ({ p }) => `sin(${p}*PI)*0.95`,
    },
    'Film Burn': {
        out: ({ p }) => ({ alpha: `1-${p}*0.92` }),
        incoming: ({ p }) => ({ alpha: `if(gt(${p},0.18),(${p}-0.18)/0.82,0)` }),
        burn: ({ p }) => `sin(${p}*PI)*0.85`,
    },
};

const isSupportedTransition = (type) => Object.prototype.hasOwnProperty.call(SPECS, type);

/** Progress through the transition at a moment, as expression text. `timeVar` is whatever holds timeline seconds. */
const buildProgressExpression = ({ timeVar, tStart, duration }) => (
    `(min(1,max(0,((${timeVar})-${formatNumber(tStart, 5)})/${formatNumber(Math.max(0.001, duration), 5)})))`
);

const wrapClamp = (expression) => `max(0,min(1,${expression}))`;

/**
 * Expressions for one side of a transition.
 * @param {{ role: 'out' | 'incoming', type: string, tStart: number, duration: number, width: number, timeVar: string }} args
 *   `timeVar` is the expression for timeline seconds where the result will be used (`t`, `T`, or `(t+start)`).
 * @returns {{ alpha?: string, dxPx?: string, scaleAdd?: string, scaleMul?: string }}
 */
const buildTransitionModifiers = ({ role, type, tStart, duration, width, timeVar }) => {
    const spec = SPECS[type];
    const formula = spec && (role === 'incoming' ? spec.incoming : spec.out);
    if (!formula) return {};
    const result = formula({
        p: buildProgressExpression({ timeVar, tStart, duration }),
        t: `(${timeVar})`,
        W: formatNumber(width, 3),
    });
    return {
        ...result,
        ...(result.alpha ? { alpha: wrapClamp(result.alpha) } : {}),
    };
};

/** Strength expression for the white wash or the burn gradient, or null when the transition has none. */
const buildOverlayStrength = ({ kind, type, tStart, duration, timeVar }) => {
    const formula = SPECS[type]?.[kind];
    if (!formula) return null;
    return wrapClamp(formula({ p: buildProgressExpression({ timeVar, tStart, duration }), t: `(${timeVar})` }));
};

/**
 * The entries to render for a sorted list of picture entries: each ending clip is followed by what its transition
 * draws on top of it, in the same drawing order the preview uses.
 *
 * - the ending clip itself gets `transition: { role: 'out', ... }`
 * - a frozen first frame of the next clip on the same track (kind 'clip', isGhost) when the transition has one
 * - a white wash or burn gradient (kind 'white' or 'burn')
 *
 * Entries come from the handler's render plan; only the fields used here are read.
 */
const expandTransitionEntries = (entries) => {
    const expanded = [];
    entries.forEach((entry, index) => {
        const { clip } = entry;
        const type = clip?.transitionOut?.type;
        const duration = Number(clip?.transitionOut?.duration);
        expanded.push(entry);
        if (!type || !(duration > 0) || !isSupportedTransition(type)) return;

        const spec = SPECS[type];
        const tStart = entry.end - duration;
        // before the ending clip starts there is nothing to transition from
        const activeStart = Math.max(tStart, entry.start);
        if (activeStart >= entry.end) return;
        entry.transition = { role: 'out', type, tStart, duration };

        if (spec.incoming) {
            let next = null;
            for (let i = index + 1; i < entries.length; i += 1) {
                const candidate = entries[i];
                if (candidate.clip.trackId !== clip.trackId) break;
                if (candidate.start >= entry.end - 0.001) {
                    next = candidate;
                    break;
                }
            }
            // a title next to the clip is a transparent picture: nothing to show
            if (next && !next.titleBytes) {
                const nextClip = next.clip;
                expanded.push({
                    ...next,
                    isGhost: true,
                    clip: {
                        ...nextClip,
                        id: `${nextClip.id}__transition-in`,
                        // the preview draws the next clip with its still transform and colour settings only
                        keyframes: [],
                        kenBurns: undefined,
                        chromaKey: undefined,
                        blendMode: undefined,
                        transitionOut: undefined,
                        textConfig: undefined,
                        filters: nextClip.filters ? { ...nextClip.filters, customLut: undefined } : nextClip.filters,
                    },
                    start: activeStart,
                    end: entry.end,
                    visibleDuration: entry.end - activeStart,
                    // one frame of the next clip, held
                    sourceOut: next.sourceIn + 1,
                    sourceRange: 1,
                    speed: 1,
                    playbackDuration: 1,
                    volume: 0,
                    volumeKeyframes: [],
                    hasAudio: false,
                    transition: { role: 'incoming', type, tStart, duration },
                });
            }
        }

        ['white', 'burn'].forEach((kind) => {
            if (!spec[kind]) return;
            expanded.push({ kind, start: activeStart, end: entry.end, transition: { role: 'out', type, tStart, duration } });
        });
    });
    return expanded;
};

/**
 * The film-burn wash as a picture source: the preview's four colour stops, each with its own opacity, along the
 * diagonal from the top left to the bottom right. It is worked out for one frame with explicit maths (FFmpeg's
 * `gradients` source is not deterministic) and that frame is repeated for the whole timeline.
 */
const BURN_STOPS = [
    { at: 0, color: [255, 245, 190], alpha: 0.9 },
    { at: 0.38, color: [255, 180, 66], alpha: 0.62 },
    { at: 0.72, color: [255, 86, 28], alpha: 0.45 },
    { at: 1, color: [20, 5, 0], alpha: 0.15 },
];

const buildStopInterpolation = (valueOf) => {
    // piecewise linear in `p`, which is the position along the diagonal (0 to 1)
    let expression = formatNumber(valueOf(BURN_STOPS[BURN_STOPS.length - 1]));
    for (let i = BURN_STOPS.length - 2; i >= 0; i -= 1) {
        const from = BURN_STOPS[i];
        const to = BURN_STOPS[i + 1];
        const span = to.at - from.at;
        const segment = `${formatNumber(valueOf(from))}+(${formatNumber(valueOf(to) - valueOf(from))})*(p-${formatNumber(from.at)})/${formatNumber(span)}`;
        expression = `if(lt(p,${formatNumber(to.at)}),${segment},${expression})`;
    }
    return expression;
};

const buildBurnGradientSource = ({ width, height, fps, totalDuration }) => {
    const position = `((X*${width}+Y*${height})/${width * width + height * height})`;
    const channel = (valueOf) => buildStopInterpolation(valueOf).replace(/\bp\b/g, position);
    return `color=c=black@0:s=${width}x${height}:r=${fps}:d=${formatNumber(0.5 / fps, 6)},format=gbrap,`
        + `geq=r='${channel((stop) => stop.color[0])}':g='${channel((stop) => stop.color[1])}':b='${channel((stop) => stop.color[2])}':a='${channel((stop) => stop.alpha * 255)}',`
        + `loop=loop=-1:size=1:start=0,setpts=N/(${fps}*TB),trim=duration=${formatNumber(totalDuration, 5)},format=rgba`;
};

module.exports = {
    SPECS,
    isSupportedTransition,
    buildProgressExpression,
    buildTransitionModifiers,
    buildOverlayStrength,
    expandTransitionEntries,
    buildBurnGradientSource,
};
