import React, { useMemo, useRef, useState } from 'react';
import { diffPrompts, diffSettings } from '../utils/generationCompare';

export type CompareSide = {
  id: string;
  url: string;
  kind: 'image' | 'video';
  title: string;
  prompt: string;
  settings: Array<[string, string]>;
};

interface GenerationCompareProps {
  a: CompareSide;
  b: CompareSide;
  onClose: () => void;
  /** Loads that result's prompt and settings into the generator so it can be changed and run again. */
  onFork?: (id: string) => void;
}

const Media: React.FC<{ side: CompareSide; videoRef?: React.Ref<HTMLVideoElement> }> = ({ side, videoRef }) => (
  <div className="aspect-video bg-black/60 rounded-lg overflow-hidden">
    {side.kind === 'video' ? (
      <video ref={videoRef} src={side.url} controls muted className="w-full h-full object-contain" />
    ) : (
      <img src={side.url} alt={side.title} className="w-full h-full object-contain" />
    )}
  </div>
);

/** Two results side by side, with what changed between their prompts and settings. */
const GenerationCompare: React.FC<GenerationCompareProps> = ({ a, b, onClose, onFork }) => {
  const [showAll, setShowAll] = useState(false);
  const videoA = useRef<HTMLVideoElement>(null);
  const videoB = useRef<HTMLVideoElement>(null);
  const tokens = useMemo(() => diffPrompts(a.prompt, b.prompt), [a.prompt, b.prompt]);
  const rows = useMemo(() => diffSettings(a.settings, b.settings), [a.settings, b.settings]);
  const changed = rows.filter((row) => row.changed);
  const promptChanged = tokens.some((t) => t.kind !== 'same');
  const bothVideo = a.kind === 'video' && b.kind === 'video';

  const playBoth = () => {
    for (const ref of [videoA, videoB]) {
      const el = ref.current;
      if (!el) continue;
      el.currentTime = 0;
      void el.play().catch(() => undefined);
    }
  };
  const pauseBoth = () => [videoA, videoB].forEach((ref) => ref.current?.pause());

  return (
    <section className="app-panel p-5 space-y-3" aria-label="Compare results" data-testid="generation-compare">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-bold">Compare</span>
        <span className="flex gap-2">
          {bothVideo && (
            <>
              <button type="button" className="app-button app-secondary text-xs" onClick={playBoth}>Play both</button>
              <button type="button" className="app-button app-secondary text-xs" onClick={pauseBoth}>Pause</button>
            </>
          )}
          <button type="button" className="app-button app-secondary text-xs" onClick={onClose}>Close</button>
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {[{ side: a, tag: 'A', ref: videoA }, { side: b, tag: 'B', ref: videoB }].map(({ side, tag, ref }) => (
          <div key={side.id} className="space-y-2" data-testid={`compare-${tag}`}>
            <Media side={side} videoRef={ref} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold truncate">{tag} · {side.title}</span>
              {onFork && <button type="button" className="app-button app-secondary text-xs whitespace-nowrap shrink-0" onClick={() => onFork(side.id)}>Fork {tag}</button>}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-xs app-muted mb-1">Prompt</div>
        {promptChanged ? (
          <p className="app-card p-3 text-sm leading-relaxed select-text" data-testid="prompt-diff">
            {tokens.map((t, i) => (
              <React.Fragment key={i}>
                {t.kind === 'same' && <span>{t.text}</span>}
                {t.kind === 'removed' && <del style={{ background: 'rgba(220, 38, 38, 0.15)', color: '#b91c1c' }} title="Only in A">{t.text}</del>}
                {t.kind === 'added' && <ins style={{ background: 'rgba(22, 163, 74, 0.18)', color: '#15803d', textDecoration: 'none' }} title="Only in B">{t.text}</ins>}
                {' '}
              </React.Fragment>
            ))}
          </p>
        ) : (
          <p className="text-sm app-muted" data-testid="prompt-diff">The prompts are the same.</p>
        )}
        <p className="text-xs app-muted mt-1">Red was only in A, green is only in B.</p>
      </div>

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-xs app-muted">Settings{changed.length === 0 ? ': nothing changed' : `: ${changed.length} changed`}</span>
          {rows.length > changed.length && (
            <button type="button" className="app-button app-secondary text-xs" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Only changes' : `Show all ${rows.length}`}</button>
          )}
        </div>
        {(showAll ? rows : changed).length > 0 && (
          <table className="w-full text-xs" data-testid="settings-diff">
            <thead>
              <tr className="text-left app-muted"><th className="py-1 pr-2 font-normal">Setting</th><th className="py-1 pr-2 font-normal">A</th><th className="py-1 font-normal">B</th></tr>
            </thead>
            <tbody>
              {(showAll ? rows : changed).map((row) => (
                <tr key={row.label} style={row.changed ? { background: 'rgba(245, 158, 11, 0.14)' } : undefined} data-changed={row.changed ? 'true' : 'false'}>
                  <td className="py-1 pr-2 font-semibold">{row.label}</td>
                  <td className="py-1 pr-2 break-words">{row.a}</td>
                  <td className="py-1 break-words">{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
};

export default GenerationCompare;
