/**
 * "One master, many sizes": the sizes a finished edit is usually delivered in, and how each one is named and rated.
 */

export interface SizeTarget {
  id: string;
  label: string;
  note: string;
  width: number;
  height: number;
}

export const SIZE_TARGETS: SizeTarget[] = [
  { id: '16x9', label: '16:9 Landscape', note: 'YouTube, web, TV', width: 1920, height: 1080 },
  { id: '9x16', label: '9:16 Vertical', note: 'TikTok, Reels, Shorts', width: 1080, height: 1920 },
  { id: '1x1', label: '1:1 Square', note: 'Feed posts, ads', width: 1080, height: 1080 },
  { id: '4x5', label: '4:5 Portrait', note: 'Instagram and Facebook feed', width: 1080, height: 1350 },
];

/** "launch.mp4" and 9x16 become "launch-9x16.mp4". Anything that is not safe in a file name is dropped. */
export const buildSizeFilename = (baseName: string, target: Pick<SizeTarget, 'id'>, extension: string): string => {
  const stem = baseName
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'export';
  return `${stem}-${target.id}.${extension.replace(/^\./, '')}`;
};

/**
 * Bitrate for a size, scaled from the master's by picture area so a smaller frame is not over-fed and a bigger one is
 * not starved. Never below 2 Mbit/s.
 */
export const scaleBitrateKbps = (baseKbps: number, base: { width: number; height: number }, target: { width: number; height: number }): number => {
  const ratio = (target.width * target.height) / Math.max(1, base.width * base.height);
  return Math.max(2000, Math.round(baseKbps * ratio));
};

/** True when the target has the same shape as the master, where fit and fill make no difference. */
export const sameShape = (a: { width: number; height: number }, b: { width: number; height: number }): boolean =>
  Math.abs(a.width / a.height - b.width / b.height) < 0.01;
