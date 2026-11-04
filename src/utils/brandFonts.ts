import type { BrandFont } from './brandKit';

/**
 * Make a kit's uploaded font files usable by name. Titles are drawn on a canvas, both in the preview and when they are
 * rasterised for export, so registering the font with the document is all it takes.
 */
const registered = new Map<string, string>();

const fingerprint = (font: BrandFont) => `${font.dataUrl.length}:${font.dataUrl.slice(-48)}`;

/** Loads any font not already loaded. Returns the families that could not be read. */
export const loadBrandFonts = async (fonts: BrandFont[]): Promise<string[]> => {
  const failed: string[] = [];
  for (const font of fonts) {
    if (registered.get(font.family) === fingerprint(font)) continue;
    try {
      const face = new FontFace(font.family, `url(${font.dataUrl})`);
      await face.load();
      document.fonts.add(face);
      registered.set(font.family, fingerprint(font));
    } catch {
      failed.push(font.family);
    }
  }
  return failed;
};

export const readFileAsDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Could not read the file.'));
  reader.readAsDataURL(file);
});
