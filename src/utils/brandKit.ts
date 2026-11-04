/**
 * Brand kit: the colours, fonts and logo a project uses, applied to titles and captions in one go.
 * Pure logic only (no DOM) so it can be tested; fonts are loaded in brandFonts.ts.
 */

export interface BrandColors {
  /** Title and caption text. */
  text: string;
  /** Main brand colour: the plate behind titles and lower thirds. */
  plate: string;
  /** Second brand colour. */
  primary: string;
  /** Highlight: the lit word in animated captions. */
  accent: string;
}

export interface BrandFont {
  /** The name the font is used under in titles. */
  family: string;
  /** The font file as a data URL, so it travels with the project. */
  dataUrl: string;
}

export interface BrandLogo {
  name: string;
  /** The image as a data URL, so it travels with the project. */
  dataUrl: string;
}

export interface BrandKit {
  name: string;
  colors: BrandColors;
  headingFont: string;
  bodyFont: string;
  /** Uploaded font files. Fonts named in headingFont/bodyFont that are not here are taken from the computer. */
  fonts: BrandFont[];
  logo: BrandLogo | null;
}

export const DEFAULT_BRAND_KIT: BrandKit = {
  name: 'My brand',
  colors: { text: '#FFFFFF', plate: '#C2683F', primary: '#1F1B18', accent: '#FACC15' },
  headingFont: 'Impact',
  bodyFont: 'Arial',
  fonts: [],
  logo: null,
};

export const MAX_FONT_BYTES = 2 * 1024 * 1024;
export const MAX_LOGO_BYTES = 4 * 1024 * 1024;

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX.test(value.trim());

/** "#abc" and "#ABCDEF" both become "#AABBCC" style upper case six-digit hex, so colours compare. */
export const normalizeHex = (value: string): string => {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  return `#${full.toUpperCase()}`;
};

const cleanString = (value: unknown, fallback: string, max = 80): string =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : fallback;

const cleanColor = (value: unknown, fallback: string): string => (isHexColor(value) ? normalizeHex(value) : fallback);

const isDataUrl = (value: unknown, kind: 'font' | 'image'): value is string =>
  typeof value === 'string' && (kind === 'image' ? /^data:image\/(png|jpe?g|svg\+xml|webp|gif);/i.test(value) : /^data:(font\/|application\/(font|x-font|octet-stream|vnd\.ms-fontobject)|application\/x-font)/i.test(value));

/** A kit read from a saved project (or null when the project has none). Bad fields fall back to the defaults. */
export const normalizeBrandKit = (value: unknown): BrandKit | null => {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const colors = (raw.colors && typeof raw.colors === 'object' ? raw.colors : {}) as Record<string, unknown>;
  const fonts = Array.isArray(raw.fonts)
    ? raw.fonts
        .filter((font): font is BrandFont => Boolean(font) && typeof (font as BrandFont).family === 'string' && isDataUrl((font as BrandFont).dataUrl, 'font'))
        .map((font) => ({ family: cleanString(font.family, 'Brand font', 60), dataUrl: font.dataUrl }))
    : [];
  const logoRaw = raw.logo as Partial<BrandLogo> | null | undefined;
  const logo = logoRaw && isDataUrl(logoRaw.dataUrl, 'image') ? { name: cleanString(logoRaw.name, 'logo', 120), dataUrl: logoRaw.dataUrl } : null;
  return {
    name: cleanString(raw.name, DEFAULT_BRAND_KIT.name, 60),
    colors: {
      text: cleanColor(colors.text, DEFAULT_BRAND_KIT.colors.text),
      plate: cleanColor(colors.plate, DEFAULT_BRAND_KIT.colors.plate),
      primary: cleanColor(colors.primary, DEFAULT_BRAND_KIT.colors.primary),
      accent: cleanColor(colors.accent, DEFAULT_BRAND_KIT.colors.accent),
    },
    headingFont: cleanString(raw.headingFont, DEFAULT_BRAND_KIT.headingFont, 60),
    bodyFont: cleanString(raw.bodyFont, DEFAULT_BRAND_KIT.bodyFont, 60),
    fonts,
    logo,
  };
};

type TextConfigLike = {
  font: string;
  color: string;
  background?: { color?: string; [key: string]: unknown } | null;
  captionStyle?: { mode: 'word-highlight'; activeColor: string } | null;
  [key: string]: unknown;
};

export type TitleRole = 'heading' | 'body';

/** The text styling with the brand's font, text colour, plate colour and caption highlight swapped in. */
export const applyBrandToTextConfig = <T extends TextConfigLike>(config: T, kit: BrandKit, role: TitleRole): T => ({
  ...config,
  font: role === 'heading' ? kit.headingFont : kit.bodyFont,
  color: kit.colors.text,
  ...(config.background ? { background: { ...config.background, color: kit.colors.plate } } : {}),
  ...(config.captionStyle ? { captionStyle: { ...config.captionStyle, activeColor: kit.colors.accent } } : {}),
});

interface ClipLike {
  id: string;
  textConfig?: TextConfigLike | null;
  subtitleSegment?: unknown;
}

/** Subtitles and captions are body text; every other title is a heading. */
export const titleRole = (clip: ClipLike): TitleRole => (clip.subtitleSegment || clip.textConfig?.captionStyle ? 'body' : 'heading');

export interface OffBrandFinding {
  clipId: string;
  reasons: string[];
}

const sameFont = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Titles whose font or colours are not the brand's. Titles with no text are ignored. */
export const findOffBrandTitles = (clips: ClipLike[], kit: BrandKit): OffBrandFinding[] => {
  const findings: OffBrandFinding[] = [];
  for (const clip of clips) {
    const config = clip.textConfig;
    if (!config) continue;
    const reasons: string[] = [];
    const role = titleRole(clip);
    const wanted = role === 'heading' ? kit.headingFont : kit.bodyFont;
    if (!sameFont(config.font, wanted)) reasons.push(`font is ${config.font}, not ${wanted}`);
    const palette = [kit.colors.text, kit.colors.plate, kit.colors.primary, kit.colors.accent].map(normalizeHex);
    if (isHexColor(config.color) && !palette.includes(normalizeHex(config.color))) reasons.push(`text colour ${normalizeHex(config.color)} is not in the kit`);
    if (config.background?.color && isHexColor(config.background.color) && !palette.includes(normalizeHex(config.background.color))) {
      reasons.push(`plate colour ${normalizeHex(config.background.color)} is not in the kit`);
    }
    if (reasons.length) findings.push({ clipId: clip.id, reasons });
  }
  return findings;
};

/** Family name for an uploaded file: "Brand-Bold_v2.ttf" becomes "Brand Bold v2". */
export const familyFromFileName = (fileName: string): string => {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || 'Brand font').slice(0, 60);
};
