import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./aiDisclosure.ts');
const media = (id: string, o: any = {}) => ({ id, name: id + '.mp4', type: 'video', url: '', source: 'upload', ...o }) as any;
const clip = (id: string, mediaId: string, start: number, end: number, o: any = {}) => ({ id, mediaId, trackId: 't1', start, end, duration: end - start, speed: 1, effect: null, ...o }) as any;

test('classifyOrigin: generated is AI, processing and stock are not, uploads are unknown, your mark wins', async () => {
  const { classifyOrigin } = await load();
  assert.equal(classifyOrigin({ source: 'generated', generatedBy: 'Veo 3.1 Fast' } as any).kind, 'ai');
  assert.equal(classifyOrigin({ source: 'generated' } as any).kind, 'ai');
  assert.equal(classifyOrigin({ source: 'generated', generatedBy: 'Custom DSP Mastering' } as any).kind, 'not-ai');
  assert.equal(classifyOrigin({ source: 'generated', generatedBy: 'Spotify Auto Master' } as any).kind, 'ai');
  assert.equal(classifyOrigin({ source: 'unsplash' } as any).kind, 'not-ai');
  assert.equal(classifyOrigin({ source: 'upload' } as any).kind, 'unknown');
  assert.equal(classifyOrigin({ source: 'upload', aiOrigin: 'ai' } as any).kind, 'ai');
  assert.equal(classifyOrigin({ source: 'generated', generatedBy: 'Veo', aiOrigin: 'not-ai' } as any).kind, 'not-ai');
});

test('report counts overlapping AI time once and ignores titles and missing media', async () => {
  const { buildDisclosureReport } = await load();
  const items = [media('a', { source: 'generated', generatedBy: 'Veo 3.1 Fast', prompt: 'a fox' }), media('b', { type: 'image', source: 'generated', generatedBy: 'Imagen' }), media('c')];
  const clips = [
    clip('1', 'a', 0, 5),
    clip('2', 'b', 3, 8), // overlaps clip 1 by 2s
    clip('3', 'c', 8, 20),
    clip('4', 'zzz', 0, 30), // media is gone
    clip('5', '', 0, 30, { textConfig: { content: 'Hi' } }), // a title
  ];
  const r = buildDisclosureReport(items, clips);
  assert.equal(r.timelineSeconds, 30);
  assert.equal(r.assets.length, 3);
  assert.equal(r.ai.length, 2);
  assert.equal(r.unchecked.length, 1);
  assert.equal(r.aiSeconds, 8);
  assert.ok(Math.abs(r.aiShare - 8 / 30) < 1e-9);
  assert.deepEqual(r.kinds, { video: true, image: true, audio: false });
});

test('a file used twice at overlapping times is counted once, and uses are listed in order', async () => {
  const { buildDisclosureReport } = await load();
  const r = buildDisclosureReport([media('a', { source: 'generated' })], [clip('2', 'a', 10, 14), clip('1', 'a', 0, 6), clip('3', 'a', 12, 16)]);
  assert.equal(r.assets[0].seconds, 6 + 6);
  assert.deepEqual(r.assets[0].uses.map((u: any) => u.clipId), ['1', '2', '3']);
});

test('an empty or text-only timeline has no AI and no statement', async () => {
  const { buildDisclosureReport, disclosureStatement } = await load();
  const r = buildDisclosureReport([], []);
  assert.equal(r.timelineSeconds, 0);
  assert.equal(r.aiShare, 0);
  assert.equal(disclosureStatement(r), '');
  const manual = buildDisclosureReport([media('c')], [clip('1', 'c', 0, 5)]);
  assert.equal(disclosureStatement(manual), '');
});

test('disclosureStatement names what was AI-made and, in detail, the tools', async () => {
  const { buildDisclosureReport, disclosureStatement } = await load();
  const items = [media('a', { source: 'generated', generatedBy: 'Veo 3.1 Fast' }), media('b', { type: 'audio', source: 'generated', generatedBy: 'ElevenLabs Voiceover' }), media('c', { type: 'video', source: 'generated', generatedBy: 'Veo 3.1 Fast' })];
  const r = buildDisclosureReport(items, [clip('1', 'a', 0, 5), clip('2', 'b', 0, 5), clip('3', 'c', 5, 9)]);
  assert.equal(disclosureStatement(r), 'Made with AI: this video includes AI-generated video and audio.');
  assert.equal(disclosureStatement(r, 'detailed'), 'Made with AI: this video includes AI-generated video and audio. Tools used: Veo 3.1 Fast and ElevenLabs Voiceover.');
  const one = buildDisclosureReport([media('x', { source: 'generated' })], [clip('1', 'x', 0, 3)]);
  assert.equal(disclosureStatement(one), 'Made with AI: this video includes AI-generated video.');
});

test('ledger CSV quotes cells, guards formulas and lists when each file plays', async () => {
  const { buildDisclosureReport, buildUseLedgerCsv, formatTimecode } = await load();
  const items = [media('a', { name: 'fox, "red".mp4', source: 'generated', generatedBy: 'Veo', prompt: '=HYPERLINK("x")' }), media('b')];
  const csv = buildUseLedgerCsv(buildDisclosureReport(items, [clip('1', 'a', 0, 65.5), clip('2', 'b', 70, 75)]));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'File,Type,Origin,Tool or model,Prompt,Seconds on timeline,Plays at');
  assert.match(lines[1], /^"fox, ""red"".mp4",video,AI-generated in this app,Veo,"'=HYPERLINK\(""x""\)",65.5,0:00.0-1:05.5$/);
  assert.match(lines[2], /Imported, origin not checked/);
  assert.equal(formatTimecode(125.04), '2:05.0');
});
