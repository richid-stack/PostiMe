import type { TimelineClip } from '../types';

/**
 * How a title (a clip with textConfig) is laid out and drawn.
 *
 * The timeline preview, Quick Export (which records the preview) and the HQ export (which draws each title to an
 * image first, see titleRaster.ts) all use these functions, so a title looks the same in all three.
 *
 * Coordinates: layoutTitle works in canvas pixels. drawTitleLocal draws with the middle of the text block at (0, 0),
 * so the caller decides where that point lands (translate) and how large it is (scale).
 */

export type TitleConfig = NonNullable<TimelineClip['textConfig']>;
type TitleBackground = NonNullable<TitleConfig['background']>;

export interface TitleLayout {
  lines: string[];
  lineHeight: number;
  totalHeight: number;
  maxLineWidth: number;
  /** Top-left corner of the text block in canvas pixels, before any keyframed offset. */
  baseBlockX: number;
  baseBlockY: number;
}

export interface TitleColors {
  text: string;
  stroke: string;
  background?: TitleBackground;
}

export interface TitleBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const fillRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
};

/** Measure the text and place the block on the canvas according to its position preset. Null when there is no text. */
export const layoutTitle = (
  ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'>,
  config: TitleConfig,
  canvasWidth: number,
  canvasHeight: number,
): TitleLayout | null => {
  const { content, font, size, position } = config;
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const lineHeight = size * 1.12;
  const totalHeight = Math.max(lineHeight, lines.length * lineHeight);
  ctx.font = `${size}px ${font}`;
  const maxLineWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), size * 0.7);

  let baseBlockX = (canvasWidth - maxLineWidth) / 2;
  let baseBlockY = (canvasHeight - totalHeight) / 2;
  if (position.includes('left')) baseBlockX = canvasWidth * 0.08;
  if (position.includes('right')) baseBlockX = canvasWidth * 0.92 - maxLineWidth;
  if (position.includes('top')) baseBlockY = canvasHeight * 0.08;
  if (position.includes('bottom')) baseBlockY = canvasHeight * 0.9 - totalHeight;

  return { lines, lineHeight, totalHeight, maxLineWidth, baseBlockX, baseBlockY };
};

/**
 * Text and plate colours. `sampledLuminance` is the brightness (0 to 1) of the picture behind the title, which the
 * preview measures when "auto contrast" is on. Pass null to use the colours exactly as configured.
 */
export const resolveTitleColors = (config: TitleConfig, sampledLuminance: number | null): TitleColors => {
  const background = config.background ? { ...config.background } : undefined;
  let text = config.color;
  let stroke = 'rgba(2, 6, 23, 0.92)';

  if (sampledLuminance !== null) {
    if (sampledLuminance > 0.58) {
      text = '#0f172a';
      stroke = 'rgba(248, 250, 252, 0.9)';
      if (background) {
        background.color = '#f8fafc';
        background.opacity = Math.max(0.78, background.opacity ?? 0.78);
      }
    } else {
      text = '#f8fafc';
      stroke = 'rgba(2, 6, 23, 0.96)';
      if (background) {
        background.color = '#020617';
        background.opacity = Math.max(0.72, background.opacity ?? 0.72);
      }
    }
  }
  return { text, stroke, background };
};

const plateRect = (
  layout: TitleLayout,
  config: TitleConfig,
  background: TitleBackground,
  canvasWidth: number,
) => {
  const paddingX = background.paddingX ?? 16;
  const paddingY = background.paddingY ?? 10;
  const localBlockX = -layout.maxLineWidth / 2;
  const localBlockY = -layout.totalHeight / 2;
  const boxHeight = layout.totalHeight + paddingY * 2;
  const boxWidth = layout.maxLineWidth + paddingX * 2;
  let x = localBlockX - paddingX;
  const y = localBlockY - paddingY;
  let width = boxWidth;

  if (background.style === 'lower-third-bar') {
    width = Math.max(boxWidth, canvasWidth * 0.42);
    x = config.position.includes('right')
      ? localBlockX + layout.maxLineWidth - width + paddingX
      : config.position.includes('center')
        ? -width / 2
        : localBlockX - paddingX;
  }
  return { x, y, width, height: boxHeight, radius: background.radius ?? 16 };
};

/**
 * Draw the title with the middle of its block at the origin. The caller sets transform, global alpha and clipping.
 * `blur` (px) is applied to the text only, like the preview's blur keyframes.
 */
