import React, { useEffect, useMemo, useState } from 'react';
import type { ShotPrompt } from '../types';
import { getVideoDuration } from '../utils/helpers';
import { DEFAULT_ANIMATIC_OPTIONS, beatStarts, planAnimatic, type AnimaticBeat, type AnimaticOptions } from '../utils/animatic';

interface AnimaticModalProps {
  shots: ShotPrompt[];
  /** Where on the timeline the cut will start, so the person can see what it follows. */
  startsAfterSeconds: number;
  onBuild: (beats: AnimaticBeat[]) => void;
  onClose: () => void;
}

const clock = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
const BASIS: Record<AnimaticBeat['basis'], string> = { recording: 'from the voiceover', words: 'from the words', video: 'video length', default: 'default length' };

/**
 * Turns the storyboard into a timed cut: each shot's picture (or generated video) in order, held for as long as its
 * voiceover takes, with the temp voiceover underneath. Lengths can be changed per shot before it is built.
 */
const AnimaticModal: React.FC<AnimaticModalProps> = ({ shots, startsAfterSeconds, onBuild, onClose }) => {
  const [options, setOptions] = useState<AnimaticOptions>(DEFAULT_ANIMATIC_OPTIONS);
  const [audioSeconds, setAudioSeconds] = useState<Record<number, number>>({});
  const [videoSeconds, setVideoSeconds] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const audio: Record<number, number> = {};
      const video: Record<number, number> = {};
      await Promise.all(
        shots.flatMap((shot) => [
          shot.voiceoverUrl ? getVideoDuration(shot.voiceoverUrl).then((d) => { if (d > 0) audio[shot.shot] = d; }).catch(() => undefined) : Promise.resolve(),
          shot.videoUrl ? getVideoDuration(shot.videoUrl).then((d) => { if (d > 0) video[shot.shot] = d; }).catch(() => undefined) : Promise.resolve(),
        ]),
      );
      if (cancelled) return;
      setAudioSeconds(audio);
      setVideoSeconds(video);
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, [shots]);

  const plan = useMemo(() => planAnimatic(shots, options, { audioSeconds, videoSeconds }), [shots, options, audioSeconds, videoSeconds]);
  const chosen = useMemo(
    () => plan.beats.filter((b) => !excluded.has(b.shot)).map((b) => ({ ...b, seconds: overrides[b.shot] ?? b.seconds })),
    [plan.beats, excluded, overrides],
  );
  const total = chosen.reduce((sum, b) => sum + b.seconds, 0);
  const starts = beatStarts(chosen, startsAfterSeconds);
  const startByShot = new Map(chosen.map((b, i) => [b.shot, starts[i]]));
  const set = <K extends keyof AnimaticOptions>(key: K, value: AnimaticOptions[K]) => setOptions((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="app-panel w-full max-w-3xl max-h-[88vh] overflow-y-auto p-6 text-left" role="dialog" aria-modal="true" aria-label="Build animatic" data-testid="animatic">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-bold">Build an animatic</h2>
            <p className="text-sm app-muted">Puts your storyboard on the timeline in shot order, each picture held for as long as its voiceover takes.</p>
          </div>
          <button type="button" className="app-button app-secondary text-xs" onClick={onClose}>Close</button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mb-4 text-sm">
          <label className="flex items-center justify-between gap-2">Seconds for a picture with no voiceover
            <input type="number" min={0.5} max={30} step={0.5} className="app-input w-20 text-xs" aria-label="Default seconds" value={options.defaultSeconds} onChange={(e) => set('defaultSeconds', Math.max(0.5, Number(e.target.value) || 3))} />
          </label>
          <label className="flex items-center justify-between gap-2">Reading speed (words a second)
            <input type="number" min={1} max={5} step={0.1} className="app-input w-20 text-xs" aria-label="Words per second" value={options.wordsPerSecond} onChange={(e) => set('wordsPerSecond', Math.max(1, Number(e.target.value) || 2.6))} />
          </label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.preferVideo} onChange={(e) => set('preferVideo', e.target.checked)} /> Use a shot's video when it has one</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={options.includeVoiceover} onChange={(e) => set('includeVoiceover', e.target.checked)} /> Add the voiceover underneath</label>
        </div>

        {loading ? (
          <p className="text-sm app-muted">Reading the lengths of your voiceovers and videos…</p>
        ) : plan.beats.length === 0 ? (
          <p className="text-sm app-muted" data-testid="animatic-empty">None of your shots has a picture yet. Make storyboard images first, then come back.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Shots in the cut">
            {plan.beats.map((beat) => {
              const included = !excluded.has(beat.shot);
              const seconds = overrides[beat.shot] ?? beat.seconds;
              return (
                <li key={beat.shot} className="app-card p-2 flex items-center gap-3" data-testid={`beat-${beat.shot}`} style={included ? undefined : { opacity: 0.5 }}>
                  <input type="checkbox" checked={included} aria-label={`Include ${beat.label}`} onChange={() => setExcluded((prev) => { const next = new Set(prev); if (next.has(beat.shot)) next.delete(beat.shot); else next.add(beat.shot); return next; })} />
                  {beat.kind === 'video' ? <video src={beat.url} muted className="w-24 h-14 object-cover rounded" /> : <img src={beat.url} alt="" className="w-24 h-14 object-cover rounded" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold truncate">{beat.label}{beat.kind === 'video' ? ' · video' : ''}</span>
                    <span className="block text-xs app-muted truncate">{beat.text || 'No voiceover text'}</span>
                    <span className="block text-xs app-muted">{included && startByShot.has(beat.shot) ? `Starts ${clock(startByShot.get(beat.shot)!)} · ` : ''}{overrides[beat.shot] !== undefined ? 'set by you' : BASIS[beat.basis]}{beat.audioUrl ? ' · with voiceover' : ''}</span>
                  </span>
                  <label className="text-xs flex items-center gap-1">
                    <input type="number" min={0.5} max={120} step={0.5} className="app-input w-16 text-xs" aria-label={`Seconds for ${beat.label}`} value={seconds} onChange={(e) => { const v = Number(e.target.value); setOverrides((prev) => ({ ...prev, [beat.shot]: Number.isFinite(v) && v > 0 ? v : beat.seconds })); }} />
                    s
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {plan.skipped.length > 0 && !loading && (
          <p className="text-xs app-muted mt-3" data-testid="animatic-skipped">Left out, no picture yet: {plan.skipped.map((s) => s.label).join(', ')}.</p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
          <span className="text-sm" data-testid="animatic-total">{chosen.length} shot{chosen.length === 1 ? '' : 's'} · {clock(total)} long{startsAfterSeconds > 0 ? `, added after the ${clock(startsAfterSeconds)} already on the timeline` : ''}</span>
          <button type="button" className="app-button app-primary" disabled={chosen.length === 0 || loading} onClick={() => onBuild(chosen)}>Build on the timeline</button>
        </div>
      </section>
    </div>
  );
};

export default AnimaticModal;
