import { drawTitleLocal, planTitleRaster, resolveTitleColors, type TitleConfig } from './titleLayout';

/**
 * Titles for the HQ export.
 *
 * FFmpeg cannot lay out text the way the editor does (fonts, plates, lower-third bars), so each title is drawn here,
 * with the same code as the preview, into a transparent image just big enough for it. The export then places that
 * image like any other clip: centre, scale, opacity and keyframes all work through the normal clip path.
 *
 * Not carried over: "auto contrast" (it samples the picture behind the title in the preview, which the export has no
 * access to, so the configured colours are used) and the text blur keyframe.
 */

export interface TitleRaster {
  empty?: false;
  /** PNG as a data URL. */
  data: string;
  width: number;
  height: number;
  /** Middle of the text block, as a percentage of the export canvas (before any keyframed offset). */
  centerX: number;
  centerY: number;
}
export type TitleRasterResult = TitleRaster | { empty: true };

const waitForFont = async (config: TitleConfig) => {
  try {
    await document.fonts?.load(`${config.size}px ${config.font}`);
  } catch {
    // an unknown font just falls back, same as in the preview
  }
};

export const rasterizeTitle = async (
  config: TitleConfig,
  canvasWidth: number,
  canvasHeight: number,
  /** Caption word to light, or -1 for none. */
  activeWord = -1,
): Promise<TitleRasterResult> => {
  await waitForFont(config);
  const canvas = document.createElement('canvas');
  const measuring = canvas.getContext('2d');
  if (!measuring) throw new Error('Could not draw the title for export.');
  const plan = planTitleRaster(measuring, config, canvasWidth, canvasHeight);
  if (!plan) return { empty: true };

  canvas.width = plan.width;
  canvas.height = plan.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the title for export.');
  ctx.clearRect(0, 0, plan.width, plan.height);
  ctx.translate(plan.width / 2, plan.height / 2);
  drawTitleLocal(ctx, plan.layout, config, resolveTitleColors(config, null), canvasWidth, 0, activeWord);

  return {
    data: canvas.toDataURL('image/png'),
    width: plan.width,
    height: plan.height,
    centerX: plan.centerX,
    centerY: plan.centerY,
  };
};
