import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineClip, TimelineTrack } from '../types';
import { loadRestorePoints, saveRestorePoints } from '../services/restorePointStore';
import { buildRestorePoint, pruneRestorePoints, shouldAutoCapture, type RestorePoint, type RestorePointKind } from '../utils/restorePoints';

const CHECK_EVERY_MS = 60_000;

/**
 * Keeps restore points for the open project. An automatic point is taken at most every five minutes, and only when the
 * edit has changed since the last one. Points you save by hand, and the one saved before a restore, are never pruned.
 */
export const useRestorePoints = (opts: { projectPath?: string | null; storeKey: string; clips: TimelineClip[]; tracks: TimelineTrack[] }) => {
  const { projectPath, storeKey, clips, tracks } = opts;
  const [points, setPoints] = useState<RestorePoint[]>([]);
  const [ready, setReady] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const latest = useRef({ clips, tracks, points });
  latest.current = { clips, tracks, points };
  const storeRef = useRef({ projectPath, storeKey });
  storeRef.current = { projectPath, storeKey };

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setPoints([]);
    void loadRestorePoints(projectPath, storeKey).then((loaded) => {
      if (cancelled) return;
      setPoints(loaded);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [projectPath, storeKey]);

  const commit = useCallback(async (next: RestorePoint[]) => {
    const pruned = pruneRestorePoints(next);
    setPoints(pruned);
    latest.current = { ...latest.current, points: pruned };
    const ok = await saveRestorePoints(storeRef.current.projectPath, storeRef.current.storeKey, pruned);
    setSaveFailed(!ok);
    return pruned;
  }, []);

  const capture = useCallback(
    async (kind: RestorePointKind, label = '') => {
      const { clips: c, tracks: t, points: p } = latest.current;
      const point = buildRestorePoint({ clips: c, tracks: t, kind, label });
      await commit([point, ...p]);
      return point;
    },
    [commit],
  );

  const remove = useCallback(
    async (id: string) => {
      await commit(latest.current.points.filter((p) => p.id !== id));
    },
    [commit],
  );

  useEffect(() => {
    if (!ready) return;
    const timer = window.setInterval(() => {
      const { clips: c, tracks: t, points: p } = latest.current;
      if (shouldAutoCapture({ points: p, clips: c, tracks: t, now: Date.now() })) void capture('auto');
    }, CHECK_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [ready, capture]);

  return { points, ready, saveFailed, capture, remove };
};
