import React, { useCallback, useEffect, useState } from 'react';
import type { MediaItem, TimelineClip } from '../types';
import { AUDIO_FX_LIMITS, AUDIO_FX_PRESETS, DEFAULT_AUDIO_FX, describeAudioFx, isAudioFxActive, normalizeAudioFx, type AudioFx } from '../utils/audioFx';
import { LOUDNESS_TARGETS, formatDb, formatLufs, measureLoudness, planGainToTarget, type LoudnessResult } from '../utils/loudness';

type Props = {
    clip: TimelineClip;
    media: MediaItem;
    onUpdateClip: (clip: TimelineClip) => void;
};

const Slider: React.FC<{ id: string; label: string; value: number; display: string; min: number; max: number; step?: number; onChange: (v: number) => void; onReset?: () => void }> = ({ id, label, value, display, min, max, step = 1, onChange, onReset }) => (
    <label htmlFor={id} className="insp-slider">
        <span className="insp-slider__head">
            <span>{label}</span>
            <span className="insp-slider__value" onDoubleClick={onReset} title={onReset ? 'Double-click to reset' : undefined}>{display}</span>
        </span>
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} onDoubleClick={onReset} />
    </label>
);

const dbText = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`;

type Measure = { state: 'idle' } | { state: 'working' } | { state: 'error'; message: string } | { state: 'done'; result: LoudnessResult; clipId: string };

/** Reads the clip's own sound (its in and out points, before any effect) and measures it. */
const measureClipSource = async (clip: TimelineClip, media: MediaItem): Promise<LoudnessResult> => {
    const response = await fetch(media.url);
    if (!response.ok) throw new Error('Could not read the media file.');
    const bytes = await response.arrayBuffer();
    const Offline = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    const decoder = new Offline(1, 1, 44100);
    const buffer: AudioBuffer = await decoder.decodeAudioData(bytes);
    const rate = buffer.sampleRate;
    const from = Math.max(0, Math.floor((clip.sourceIn ?? 0) * rate));
    const to = Math.min(buffer.length, Math.ceil((clip.sourceOut ?? (clip.sourceIn ?? 0) + clip.duration) * rate));
    if (to - from < rate * 0.4) throw new Error('This clip is too short to measure (it needs at least half a second).');
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).subarray(from, to));
    return measureLoudness(channels, rate);
};

const AudioFxPanel: React.FC<Props> = ({ clip, media, onUpdateClip }) => {
    const fx = normalizeAudioFx(clip.audioFx);
    const volume = clip.volume ?? 1;
    const [measure, setMeasure] = useState<Measure>({ state: 'idle' });

    // A measurement belongs to one clip and one cut of it; drop it when either changes.
    useEffect(() => { setMeasure({ state: 'idle' }); }, [clip.id, clip.sourceIn, clip.sourceOut, media.url]);

    const setFx = useCallback((patch: Partial<AudioFx> | ((current: AudioFx) => AudioFx)) => {
        const next = typeof patch === 'function' ? patch(fx) : { ...fx, ...patch };
        const normalized = normalizeAudioFx(next);
        onUpdateClip({ ...clip, audioFx: isAudioFxActive(normalized) || normalized.compressor.enabled ? normalized : undefined });
    }, [clip, fx, onUpdateClip]);
    const setCompressor = (patch: Partial<AudioFx['compressor']>) => setFx((current) => ({ ...current, compressor: { ...current.compressor, ...patch } }));

    const runMeasure = async () => {
        setMeasure({ state: 'working' });
        try {
            const result = await measureClipSource(clip, media);
            setMeasure({ state: 'done', result, clipId: clip.id });
        } catch (error) {
            setMeasure({ state: 'error', message: error instanceof Error ? error.message : 'Could not measure this clip.' });
        }
    };

    const L = AUDIO_FX_LIMITS;
    const c = fx.compressor;
    const result = measure.state === 'done' ? measure.result : null;
    // What the clip will measure at its current volume (effects are not included).
    const atVolumeDb = volume > 0 ? 20 * Math.log10(volume) : -Infinity;
    const levelNow = result?.integratedLufs != null ? result.integratedLufs + atVolumeDb : null;

    return (
        <div className="insp-body" data-testid="audio-fx-panel">
            <div className="pk-card">
                <Slider id="clip-volume" label="Volume" value={volume} display={`${Math.round(volume * 100)}%`} min={0} max={2} step={0.01} onChange={(v) => onUpdateClip({ ...clip, volume: v })} onReset={() => onUpdateClip({ ...clip, volume: 1 })} />
            </div>

            <section className="fx-section">
                <header className="fx-section__title">Presets</header>
                <div className="pk-chips" data-testid="audio-fx-presets">
                    {AUDIO_FX_PRESETS.map((preset) => (
                        <button key={preset.id} type="button" className="pk-chip pk-chip--accent" title={preset.note} onClick={() => onUpdateClip({ ...clip, audioFx: preset.fx })}>{preset.label}</button>
                    ))}
                    <button type="button" className="pk-chip" disabled={!clip.audioFx} onClick={() => onUpdateClip({ ...clip, audioFx: undefined })}>Reset</button>
                </div>
                <p className="pk-hint" data-testid="audio-fx-summary">{describeAudioFx(clip.audioFx)}</p>
            </section>

            <section className="fx-section">
                <header className="fx-section__title">Tone</header>
                <div className="pk-card">
                    <Slider id="fx-lowcut" label="Low cut" value={fx.lowCutHz} display={fx.lowCutHz > 0 ? `${fx.lowCutHz} Hz` : 'Off'} min={0} max={L.lowCutHz.max} step={10} onChange={(v) => setFx({ lowCutHz: v })} onReset={() => setFx({ lowCutHz: 0 })} />
                    <Slider id="fx-low" label="Low · 120 Hz" value={fx.lowDb} display={dbText(fx.lowDb)} min={L.gainDb.min} max={L.gainDb.max} step={0.5} onChange={(v) => setFx({ lowDb: v })} onReset={() => setFx({ lowDb: 0 })} />
                    <Slider id="fx-mid" label="Mid · 1.2 kHz" value={fx.midDb} display={dbText(fx.midDb)} min={L.gainDb.min} max={L.gainDb.max} step={0.5} onChange={(v) => setFx({ midDb: v })} onReset={() => setFx({ midDb: 0 })} />
                    <Slider id="fx-high" label="High · 6 kHz" value={fx.highDb} display={dbText(fx.highDb)} min={L.gainDb.min} max={L.gainDb.max} step={0.5} onChange={(v) => setFx({ highDb: v })} onReset={() => setFx({ highDb: 0 })} />
                </div>
            </section>

            <section className="fx-section">
                <header className="fx-section__title">Compressor</header>
                <div className="pk-card">
                    <label className="pk-field pk-field--inline">
                        <input type="checkbox" checked={c.enabled} onChange={(event) => setCompressor({ enabled: event.target.checked })} aria-label="Compressor on" />
                        <span>Even out loud and quiet parts</span>
                    </label>
                    <div style={{ opacity: c.enabled ? 1 : 0.45 }} aria-disabled={!c.enabled}>
                        <Slider id="fx-threshold" label="Threshold" value={c.thresholdDb} display={`${Math.round(c.thresholdDb)} dB`} min={L.thresholdDb.min} max={L.thresholdDb.max} onChange={(v) => setCompressor({ thresholdDb: v })} onReset={() => setCompressor({ thresholdDb: DEFAULT_AUDIO_FX.compressor.thresholdDb })} />
                        <Slider id="fx-ratio" label="Ratio" value={c.ratio} display={`${Number(c.ratio.toFixed(1))} : 1`} min={L.ratio.min} max={L.ratio.max} step={0.5} onChange={(v) => setCompressor({ ratio: v })} onReset={() => setCompressor({ ratio: DEFAULT_AUDIO_FX.compressor.ratio })} />
                        <Slider id="fx-attack" label="Attack" value={c.attackMs} display={`${Math.round(c.attackMs)} ms`} min={L.attackMs.min} max={L.attackMs.max} onChange={(v) => setCompressor({ attackMs: v })} onReset={() => setCompressor({ attackMs: DEFAULT_AUDIO_FX.compressor.attackMs })} />
                        <Slider id="fx-release" label="Release" value={c.releaseMs} display={`${Math.round(c.releaseMs)} ms`} min={L.releaseMs.min} max={L.releaseMs.max} step={10} onChange={(v) => setCompressor({ releaseMs: v })} onReset={() => setCompressor({ releaseMs: DEFAULT_AUDIO_FX.compressor.releaseMs })} />
                        <Slider id="fx-makeup" label="Make-up gain" value={c.makeupDb} display={dbText(c.makeupDb)} min={L.makeupDb.min} max={L.makeupDb.max} step={0.5} onChange={(v) => setCompressor({ makeupDb: v })} onReset={() => setCompressor({ makeupDb: 0 })} />
                    </div>
                </div>
                <p className="pk-hint">The preview compressor is an approximation; the exported file uses FFmpeg's compressor, so judge the final level from a render.</p>
            </section>

            <section className="fx-section" data-testid="loudness-meter">
                <header className="fx-section__title">Loudness</header>
                <div className="pk-card">
                    <div className="pk-actions">
                        <button type="button" className="edit-text-btn" onClick={runMeasure} disabled={measure.state === 'working'}>{measure.state === 'working' ? 'Measuring…' : result ? 'Measure again' : 'Measure this clip'}</button>
                    </div>
                    {measure.state === 'error' && <p className="pk-hint" role="alert">{measure.message}</p>}
                    {result && (
                        <>
                            <dl className="insp-facts" data-testid="loudness-result">
                                <div><dt>Integrated</dt><dd className="pk-mono">{formatLufs(result.integratedLufs)}</dd></div>
                                <div><dt>Loudest 3 s</dt><dd className="pk-mono">{formatLufs(result.shortTermMaxLufs)}</dd></div>
                                <div><dt>Loudest 0.4 s</dt><dd className="pk-mono">{formatLufs(result.momentaryMaxLufs)}</dd></div>
                                <div><dt>Peak</dt><dd className="pk-mono">{formatDb(result.peakDb)}</dd></div>
                                {levelNow !== null && Number.isFinite(levelNow) && Math.abs(atVolumeDb) > 0.05 && <div><dt>At this volume</dt><dd className="pk-mono">{formatLufs(levelNow)}</dd></div>}
                            </dl>
                            {result.integratedLufs !== null ? (
                                <div className="pk-field">
                                    <span>Set volume to reach</span>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }} data-testid="loudness-targets">
                                        {LOUDNESS_TARGETS.map((target) => (
                                            <button key={target.id} type="button" className="edit-text-btn edit-text-btn--outline" title={target.note} onClick={() => {
                                                const plan = planGainToTarget(result.integratedLufs as number, target.lufs, result.peakDb);
                                                onUpdateClip({ ...clip, volume: Number(plan.volume.toFixed(4)) });
                                            }}>{target.label}</button>
                                        ))}
                                    </div>
                                </div>
                            ) : <p className="pk-hint">No sound to measure in this part of the clip.</p>}
                            {result.integratedLufs !== null && result.peakDb !== null && levelNow !== null && result.peakDb + atVolumeDb > -0.1 && (
                                <p className="pk-hint" role="status">At this volume the peaks reach full scale, so the export limiter will hold them back.</p>
                            )}
                        </>
                    )}
                    <p className="pk-hint">Measures the clip’s own sound between its in and out points, before the EQ, compressor and any volume keyframes. Peak is a sample peak.</p>
                </div>
            </section>
        </div>
    );
};

export default AudioFxPanel;
