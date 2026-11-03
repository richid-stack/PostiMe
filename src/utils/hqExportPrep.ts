import type { TimelineClip } from '../types';
import { rasterizeTitle, type TitleRasterResult } from './titleRaster';

export type HqExportClip = TimelineClip & { textRaster?: TitleRasterResult };

interface HqExportProject<TClip extends TimelineClip> {
  timelineClips: TClip[];
  [key: string]: unknown;
}

/**
 * Add what the HQ export cannot work out for itself: every title clip gets its text drawn to an image at the export
 * size. Everything else in the project passes through unchanged.
 */
export const prepareProjectForHqExport = async <TClip extends TimelineClip, TProject extends HqExportProject<TClip>>(
  project: TProject,
  size: { width: number; height: number },
): Promise<Omit<TProject, 'timelineClips'> & { timelineClips: HqExportClip[] }> => {
  const timelineClips: HqExportClip[] = await Promise.all(
    project.timelineClips.map(async (clip): Promise<HqExportClip> => {
      if (!clip.textConfig) return clip;
      return { ...clip, textRaster: await rasterizeTitle(clip.textConfig, size.width, size.height) };
    }),
  );
  return { ...project, timelineClips };
};
