import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./brandKit.ts');

test('kits read from a saved project are cleaned up', async () => {
  const { normalizeBrandKit, DEFAULT_BRAND_KIT } = await load();
  assert.equal(normalizeBrandKit(null), null);
  assert.equal(normalizeBrandKit('nope'), null);
  const kit = normalizeBrandKit({
    name: '  Acme  ', colors: { text: '#fff', plate: 'red', primary: '#123456', accent: '#abcdef' },
    headingFont: 'Bebas Neue', bodyFont: '',
    fonts: [{ family: 'Bebas Neue', dataUrl: 'data:font/ttf;base64,AAAA' }, { family: 'Evil', dataUrl: 'https://x.test/a.ttf' }, 7],
    logo: { name: 'l.png', dataUrl: 'data:image/png;base64,AAAA' },
  })!;
  assert.equal(kit.name, 'Acme');
  assert.equal(kit.colors.text, '#FFFFFF', 'short hex expanded and upper-cased');
  assert.equal(kit.colors.plate, DEFAULT_BRAND_KIT.colors.plate, 'bad colour falls back');
  assert.equal(kit.colors.accent, '#ABCDEF');
  assert.equal(kit.bodyFont, DEFAULT_BRAND_KIT.bodyFont, 'empty font falls back');
  assert.equal(kit.fonts.length, 1, 'only embedded font files are kept');
  assert.equal(kit.logo?.name, 'l.png');
  assert.equal(normalizeBrandKit({ logo: { name: 'x', dataUrl: 'https://x.test/l.png' } })!.logo, null, 'remote logo is dropped');
});

test('applying the brand swaps font and colours, and keeps everything else', async () => {
  const { applyBrandToTextConfig, DEFAULT_BRAND_KIT } = await load();
  const kit = { ...DEFAULT_BRAND_KIT, headingFont: 'Bebas', bodyFont: 'Inter', colors: { text: '#111111', plate: '#FF0000', primary: '#00FF00', accent: '#0000FF' } };
  const title = { content: 'Hi', font: 'Georgia', size: 60, color: '#ffffff', position: 'bottom-left', background: { enabled: true, color: '#020617', opacity: 0.7 } };
  const out = applyBrandToTextConfig(title, kit, 'heading');
  assert.equal(out.font, 'Bebas');
  assert.equal(out.color, '#111111');
  assert.equal(out.background?.color, '#FF0000');
  assert.equal(out.background?.opacity, 0.7, 'plate keeps its opacity');
  assert.equal(out.size, 60);
  assert.equal(out.content, 'Hi');
  assert.equal(applyBrandToTextConfig(title, kit, 'body').font, 'Inter');
  assert.equal(title.font, 'Georgia', 'input is not changed');

  const noPlate = applyBrandToTextConfig({ font: 'A', color: '#fff' }, kit, 'body');
  assert.equal('background' in noPlate, false, 'no plate is not invented');
  const caption = applyBrandToTextConfig({ font: 'A', color: '#fff', captionStyle: { mode: 'word-highlight' as const, activeColor: '#FACC15' } }, kit, 'body');
  assert.equal(caption.captionStyle?.activeColor, '#0000FF');
});

test('roles and off-brand findings', async () => {
  const { titleRole, findOffBrandTitles, DEFAULT_BRAND_KIT } = await load();
  const kit = { ...DEFAULT_BRAND_KIT, headingFont: 'Bebas', bodyFont: 'Inter', colors: { text: '#FFFFFF', plate: '#C2683F', primary: '#1F1B18', accent: '#FACC15' } };
  assert.equal(titleRole({ id: 'a', textConfig: { font: 'x', color: '#fff' } }), 'heading');
  assert.equal(titleRole({ id: 'a', textConfig: { font: 'x', color: '#fff' }, subtitleSegment: {} }), 'body');
  assert.equal(titleRole({ id: 'a', textConfig: { font: 'x', color: '#fff', captionStyle: { mode: 'word-highlight', activeColor: '#f00' } } }), 'body');

  const clips = [
    { id: 'ok', textConfig: { font: 'bebas', color: '#ffffff', background: { color: '#c2683f' } } },
    { id: 'font', textConfig: { font: 'Comic Sans MS', color: '#FFFFFF' } },
    { id: 'colour', textConfig: { font: 'Bebas', color: '#12AB34', background: { color: '#020617' } } },
    { id: 'sub', textConfig: { font: 'Inter', color: '#FFF' }, subtitleSegment: {} },
    { id: 'video' },
  ];
  const found = findOffBrandTitles(clips, kit);
  assert.deepEqual(found.map((f) => f.clipId), ['font', 'colour']);
  assert.equal(found[1].reasons.length, 2, 'text and plate colour both flagged');
});

test('family names from file names', async () => {
  const { familyFromFileName } = await load();
  assert.equal(familyFromFileName('Brand-Bold_v2.ttf'), 'Brand Bold v2');
  assert.equal(familyFromFileName('.ttf'), 'Brand font');
});
