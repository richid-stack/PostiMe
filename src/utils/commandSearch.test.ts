import test from 'node:test';
import assert from 'node:assert/strict';

test('command search ranks and filters', async () => {
  const { rankCommands, scoreCommand } = await import('./commandSearch.ts');
  const commands = [
    { id: 'edit', title: 'Edit Video', hint: 'Timeline, effects, titles', group: 'Go to' },
    { id: 'export', title: 'Download', hint: 'Render and hand off', group: 'Go to', keywords: ['export', 'render'] },
    { id: 'settings', title: 'Open settings', group: 'App' },
    { id: 'sidebar', title: 'Show or hide the sidebar', group: 'App' },
    { id: 'music', title: 'Music', hint: 'Voice, music and mix', group: 'Go to' },
    { id: 'edit-image', title: 'Edit Image', hint: 'Retouch stills', group: 'Go to' },
  ];
  const ids = (q: string) => rankCommands(q, commands).map((c) => c.id);

  assert.deepEqual(ids(''), commands.map((c) => c.id), 'empty query keeps everything in order');
  assert.deepEqual(ids('edit'), ['edit', 'edit-image'], 'title prefix first, order kept for ties');
  assert.equal(ids('exp')[0], 'export', 'finds a command through a keyword');
  assert.equal(ids('render')[0], 'export', 'finds a command through its hint');
  assert.equal(ids('side')[0], 'sidebar', 'word start');
  assert.ok(ids('bar').includes('sidebar'), 'inside a word still matches');
  assert.equal(ids('edv')[0], 'edit', 'letters in order');
  assert.deepEqual(ids('zzzz'), [], 'nothing matches');
  assert.deepEqual(ids('edit video'), ['edit'], 'every word must match');
  assert.deepEqual(ids('EDIT   '), ['edit', 'edit-image'], 'case and spaces do not matter');
  assert.ok(scoreCommand('café', { id: 'c', title: 'Cafe' }) > 0, 'accents are ignored');
  assert.ok(scoreCommand('go', { id: 'x', title: 'Zebra', group: 'Go to' }) > 0, 'group text counts');
  assert.ok(scoreCommand('edit', commands[0]) > scoreCommand('edit', { id: 'x', title: 'Credit', hint: 'x' }), 'a prefix beats a mid-word hit');
});
