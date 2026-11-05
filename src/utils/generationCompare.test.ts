import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('./generationCompare.ts');
const text = (tokens: any[], kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text).join(' ');

test('diffPrompts marks added and removed words and keeps the shared ones in order', async () => {
  const { diffPrompts } = await load();
  const d = diffPrompts('a red fox in snow', 'a grey fox in deep snow');
  assert.equal(text(d, 'removed'), 'red');
  assert.equal(text(d, 'added'), 'grey deep');
  assert.equal(text(d, 'same'), 'a fox in snow');
  assert.deepEqual(d.map((t: any) => t.text).filter((_: string, i: number) => d[i].kind !== 'added'), ['a', 'red', 'fox', 'in', 'snow']);
});

test('diffPrompts of equal, empty and one-sided prompts', async () => {
  const { diffPrompts } = await load();
  assert.ok(diffPrompts('same words', 'same   words').every((t: any) => t.kind === 'same'));
  assert.deepEqual(diffPrompts('', ''), []);
  assert.equal(text(diffPrompts('', 'new prompt'), 'added'), 'new prompt');
  assert.equal(text(diffPrompts('old prompt', ''), 'removed'), 'old prompt');
});

test('diffPrompts copes with very long prompts', async () => {
  const { diffPrompts } = await load();
  const long = Array.from({ length: 700 }, (_, i) => 'w' + i).join(' ');
  const d = diffPrompts(long, long + ' extra');
  assert.ok(d.length > 0);
});

test('diffSettings lines up by label and flags only real changes', async () => {
  const { diffSettings } = await load();
  const rows = diffSettings([['Model', 'Imagen'], ['Ratio', '16:9'], ['Style', 'Noir']], [['Model', 'Imagen'], ['Ratio', '9:16'], ['Seed', '42']]);
  assert.deepEqual(rows.map((r: any) => [r.label, r.changed]), [['Model', false], ['Ratio', true], ['Style', true], ['Seed', true]]);
  assert.equal(rows.find((r: any) => r.label === 'Style').b, '—');
});

test('addToHistory keeps pinned entries past the limit and newest first', async () => {
  const { addToHistory, togglePin } = await load();
  let h: any[] = [];
  for (let i = 1; i <= 5; i++) h = addToHistory(h, { id: 'e' + i }, 3);
  assert.deepEqual(h.map((e) => e.id), ['e5', 'e4', 'e3']);
  h = togglePin(h, 'e3');
  for (let i = 6; i <= 9; i++) h = addToHistory(h, { id: 'e' + i }, 3);
  assert.deepEqual(h.map((e) => e.id), ['e9', 'e8', 'e7', 'e3']);
  h = togglePin(h, 'e3');
  assert.equal(h.find((e) => e.id === 'e3').pinned, false);
});

test('addToHistory replaces an entry with the same id rather than duplicating it', async () => {
  const { addToHistory } = await load();
  const h = addToHistory(addToHistory([], { id: 'a', v: 1 } as any, 5), { id: 'a', v: 2 } as any, 5);
  assert.equal(h.length, 1);
  assert.equal((h[0] as any).v, 2);
});

test('pickForCompare keeps the two latest picks and toggles off', async () => {
  const { pickForCompare } = await load();
  assert.deepEqual(pickForCompare([], 'a'), ['a']);
  assert.deepEqual(pickForCompare(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(pickForCompare(['a', 'b'], 'c'), ['b', 'c']);
  assert.deepEqual(pickForCompare(['a', 'b'], 'a'), ['b']);
});
