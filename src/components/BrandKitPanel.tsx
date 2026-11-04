import React, { useRef, useState } from 'react';
import {
  DEFAULT_BRAND_KIT,
  MAX_FONT_BYTES,
  MAX_LOGO_BYTES,
  familyFromFileName,
  isHexColor,
  normalizeHex,
  type BrandColors,
  type BrandKit,
  type OffBrandFinding,
} from '../utils/brandKit';
import { loadBrandFonts, readFileAsDataUrl } from '../utils/brandFonts';

interface BrandKitPanelProps {
  kit: BrandKit | null;
  onChange: (kit: BrandKit | null) => void;
  titleCount: number;
  selectedIsTitle: boolean;
  offBrand: OffBrandFinding[];
  onApply: (scope: 'selected' | 'all') => void;
  onAddLogo: () => void;
  onSelectClip: (clipId: string | null) => void;
}

const COLOR_ROLES: Array<{ key: keyof BrandColors; label: string; hint: string }> = [
  { key: 'text', label: 'Text', hint: 'Title and caption text' },
  { key: 'plate', label: 'Plate', hint: 'Behind titles and lower thirds' },
  { key: 'primary', label: 'Primary', hint: 'Your main brand colour' },
  { key: 'accent', label: 'Highlight', hint: 'The lit word in animated captions' },
];

const COMMON_FONTS = ['Arial', 'Helvetica', 'Georgia', 'Impact', 'Trebuchet MS', 'Verdana', 'Times New Roman', 'Courier New', 'Inter', 'Montserrat', 'Poppins'];

