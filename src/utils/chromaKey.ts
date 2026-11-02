/**
 * Chroma key maths shared by the timeline preview (WebGL shader and CPU fallback) and the HQ export
 * (FFmpeg `chromakey` + `despill`, see electron/ffmpeg-chroma.js), so a clip keys the same way on screen and in the file.
 *
 * Keying works on chroma only (Cb/Cr), not RGB distance, so a green screen that is lit unevenly
 * (light and dark patches of the same green) still keys as one colour.
 * The distance is scaled exactly like FFmpeg's chromakey filter, which lets `similarity` and `blend`
 * mean the same thing in the shader and in the export.
 */

export interface ChromaKeyConfig {
  /** Key colour as #rrggbb. */
  color: string;
  /** 0 to 1. How far from the key colour a pixel can be and still be removed. */
  tolerance: number;
  /** 0 to 1. Width of the soft edge between removed and kept. */
  softness?: number;
  /** 0 to 1. How much key-colour spill is pulled out of the kept pixels. */
  despill?: number;
}

export const DEFAULT_CHROMA_KEY: Required<ChromaKeyConfig> = {
  color: '#00ff00',
  tolerance: 0.35,
  softness: 0.25,
  despill: 0.5,
};

export type SpillChannel = 0 | 1 | 2;

export interface ResolvedChromaKey {
  /** Key colour, 0 to 1 per channel. */
  keyRgb: [number, number, number];
  keyCb: number;
  keyCr: number;
  /** FFmpeg-scale distance under which a pixel is fully removed. */
  similarity: number;
  /** FFmpeg-scale width of the soft edge. */
  blend: number;
  despill: number;
  /** Index of the channel the screen colour lives in: 0 red, 1 green, 2 blue. */
  spillChannel: SpillChannel;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const parseHexColor = (hex: string): [number, number, number] => {
  const normalized = /^#?[0-9a-f]{6}$/i.test(hex.trim()) ? hex.trim().replace('#', '') : '00ff00';
  return [
    parseInt(normalized.slice(0, 2), 16) / 255,
    parseInt(normalized.slice(2, 4), 16) / 255,
    parseInt(normalized.slice(4, 6), 16) / 255,
  ];
};

/** BT.601 full-range chroma, each axis in -0.5 to 0.5. */
export const rgbToCbCr = (r: number, g: number, b: number): [number, number] => [
  -0.168736 * r - 0.331264 * g + 0.5 * b,
  0.5 * r - 0.418688 * g - 0.081312 * b,
];

export const resolveChromaKey = (config: ChromaKeyConfig): ResolvedChromaKey => {
  const keyRgb = parseHexColor(config.color);
  const [keyCb, keyCr] = rgbToCbCr(keyRgb[0], keyRgb[1], keyRgb[2]);
  const spillChannel: SpillChannel = keyRgb[1] >= keyRgb[0] && keyRgb[1] >= keyRgb[2]
    ? 1
    : keyRgb[2] >= keyRgb[0] && keyRgb[2] >= keyRgb[1]
      ? 2
      : 0;
  const tolerance = clamp(Number.isFinite(config.tolerance) ? config.tolerance : DEFAULT_CHROMA_KEY.tolerance, 0, 1);
  const softness = clamp(config.softness ?? DEFAULT_CHROMA_KEY.softness, 0, 1);
  const despill = clamp(config.despill ?? DEFAULT_CHROMA_KEY.despill, 0, 1);
  return {
    keyRgb,
    keyCb,
    keyCr,
    similarity: tolerance * 0.5,
    blend: softness * 0.3,
    despill,
    spillChannel,
  };
};

/** Alpha for one pixel: 0 where the screen was, 1 on the subject, in between on the edge. */
export const keyAlpha = (r: number, g: number, b: number, key: ResolvedChromaKey): number => {
  const [cb, cr] = rgbToCbCr(r, g, b);
  const diff = Math.hypot(cb - key.keyCb, cr - key.keyCr) / Math.SQRT2;
  if (key.blend > 0.0001) return clamp((diff - key.similarity) / key.blend, 0, 1);
  return diff > key.similarity ? 1 : 0;
};

/** Pull the screen colour out of a kept pixel: the key channel may not exceed the larger of the other two. */
export const despillPixel = (
  r: number,
  g: number,
  b: number,
  key: ResolvedChromaKey,
): [number, number, number] => {
  if (key.despill <= 0) return [r, g, b];
  const rgb: [number, number, number] = [r, g, b];
  const k = key.spillChannel;
  const others = [0, 1, 2].filter((index) => index !== k);
  const limit = Math.max(rgb[others[0]], rgb[others[1]]);
  const excess = Math.max(0, rgb[k] - limit);
  rgb[k] = rgb[k] - excess * key.despill;
  return rgb;
};

/** CPU keyer over RGBA bytes. Used when WebGL is unavailable, and by tests. */
export const applyChromaKeyToImageData = (data: Uint8ClampedArray, config: ChromaKeyConfig): void => {
  const key = resolveChromaKey(config);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;
    const alpha = keyAlpha(r, g, b, key);
    const [dr, dg, db] = despillPixel(r, g, b, key);
    data[i] = Math.round(dr * 255);
    data[i + 1] = Math.round(dg * 255);
    data[i + 2] = Math.round(db * 255);
    data[i + 3] = Math.round(data[i + 3] * alpha);
  }
};
