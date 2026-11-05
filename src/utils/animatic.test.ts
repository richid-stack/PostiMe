import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./animatic.ts');
const shot = (n: number, o: any = {}) => ({ shot: n, prompt: '', description: '', characters: [], environment: null, ...o }) as any;

test('shots come out in order, with scene labels, and the ones with no picture are skipped with a reason', async () => {
  const { planAnimatic } = await load();
  const plan = planAnimatic([shot(3, { imageUrl: 'c.png' }), shot(1, { imageUrl: 'a.png', sceneNumber: 2, sceneShotNumber: 1 }), shot(2, {})]);
  assert.deepEqual(plan.beats.map((b: any) => b.shot), [1, 3]);
  assert.equal(plan.beats[0].label, 'Scene 2 · Shot 1');
  assert.equal(plan.beats[1].label, 'Shot 3');
  assert.deepEqual(plan.skipped, [{ shot: 2, label: 'Shot 2', reason: 'No picture yet' }]);
});

test('a picture with no words is held for the default length', async () => {
  const { planAnimatic } = await load();
  const plan = planAnimatic([shot(1, { imageUrl: 'a.png' })], { defaultSeconds: 4 });
  assert.equal(plan.beats[0].seconds, 4);
  assert.equal(plan.beats[0].basis, 'default');
  assert.equal(plan.totalSeconds, 4);
});

test('a voiceover recording times its shot, plus a pause; words time it when there is no recording yet', async () => {
  const { planAnimatic } = await load();
  const withAudio = planAnimatic([shot(1, { imageUrl: 'a.png', voiceoverUrl: 'v.mp3', voiceoverText: 'hello there' })], {}, { audioSeconds: { 1: 5.1 } });
  assert.equal(withAudio.beats[0].basis, 'recording');
  assert.equal(withAudio.beats[0].seconds, 5.5);
  assert.equal(withAudio.beats[0].audioUrl, 'v.mp3');
  const words = Array.from({ length: 26 }, () => 'word').join(' ');
  const byWords = planAnimatic([shot(1, { imageUrl: 'a.png', voiceoverText: words })]);
  assert.equal(byWords.beats[0].basis, 'words');
  assert.equal(byWords.beats[0].seconds, 10.4); // 26 / 2.6 + 0.4
});

test('lengths are kept between the minimum and the maximum', async () => {
  const { planAnimatic } = await load();
  assert.equal(planAnimatic([shot(1, { imageUrl: 'a', voiceoverText: 'hi' })]).beats[0].seconds, 1.5);
  const long = Array.from({ length: 200 }, () => 'w').join(' ');
  assert.equal(planAnimatic([shot(1, { imageUrl: 'a', voiceoverText: long })]).beats[0].seconds, 12);
});

test('a generated video is used when preferred and keeps its own length', async () => {
  const { planAnimatic } = await load();
  const s = shot(1, { imageUrl: 'a.png', videoUrl: 'a.mp4', voiceoverText: 'a few words here' });
  const video = planAnimatic([s], {}, { videoSeconds: { 1: 6.2 } });
  assert.equal(video.beats[0].kind, 'video');
  assert.equal(video.beats[0].url, 'a.mp4');
  assert.equal(video.beats[0].seconds, 6.2);
  assert.equal(video.beats[0].basis, 'video');
  const still = planAnimatic([s], { preferVideo: false });
  assert.equal(still.beats[0].kind, 'image');
  assert.equal(still.beats[0].url, 'a.png');
  const onlyVideo = planAnimatic([shot(2, { videoUrl: 'b.mp4' })], { preferVideo: false });
  assert.equal(onlyVideo.beats[0].kind, 'video');
});

test('voiceover can be left out', async () => {
  const { planAnimatic } = await load();
  const plan = planAnimatic([shot(1, { imageUrl: 'a', voiceoverUrl: 'v.mp3', voiceoverText: 'some words in a line' })], { includeVoiceover: false, defaultSeconds: 3 });
  assert.equal(plan.beats[0].audioUrl, undefined);
  assert.equal(plan.beats[0].basis, 'default');
});

test('only the chosen shots are included, and beatStarts runs them one after another', async () => {
  const { planAnimatic, beatStarts } = await load();
  const shots = [shot(1, { imageUrl: 'a' }), shot(2, { imageUrl: 'b' }), shot(3, { imageUrl: 'c' })];
  const plan = planAnimatic(shots, { defaultSeconds: 2 }, { only: [1, 3] });
  assert.deepEqual(plan.beats.map((b: any) => b.shot), [1, 3]);
  assert.deepEqual(beatStarts(plan.beats, 10), [10, 12]);
});