const BrandKitPanel: React.FC<BrandKitPanelProps> = ({ kit, onChange, titleCount, selectedIsTitle, offBrand, onApply, onAddLogo, onSelectClip }) => {
  const fontInput = useRef<HTMLInputElement>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  if (!kit) {
    return (
      <div className="pk-stack">
        <div className="pk-card">
          <div className="pk-card__head"><span className="pk-card__title">Brand kit</span></div>
          <p className="pk-hint">Set your colours, fonts and logo once, then restyle every title and caption in one click and drop your logo on as a watermark.</p>
          <button type="button" className="edit-text-btn edit-text-btn--primary w-full justify-center" onClick={() => onChange({ ...DEFAULT_BRAND_KIT })}>Create a brand kit</button>
        </div>
      </div>
    );
  }

  const update = (patch: Partial<BrandKit>) => onChange({ ...kit, ...patch });
  const setColor = (key: keyof BrandColors, value: string) => update({ colors: { ...kit.colors, [key]: normalizeHex(value) } });

  const addFont = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error('Choose a .ttf, .otf, .woff or .woff2 font file.');
      if (file.size > MAX_FONT_BYTES) throw new Error(`That font is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FONT_BYTES / 1048576} MB.`);
      const family = familyFromFileName(file.name);
      const dataUrl = await readFileAsDataUrl(file);
      const mime = /\.woff2$/i.test(file.name) ? 'font/woff2' : /\.woff$/i.test(file.name) ? 'font/woff' : /\.otf$/i.test(file.name) ? 'font/otf' : 'font/ttf';
      const font = { family, dataUrl: dataUrl.replace(/^data:[^;]*;/, `data:${mime};`) };
      const failed = await loadBrandFonts([font]);
      if (failed.length) throw new Error(`${file.name} could not be read as a font.`);
      update({ fonts: [...kit.fonts.filter((existing) => existing.family !== family), font] });
      setMessage({ tone: 'ok', text: `Added the font "${family}". Use it for headings or body text below.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add that font.' });
    } finally {
      if (fontInput.current) fontInput.current.value = '';
    }
  };

  const addLogo = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (!/^image\/(png|jpe?g|svg\+xml|webp|gif)$/i.test(file.type)) throw new Error('Choose a PNG, JPG, SVG, WebP or GIF image.');
      if (file.size > MAX_LOGO_BYTES) throw new Error(`That logo is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_LOGO_BYTES / 1048576} MB.`);
      update({ logo: { name: file.name, dataUrl: await readFileAsDataUrl(file) } });
      setMessage({ tone: 'ok', text: `Logo set to ${file.name}.` });
    } catch (error) {
      setMessage({ tone: 'error', text: error instanceof Error ? error.message : 'Could not add that logo.' });
    } finally {
      if (logoInput.current) logoInput.current.value = '';
    }
  };

  return (
    <div className="pk-stack">
      <div className="pk-card">
        <div className="pk-card__head">
          <span className="pk-card__title">Brand kit</span>
          <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => { if (window.confirm('Remove the brand kit from this project? Titles keep their current look.')) onChange(null); }}>Remove</button>
        </div>
        <input className="w-full text-sm" value={kit.name} onChange={(e) => update({ name: e.target.value })} aria-label="Brand name" />

        <p className="pk-hint" style={{ marginTop: 10 }}>Colours</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {COLOR_ROLES.map(({ key, label, hint }) => (
            <label key={key} className="text-xs app-muted" title={hint} style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
              <span>{label}</span>
              <input type="color" value={kit.colors[key]} onChange={(e) => setColor(key, e.target.value)} aria-label={`${label} colour`} style={{ width: 40, height: 32, padding: 0 }} />
              <input
                aria-label={`${label} colour code`}
                className="text-[11px] text-center"
                style={{ width: '100%', minWidth: 0 }}
                defaultValue={kit.colors[key]}
                key={kit.colors[key]}
                onBlur={(e) => { if (isHexColor(e.target.value)) setColor(key, e.target.value); else e.target.value = kit.colors[key]; }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="pk-card">
        <div className="pk-card__head"><span className="pk-card__title">Fonts</span></div>
        <datalist id="brand-fonts">
          {[...kit.fonts.map((font) => font.family), ...COMMON_FONTS].map((family) => <option key={family} value={family} />)}
        </datalist>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-xs app-muted space-y-1 block">Headings
            <input className="w-full text-sm" list="brand-fonts" value={kit.headingFont} onChange={(e) => update({ headingFont: e.target.value })} aria-label="Heading font" />
          </label>
          <label className="text-xs app-muted space-y-1 block">Body and captions
            <input className="w-full text-sm" list="brand-fonts" value={kit.bodyFont} onChange={(e) => update({ bodyFont: e.target.value })} aria-label="Body font" />
          </label>
        </div>
        {kit.fonts.map((font) => (
          <div key={font.family} className="pk-actions" style={{ marginTop: 6, justifyContent: 'space-between' }}>
            <span className="text-sm" style={{ fontFamily: `"${font.family}"` }}>{font.family}</span>
            <span className="pk-actions">
              <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => update({ headingFont: font.family })}>Headings</button>
              <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => update({ bodyFont: font.family })}>Body</button>
              <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => update({ fonts: kit.fonts.filter((f) => f.family !== font.family) })} aria-label={`Remove font ${font.family}`}>Remove</button>
            </span>
          </div>
        ))}
        <input ref={fontInput} type="file" accept=".ttf,.otf,.woff,.woff2" className="hidden" onChange={(e) => void addFont(e.target.files?.[0])} aria-label="Font file" />
        <button type="button" className="edit-text-btn edit-text-btn--outline w-full justify-center" style={{ marginTop: 8 }} onClick={() => fontInput.current?.click()}>Add a font file</button>
        <p className="pk-hint">Font files are saved inside the project. Only add fonts you have the licence to use.</p>
      </div>

      <div className="pk-card">
        <div className="pk-card__head"><span className="pk-card__title">Logo</span></div>
        {kit.logo ? (
          <div className="pk-actions" style={{ alignItems: 'center' }}>
            <img src={kit.logo.dataUrl} alt={kit.logo.name} style={{ maxHeight: 48, maxWidth: 120, objectFit: 'contain', background: 'rgba(128,128,128,.2)', borderRadius: 6, padding: 4 }} />
            <span className="text-xs app-muted truncate" style={{ flex: 1 }}>{kit.logo.name}</span>
            <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => update({ logo: null })}>Remove</button>
          </div>
        ) : <p className="pk-hint">No logo yet.</p>}
        <input ref={logoInput} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif" className="hidden" onChange={(e) => void addLogo(e.target.files?.[0])} aria-label="Logo file" />
        <div className="pk-actions" style={{ marginTop: 8 }}>
          <button type="button" className="edit-text-btn edit-text-btn--outline" onClick={() => logoInput.current?.click()}>{kit.logo ? 'Replace logo' : 'Upload a logo'}</button>
          <button type="button" className="edit-text-btn edit-text-btn--primary" disabled={!kit.logo} onClick={onAddLogo} title="Adds the logo on its own track in the top right, for the whole timeline">Add logo to timeline</button>
        </div>
      </div>

      <div className="pk-card">
        <div className="pk-card__head">
          <span className="pk-card__title">Apply</span>
          <span className="pk-chip">{titleCount} title{titleCount === 1 ? '' : 's'}</span>
        </div>
        <p className="pk-hint">Swaps in the brand's fonts and colours. Size, position, motion and timing stay as they are. New titles from the Presets tab use the brand automatically.</p>
        <div className="pk-actions">
          <button type="button" className="edit-text-btn edit-text-btn--outline" disabled={!selectedIsTitle} onClick={() => onApply('selected')}>To selected title</button>
          <button type="button" className="edit-text-btn edit-text-btn--primary" disabled={titleCount === 0} onClick={() => onApply('all')}>To all titles</button>
        </div>
        {titleCount > 0 && (
          offBrand.length === 0
            ? <div className="pk-alert pk-alert--ok">Every title matches the brand.</div>
            : (
              <div className="pk-alert pk-alert--info">
                {offBrand.length} title{offBrand.length === 1 ? ' is' : 's are'} off brand.
                <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                  {offBrand.slice(0, 5).map((finding) => (
                    <li key={finding.clipId}><button type="button" className="underline" onClick={() => onSelectClip(finding.clipId)}>{finding.reasons[0]}</button></li>
                  ))}
                </ul>
              </div>
            )
        )}
      </div>

      {message && <div className={`pk-alert ${message.tone === 'ok' ? 'pk-alert--ok' : 'pk-alert--danger'}`} role="status">{message.text}</div>}
    </div>
  );
};

export default BrandKitPanel;
