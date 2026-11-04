import type { TimelineClip } from '../types';
import { captionStates } from './captionWords';
import { rasterizeTitle, type TitleRasterResult } from './titleRaster';

export type HqExportClip = TimelineClip & { textRaster?: TitleRasterResult };

interface HqExportProject<TClip extends TimelineClip> {
  timelineClips: TClip[];
  [key: string]: unknown;
}

/**
 * An animated caption changes as each word is spoken, but the export draws one picture per clip. So the caption is
 * split into one clip per lit-word stretch. Keyframes are shifted so motion carries on across the pieces, and the
 * transition (if any) stays on the last piece.
 */
const splitCaptionClip = async (clip: TimelineClip, size: { width: number; height: number }): Promise<HqExportClip[]> => {
  const config = clip.textConfig!;
  const states = captionStates(clip);
  const speed = Math.max(0.05, clip.speed || 1);
  return Promise.all(states.map(async (state, index): Promise<HqExportClip> => {
    const offset = (state.start - clip.start) * speed;
    const duration = state.end - state.start;
    const piece: HqExportClip = {
      ...clip,
      id: `${clip.id}__word${index}`,
      start: state.start,
      end: state.end,
      duration,
      sourceIn: 0,
      sourceOut: duration,
      keyframes: clip.keyframes?.map((frame) => ({ ...frame, time: frame.time - offset })),
      transitionOut: index === states.length - 1 ? clip.transitionOut : undefined,
      textRaster: await rasterizeTitle(config, size.width, size.height, state.activeWord),
    };
    return piece;
  }));
};

/**
 * Add what the HQ export cannot work out for itself: every title clip gets its text drawn to an image at the export
 * size (animated captions get one image per lit word). Everything else passes through unchanged.
 */
export const prepareProjectForHqExport = async <TClip extends TimelineClip, TProject extends HqExportProject<TClip>>(
  project: TProject,
  size: { width: number; height: number },
): Promise<Omit<TProject, 'timelineClips'> & { timelineClips: HqExportClip[] }> => {
  const pieces = await Promise.all(
    project.timelineClips.map(async (clip): Promise<HqExportClip[]> => {
      if (!clip.textConfig) return [clip];
      if (clip.textConfig.captionStyle) return splitCaptionClip(clip, size);
      return [{ ...clip, textRaster: await rasterizeTitle(clip.textConfig, size.width, size.height) }];
    }),
  );
  return { ...project, timelineClips: pieces.flat() };
};
