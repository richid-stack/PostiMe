import React, { useMemo, useState } from 'react';
import type { MediaItem, TimelineClip } from '../types';
import { countMissingMedia, describeChange, describeRestore, formatAge, type RestorePoint } from '../utils/restorePoints';

interface RestorePointsModalProps {
  points: RestorePoint[];
  currentClips: TimelineClip[];
  mediaItems: MediaItem[];
  ready: boolean;
  saveFailed: boolean;
  onSave: (label: string) => Promise<void> | void;
  onRestore: (point: RestorePoint) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const KIND_LABEL: Record<RestorePoint['kind'], string> = { auto: 'Automatic', manual: 'Saved by you', 'before-restore': 'Before a restore' };

const length = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/** A list of earlier states of the edit. Restoring one saves the current edit first, so a restore can be undone by restoring that. */
const RestorePointsModal: React.FC<RestorePointsModalProps> = ({ points, currentClips, mediaItems, ready, saveFailed, onSave, onRestore, onDelete, onClose }) => {
  const [label, setLabel] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const mediaIds = useMemo(() => mediaItems.map((item) => item.id), [mediaItems]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="app-panel w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 text-left" role="dialog" aria-modal="true" aria-label="Restore points" data-testid="restore-points">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-xl font-bold">Restore points</h2>
            <p className="text-sm app-muted">Earlier states of your edit. The app takes one every few minutes while you work, and you can save one before a big change.</p>
          </div>
          <button type="button" className="app-button app-secondary text-xs" onClick={onClose}>Close</button>
        </div>

        <form
          className="flex flex-wrap gap-2 my-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave(label);
            setLabel('');
          }}
        >
          <input className="app-input flex-1 min-w-[12rem]" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name it, for example Before the recut" aria-label="Restore point name" maxLength={80} />
          <button type="submit" className="app-button app-primary" disabled={currentClips.length === 0}>Save one now</button>
        </form>
        {saveFailed && <p className="text-xs mb-3" role="alert" style={{ color: 'var(--app-danger)' }}>The last save did not go through, so restore points may not last after you close the app.</p>}

        {!ready ? (
          <p className="text-sm app-muted">Loading…</p>
        ) : points.length === 0 ? (
          <p className="text-sm app-muted" data-testid="restore-empty">No restore points yet. Add clips and one is saved after a few minutes, or save one now.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Restore points">
            {points.map((point) => {
              const change = describeRestore(currentClips, point);
              const missing = countMissingMedia(point, mediaIds);
              return (
                <li key={point.id} className="app-card p-3" data-testid={`restore-${point.id}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">{point.label || formatAge(point.createdAt, now)}</span>
                    <span className="text-xs app-muted">{KIND_LABEL[point.kind]} · {new Date(point.createdAt).toLocaleString()}</span>
                  </div>
                  <div className="text-xs app-muted">{point.summary.clips} clip{point.summary.clips === 1 ? '' : 's'} · {point.summary.tracks} track{point.summary.tracks === 1 ? '' : 's'} · {length(point.summary.seconds)} long</div>
                  <div className="text-xs mt-1" data-testid="restore-change">{describeChange(change)}{missing > 0 ? `. ${missing} clip${missing === 1 ? ' uses' : 's use'} media that is no longer in the project.` : ''}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {confirmId === point.id ? (
                      <>
                        <span className="text-xs self-center">Your current edit is saved first. Go back to this one?</span>
                        <button type="button" className="app-button app-primary text-xs" onClick={() => { setConfirmId(null); onRestore(point); }}>Yes, restore</button>
                        <button type="button" className="app-button app-secondary text-xs" onClick={() => setConfirmId(null)}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="app-button app-primary text-xs" disabled={change.same} onClick={() => setConfirmId(point.id)}>Restore</button>
                        <button type="button" className="app-button app-secondary text-xs" onClick={() => onDelete(point.id)}>Delete</button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

export default RestorePointsModal;