export const drawTitleLocal = (
  ctx: CanvasRenderingContext2D,
  layout: TitleLayout,
  config: TitleConfig,
  colors: TitleColors,
  canvasWidth: number,
  blur = 0,
  /** Caption word to light (index among the text's words), or -1 for none. Only used with a caption style. */
  activeWord = -1,
) => {
  const { position, size, font } = config;
  const localBlockX = -layout.maxLineWidth / 2;
  const localBlockY = -layout.totalHeight / 2;
  const textXLocal = position.includes('left')
    ? localBlockX
    : position.includes('right')
      ? localBlockX + layout.maxLineWidth
      : 0;

  ctx.font = `${size}px ${font}`;
  ctx.textAlign = position.includes('left') ? 'left' : position.includes('right') ? 'right' : 'center';
  ctx.textBaseline = 'top';
  ctx.lineWidth = size / 10;

  const { background } = colors;
  if (background && background.enabled !== false) {
    const plate = plateRect(layout, config, background, canvasWidth);
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, background.opacity ?? 0.72));
    ctx.fillStyle = background.color || '#020617';
    fillRoundedRect(ctx, plate.x, plate.y, plate.width, plate.height, plate.radius);
    ctx.restore();
  }

  ctx.strokeStyle = colors.stroke;
  ctx.fillStyle = colors.text;
  ctx.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : 'none';
  const captionStyle = config.captionStyle;
  let wordIndex = 0;
  layout.lines.forEach((line, index) => {
    const lineY = localBlockY + index * layout.lineHeight;
    if (!captionStyle) {
      ctx.strokeText(line, textXLocal, lineY);
      ctx.fillText(line, textXLocal, lineY);
      return;
    }
    // Animated caption: draw word by word so one can be lit. Words keep the spacing a whole line would have.
    const words = line.split(/\s+/).filter(Boolean);
    const space = ctx.measureText(' ').width;
    const widths = words.map((word) => ctx.measureText(word).width);
    const lineWidth = widths.reduce((sum, width) => sum + width, 0) + space * Math.max(0, words.length - 1);
    let x = position.includes('left') ? textXLocal : position.includes('right') ? textXLocal - lineWidth : textXLocal - lineWidth / 2;
    ctx.textAlign = 'left';
    words.forEach((word, i) => {
      ctx.fillStyle = wordIndex === activeWord ? captionStyle.activeColor : colors.text;
      ctx.strokeText(word, x, lineY);
      ctx.fillText(word, x, lineY);
      x += widths[i] + space;
      wordIndex += 1;
    });
  });
};

/**
 * Everything the title can touch, relative to the middle of its block: text, stroke, plate. Used to size the image
 * the HQ export draws the title into. A margin covers glyph overhang and the stroke.
 */
export const measureTitleBounds = (
  layout: TitleLayout,
  config: TitleConfig,
  canvasWidth: number,
): TitleBounds => {
  const margin = config.size * 0.3;
  const localBlockX = -layout.maxLineWidth / 2;
  const localBlockY = -layout.totalHeight / 2;
  let left = localBlockX - margin;
  let right = localBlockX + layout.maxLineWidth + margin;
  let top = localBlockY - margin;
  let bottom = localBlockY + layout.totalHeight + margin;

  const { background } = config;
  if (background && background.enabled !== false) {
    const plate = plateRect(layout, config, background, canvasWidth);
    left = Math.min(left, plate.x);
    right = Math.max(right, plate.x + plate.width);
    top = Math.min(top, plate.y);
    bottom = Math.max(bottom, plate.y + plate.height);
  }
  return { left, right, top, bottom };
};

export interface TitleRasterPlan {
  layout: TitleLayout;
  /** Size of the image the title is drawn into, in pixels (even numbers). */
  width: number;
  height: number;
  /** Middle of the text block as a percentage of the canvas, before any keyframed offset. */
  centerX: number;
  centerY: number;
}

const MAX_RASTER_SIDE = 8192;
const evenCeil = (value: number) => Math.max(2, Math.ceil(value / 2) * 2);

/**
 * Where a title sits and how big an image it needs, for the HQ export (see titleRaster.ts).
 * The image is centred on the middle of the text block, so scaling around the image centre matches the preview.
 * Null when the title has no text.
 */
export const planTitleRaster = (
  ctx: Pick<CanvasRenderingContext2D, 'measureText' | 'font'>,
  config: TitleConfig,
  canvasWidth: number,
  canvasHeight: number,
): TitleRasterPlan | null => {
  const layout = layoutTitle(ctx, config, canvasWidth, canvasHeight);
  if (!layout) return null;
  const bounds = measureTitleBounds(layout, config, canvasWidth);
  const halfWidth = Math.max(-bounds.left, bounds.right);
  const halfHeight = Math.max(-bounds.top, bounds.bottom);
  return {
    layout,
    width: Math.min(MAX_RASTER_SIDE, evenCeil(halfWidth * 2)),
    height: Math.min(MAX_RASTER_SIDE, evenCeil(halfHeight * 2)),
    centerX: ((layout.baseBlockX + layout.maxLineWidth / 2) / canvasWidth) * 100,
    centerY: ((layout.baseBlockY + layout.totalHeight / 2) / canvasHeight) * 100,
  };
};
