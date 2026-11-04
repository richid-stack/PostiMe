import React, { useRef, useState } from 'react';
import type { MediaItem, TimelineClip, TimelineTrack } from '../types';
import type { NormalizedExportSettings } from '../utils/exportSettings';
import { prepareProjectForHqExport } from '../utils/hqExportPrep';
import { SIZE_TARGETS, buildSizeFilename, sameShape, scaleBitrateKbps } from '../utils/multiSize';

interface MultiSizeExportProps {
  /** The settings the single export would use. Size, file name and bitrate are replaced for each target. */
  baseSettings: NormalizedExportSettings;
  projectPath?: string | null;
  mediaItems: MediaItem[];
  timelineClips: TimelineClip[];
  timelineTracks: TimelineTrack[];
}

type RunState = { status: 'waiting' | 'rendering' | 'done' | 'error'; percent: number; detail: string };

/**
 * One master, many sizes. Renders the timeline once per ticked size with the high quality export. Titles are drawn
 * again for each frame, so lower thirds and captions land in the right place; "Fill the frame" crops the picture around
 * a focus point instead of leaving bars.
 */
const MultiSizeExport: React.FC<MultiSizeExportProps> = ({ baseSettings, projectPath, mediaItems, timelineClips, timelineTracks }) => {
  const [selected, setSelected] = useState<string[]>(['9x16', '1x1']);
  const [mode, setMode] = useState<'fit' | 'fill'>('fill');
  const [focusX, setFocusX] = useState(50);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const stopRef = useRef(false);

  const api = typeof window !== 'undefined' ? window.electron?.project : undefined;
  const canRun = Boolean(api?.exportVideo) && Boolean(projectPath) && timelineClips.length > 0;
  const targets = SIZE_TARGETS.filter((target) => selected.includes(target.id));

  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  const setRun = (id: string, state: Partial<RunState>) => setRuns((current) => ({ ...current, [id]: { ...{ status: 'waiting' as const, percent: 0, detail: '' }, ...current[id], ...state } }));

  const start = async () => {
    if (!api?.exportVideo || !projectPath || targets.length === 0) return;
    stopRef.current = false;
    setRunning(true);
    setOutputs({});
    setRuns(Object.fromEntries(targets.map((target) => [target.id, { status: 'waiting', percent: 0, detail: '' } as RunState])));
    for (const target of targets) {
      if (stopRef.current) { setRun(target.id, { status: 'waiting', detail: 'Skipped' }); continue; }
      setRun(target.id, { status: 'rendering', percent: 0 });
      try {
        api.removeExportProgressListener?.();
        api.onExportProgress?.((p: { percent?: number }) => { if (p && typeof p.percent === 'number') setRun(target.id, { percent: p.percent }); });
        // titles are drawn for this frame size, so each size gets its own pictures of them
        const project = await prepareProjectForHqExport({ timelineClips, timelineTracks, mediaItems }, { width: target.width, height: target.height });
        const result = await api.exportVideo({
          folderPath: projectPath,
          project,
          settings: {
            ...baseSettings,
            useFfmpeg: true,
            width: target.width,
            height: target.height,
            bitrateKbps: scaleBitrateKbps(baseSettings.bitrateKbps, baseSettings, target),
            filename: buildSizeFilename(baseSettings.filename, target, baseSettings.container),
            reframe: { mode, focusX: focusX / 100, focusY: 0.5 },
          },
        });
        if (!result?.ok || !result.outputPath) throw new Error(result?.error || 'Export failed.');
        setRun(target.id, { status: 'done', percent: 100, detail: result.outputPath });
        setOutputs((current) => ({ ...current, [target.id]: result.outputPath }));
      } catch (error) {
        setRun(target.id, { status: 'error', detail: error instanceof Error ? error.message : 'Export failed.' });
      }
    }
    api.removeExportProgressListener?.();
    setRunning(false);
  };

  return (
    <section className="app-panel p-6 text-left" aria-label="Export several sizes">
      <h2 className="text-xl font-bold mb-1">One master, many sizes</h2>
      <p className="text-sm app-muted mb-4">Render this timeline in each shape you need, using the codec, container and bitrate chosen above. Titles are redrawn for every size.</p>

      <div className="grid sm:grid-cols-2 gap-2 mb-4">
        {SIZE_TARGETS.map((target) => {
          const run = runs[target.id];
          return (
            <label key={target.id} className="app-card p-3 flex items-start gap-3 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={selected.includes(target.id)} disabled={running} onChange={() => toggle(target.id)} aria-label={`${target.label} ${target.width} by ${target.height}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{target.label} <span className="app-muted font-normal">{target.width}×{target.height}</span></span>
                <span className="block text-xs app-muted">{target.note}{sameShape(target, baseSettings) ? ' · same shape as the master' : ''}</span>
                {run && (
                  <span className="block text-xs mt-1" data-testid={`size-status-${target.id}`}>
                    {run.status === 'rendering' && `Rendering… ${Math.round(run.percent)}%`}
                    {run.status === 'done' && `Done: ${run.detail}`}
                    {run.status === 'error' && <span className="text-red-300">{run.detail}</span>}
                    {run.status === 'waiting' && (run.detail || 'Waiting')}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <label className="text-xs app-muted space-y-1 block">When the shape is different
          <select className="w-full text-sm" value={mode} disabled={running} onChange={(e) => setMode(e.target.value as 'fit' | 'fill')} aria-label="Reframe mode">
            <option value="fill">Fill the frame (crop the edges)</option>
            <option value="fit">Fit the whole picture (bars)</option>
          </select>
        </label>
        {mode === 'fill' && (
          <label className="text-xs app-muted space-y-1 block">Keep this part in view: {focusX === 50 ? 'centre' : focusX < 50 ? `${50 - focusX}% towards the left` : `${focusX - 50}% towards the right`}
            <input type="range" className="w-full" min={0} max={100} step={5} value={focusX} disabled={running} onChange={(e) => setFocusX(Number(e.target.value))} aria-label="Focus position" />
          </label>
        )}
      </div>
      {mode === 'fill' && <p className="text-xs app-muted mb-4">Full-frame pictures are cropped. Logos, picture-in-picture and other clips scaled down stay whole. One focus point applies to every clip.</p>}

      <div className="flex items-center gap-3">
        <button type="button" className="app-button app-primary" disabled={!canRun || running || targets.length === 0} onClick={() => void start()}>
          {running ? 'Rendering…' : `Export ${targets.length} size${targets.length === 1 ? '' : 's'}`}
        </button>
        {running && <button type="button" className="app-button" onClick={() => { stopRef.current = true; }}>Stop after this one</button>}
        {!canRun && <span className="text-xs app-muted">{!api?.exportVideo ? 'Needs the desktop app.' : !projectPath ? 'Save the project to a folder first.' : 'Add clips to the timeline first.'}</span>}
      </div>
      {Object.keys(outputs).length > 0 && !running && <p className="text-xs app-muted mt-3">Files are in the exports folder of your project.</p>}
    </section>
  );
};

export default MultiSizeExport;
