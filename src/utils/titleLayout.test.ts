import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./titleLayout.ts');

// Every character is half the font size wide, which keeps the numbers easy to check by hand.
const fakeCtx = () => {
  const ctx = {
    font: '',
    measureText(text: string) {
      const size = Number(/^(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 10);
      return { width: text.length * size * 0.5 } as TextMetrics;
    },
  };
  return ctx;
};

const config = (overrides: Record<string, unknown> = {}) => ({
  content: 'Hello',
  font: 'Arial',
  size: 100,
  color: '#ffffff',
  position: 'center' as const,
  ...overrides,
});

test('layoutTitle returns null when there is no text', async () => {
  const { layoutTitle } = await load();
  assert.equal(layoutTitle(fakeCtx(), config({ content: '  \n ' }), 1920, 1080), null);
});

test('layoutTitle centres the block and sizes it from the longest line', async () => {
  const { layoutTitle } = await load();
  const layout = layoutTitle(fakeCtx(), config({ content: 'Hi\nHello there' }), 1920, 1080)!;
  assert.deepEqual(layout.lines, ['Hi', 'Hello there']);
  assert.equal(layout.maxLineWidth, 11 * 50);
  assert.ok(Math.abs(layout.lineHeight - 112) < 1e-9);
  assert.ok(Math.abs(layout.totalHeight - 224) < 1e-9);
  assert.equal(layout.baseBlockX, (1920 - 550) / 2);
  assert.ok(Math.abs(layout.baseBlockY - (1080 - 224) / 2) < 1e-9);
});

test('position presets pin the block to the 8 and 92 percent margins', async () => {
  const { layoutTitle } = await load();
  const topLeft = layoutTitle(fakeCtx(), config({ position: 'top-left' }), 1000, 500)!;
  assert.equal(topLeft.baseBlockX, 80);
  assert.equal(topLeft.baseBlockY, 40);
  const bottomRight = layoutTitle(fakeCtx(), config({ position: 'bottom-right' }), 1000, 500)!;
  assert.equal(bottomRight.baseBlockX, 920 - bottomRight.maxLineWidth);
  assert.equal(bottomRight.baseBlockY, 450 - bottomRight.totalHeight);
});

test('auto contrast flips colours by the brightness behind the title, and null keeps the configured ones', async () => {
  const { resolveTitleColors } = await load();
  const withPlate = config({ background: { enabled: true, color: '#ff0000', opacity: 0.2, paddingX: 10, paddingY: 10, radius: 4 } });
  assert.equal(resolveTitleColors(withPlate, null).text, '#ffffff');
  assert.equal(resolveTitleColors(withPlate, null).background?.color, '#ff0000');
  const onBright = resolveTitleColors(withPlate, 0.9);
  assert.equal(onBright.text, '#0f172a');
  assert.equal(onBright.background?.color, '#f8fafc');
  assert.equal(onBright.background?.opacity, 0.78);
  const onDark = resolveTitleColors(withPlate, 0.1);
  assert.equal(onDark.text, '#f8fafc');
  assert.equal(onDark.background?.color, '#020617');
  assert.equal(onDark.background?.opacity, 0.72);
  // the caller's config is not changed
  assert.equal(withPlate.background.color, '#ff0000');
});

test('the title image is centred on the block and covers the plate', async () => {
  const { planTitleRaster } = await load();
  const plain = planTitleRaster(fakeCtx(), config(), 1920, 1080)!;
  // text 250 wide, 112 high, margin 30 each side: half extents 155 and 86
  assert.equal(plain.width, 310);
  assert.equal(plain.height, 172);
  assert.ok(Math.abs(plain.centerX - 50) < 1e-9);
  assert.ok(Math.abs(plain.centerY - 50) < 1e-9);

  const plate = planTitleRaster(fakeCtx(), config({ background: { enabled: true, color: '#000', opacity: 0.5, paddingX: 100, paddingY: 40, radius: 8 } }), 1920, 1080)!;
  assert.equal(plate.width, 450);
  assert.equal(plate.height, 192);
});

test('a lower-third bar widens the image and the image stays centred on the text block', async () => {
  const { planTitleRaster } = await load();
  const plan = planTitleRaster(fakeCtx(), config({
    position: 'bottom-left',
    background: { enabled: true, color: '#000', opacity: 0.5, paddingX: 20, paddingY: 10, radius: 0, style: 'lower-third-bar' },
  }), 1920, 1080)!;
  // the bar is 42 percent of the canvas (806 px) and starts 20 px left of the block, so it ends 661 px right of the block middle
  assert.ok(plan.width >= 2 * 661, `width ${plan.width}`);
  assert.ok(plan.centerX < 50 && plan.centerY > 50);
  assert.equal(plan.width % 2, 0);
  assert.equal(plan.height % 2, 0);
});

test('a disabled plate does not widen the image', async () => {
  const { planTitleRaster } = await load();
  const off = planTitleRaster(fakeCtx(), config({ background: { enabled: false, color: '#000', opacity: 0.5, paddingX: 400, paddingY: 400, radius: 0 } }), 1920, 1080)!;
  assert.equal(off.width, 310);
});
